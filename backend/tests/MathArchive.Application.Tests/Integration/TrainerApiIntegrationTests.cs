using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class TrainerApiIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    private const string Html = "<!doctype html><html><head><style>body{color:navy}</style></head><body><input id='answer'><button onclick=\"document.body.dataset.result='ok'\">Check</button><script>const exercise = 2 + 3;</script></body></html>";
    public Task InitializeAsync() => fixture.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task ExportBrowserFixture_UsesRealUploadAndContentResponse()
    {
        using var reader = new StreamReader(typeof(TrainerApiIntegrationTests).Assembly.GetManifestResourceStream("MathArchive.Application.Tests.Fixtures.trainer-security.html")!);
        var html = await reader.ReadToEndAsync();
        using var admin = await fixture.CreateAuthorizedClientAsync();
        using var upload = Form(html);
        var uploaded = await admin.PostAsync("/api/admin/documents", upload);
        uploaded.EnsureSuccessStatusCode();
        var dto = (await uploaded.Content.ReadFromJsonAsync<DocumentDto>(fixture.JsonOptions))!;
        await using var factory = fixture.CreateFactoryWithConnectionString(fixture.ConnectionString, fixture.StorageRoot)
            .WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> {
                ["Trainers:ContentOrigin"] = "https://trainers.example.net", ["AllowedOrigins:0"] = "http://localhost:4187"
            })));
        using var isolated = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://trainers.example.net") });
        var response = await isolated.GetAsync($"/api/trainer-content/{dto.Id}");
        response.EnsureSuccessStatusCode();
        Assert.Contains("frame-ancestors http://localhost:4187", string.Join(";", response.Headers.GetValues("Content-Security-Policy")));
        var path = Environment.GetEnvironmentVariable("TRAINER_BROWSER_FIXTURE_PATH");
        if (!string.IsNullOrEmpty(path))
            await File.WriteAllTextAsync(path, System.Text.Json.JsonSerializer.Serialize(new {
                html = await response.Content.ReadAsStringAsync(),
                headers = response.Headers.Concat(response.Content.Headers).ToDictionary(x => x.Key, x => string.Join(", ", x.Value))
            }));
    }

    [Fact]
    public async Task UnpublishedTrainer_IsPrivateUntilAdministratorPublishesIt()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync();
        using var form = Form();
        form.Add(new StringContent("false"), "trainerPublished");
        var created = await admin.PostAsync("/api/admin/documents", form);
        created.EnsureSuccessStatusCode();
        var document = (await created.Content.ReadFromJsonAsync<DocumentDto>(fixture.JsonOptions))!;
        Assert.False(document.TrainerPublished);
        Assert.False((await fixture.FindDocumentAsync(document.Id))!.TrainerPublished);
        using var anonymous = fixture.CreateClient();
        var limits = await anonymous.GetFromJsonAsync<Dictionary<string, int>>("/api/documents/trainer-limits");
        Assert.Equal(1048576, limits!["maximumFileSize"]);
        foreach (var suffix in new[] { "", "/trainer", "/preview", "/download" })
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/documents/{document.Id}{suffix}")).StatusCode);
        var list = await anonymous.GetFromJsonAsync<PagedResult<DocumentDto>>("/api/documents?grade=5&includeUnpublished=true", fixture.JsonOptions);
        Assert.DoesNotContain(list!.Items, x => x.Id == document.Id);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/documents/{document.Id}")).StatusCode);
        // Admin preview must never serve a draft as executable application-origin HTML either.
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/documents/{document.Id}/preview")).StatusCode);
        await using var factory = fixture.CreateFactoryWithConnectionString(fixture.ConnectionString, fixture.StorageRoot)
            .WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Trainers:ContentOrigin"] = "https://trainers.example.net" })));
        using var isolated = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://trainers.example.net") });
        Assert.Equal(HttpStatusCode.NotFound, (await isolated.GetAsync($"/api/trainer-content/{document.Id}")).StatusCode);
        using var published = Form();
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsync($"/api/admin/documents/{document.Id}", published)).StatusCode);
        Assert.True((await fixture.FindDocumentAsync(document.Id))!.TrainerPublished);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/documents/{document.Id}")).StatusCode);
    }

    [Fact]
    public async Task TrainerLifecycle_MultiGradePublicAccessIsolationReplacementAndDeletion()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync();
        using var form = Form();
        var created = await admin.PostAsync("/api/admin/documents", form);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var dto = (await created.Content.ReadFromJsonAsync<DocumentDto>(fixture.JsonOptions))!;
        Assert.NotNull(dto.TrainerGrades);
        Assert.Equal([5, 7], dto.TrainerGrades);
        var stored = (await fixture.FindDocumentAsync(dto.Id))!;
        var originalPath = Path.Combine(fixture.StorageRoot, stored.StoredFileName);
        Assert.Equal(Html, await File.ReadAllTextAsync(originalPath));
        using var anonymous = fixture.CreateClient();
        foreach (var grade in new[] { 5, 7 })
        {
            var list = await anonymous.GetFromJsonAsync<PagedResult<DocumentDto>>($"/api/documents?grade={grade}&documentType=InteractiveTrainer", fixture.JsonOptions);
            Assert.Contains(list!.Items, x => x.Id == dto.Id);
        }
        var other = await anonymous.GetFromJsonAsync<PagedResult<DocumentDto>>("/api/documents?grade=6&documentType=InteractiveTrainer", fixture.JsonOptions);
        Assert.DoesNotContain(other!.Items, x => x.Id == dto.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync($"/api/documents/{dto.Id}/preview")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/trainer-content/{dto.Id}")).StatusCode);
        var unavailable = await anonymous.GetAsync($"/api/documents/{dto.Id}/trainer");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, unavailable.StatusCode);
        var problem = await unavailable.Content.ReadFromJsonAsync<Microsoft.AspNetCore.Mvc.ProblemDetails>();
        Assert.Equal("TrainerHostingNotConfigured", problem!.Title);
        var download = await anonymous.GetAsync($"/api/documents/{dto.Id}/download");
        Assert.Equal("application/octet-stream", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition!.DispositionType);

        await using var factory = fixture.CreateFactoryWithConnectionString(fixture.ConnectionString, fixture.StorageRoot)
            .WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Trainers:ContentOrigin"] = "https://trainers.example.net" })));
        using var main = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var launch = await main.GetFromJsonAsync<Dictionary<string, string>>($"/api/documents/{dto.Id}/trainer");
        Assert.Equal($"https://trainers.example.net/api/trainer-content/{dto.Id}", launch!["url"]);
        using var isolated = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://trainers.example.net") });
        isolated.DefaultRequestHeaders.Add("Cookie", "fake-session=do-not-expose");
        var content = await isolated.GetAsync($"/api/trainer-content/{dto.Id}");
        Assert.Equal(HttpStatusCode.OK, content.StatusCode);
        Assert.Equal(Html, await content.Content.ReadAsStringAsync());
        var csp = string.Join(";", content.Headers.GetValues("Content-Security-Policy"));
        Assert.Contains("sandbox allow-scripts;", csp);
        Assert.DoesNotContain("allow-same-origin", csp);
        Assert.Contains("connect-src 'none'", csp);
        Assert.Contains("form-action 'none'", csp);
        Assert.Contains("worker-src 'none'", csp);
        Assert.Contains("font-src 'none'", csp);
        Assert.Contains("frame-ancestors https://example.com", csp);
        Assert.True(content.Headers.CacheControl!.NoStore);
        Assert.False(content.Headers.Contains("Set-Cookie"));
        Assert.Equal(HttpStatusCode.NotFound, (await isolated.GetAsync("/api/documents")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await isolated.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = "irrelevant" })).StatusCode);

        using var metadata = new MultipartFormDataContent();
        metadata.Add(new StringContent("Оновлений тренажер"), "title");
        metadata.Add(new StringContent("Ділення"), "topic");
        metadata.Add(new StringContent("InteractiveTrainer"), "documentType");
        metadata.Add(new StringContent("7"), "trainerGrades");
        var metadataResponse = await admin.PutAsync($"/api/admin/documents/{dto.Id}", metadata);
        Assert.Equal(HttpStatusCode.OK, metadataResponse.StatusCode);
        Assert.Equal(stored.StoredFileName, (await fixture.FindDocumentAsync(dto.Id))!.StoredFileName);
        var removedGrade = await anonymous.GetFromJsonAsync<PagedResult<DocumentDto>>("/api/documents?grade=5&documentType=InteractiveTrainer", fixture.JsonOptions);
        Assert.DoesNotContain(removedGrade!.Items, x => x.Id == dto.Id);

        using var replacement = Form(Html.Replace("2 + 3", "4 + 5"), [8]);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsync($"/api/admin/documents/{dto.Id}", replacement)).StatusCode);
        Assert.False(File.Exists(originalPath));
        var updated = (await fixture.FindDocumentAsync(dto.Id))!;
        Assert.Equal([8], updated.TrainerGrades);
        var replacementPath = Path.Combine(fixture.StorageRoot, updated.StoredFileName);
        Assert.True(File.Exists(replacementPath));
        Assert.Equal(Html.Replace("2 + 3", "4 + 5"), await isolated.GetStringAsync($"/api/trainer-content/{dto.Id}"));
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/documents/{dto.Id}")).StatusCode);
        Assert.False(File.Exists(replacementPath));
        Assert.Equal(HttpStatusCode.NotFound, (await isolated.GetAsync($"/api/trainer-content/{dto.Id}")).StatusCode);
    }

    [Fact]
    public async Task TrainerWrites_RequireAdmin()
    {
        foreach (var forbidden in new[] { false, true })
        {
            using var client = forbidden ? fixture.CreateForbiddenClient() : fixture.CreateClient();
            var expected = forbidden ? HttpStatusCode.Forbidden : HttpStatusCode.Unauthorized;
            using var create = Form();
            using var update = Form();
            Assert.Equal(expected, (await client.PostAsync("/api/admin/documents", create)).StatusCode);
            Assert.Equal(expected, (await client.PutAsync($"/api/admin/documents/{Guid.NewGuid()}", update)).StatusCode);
            Assert.Equal(expected, (await client.DeleteAsync($"/api/admin/documents/{Guid.NewGuid()}")).StatusCode);
        }
    }

    [Theory]
    [InlineData("not html", "test.html", "text/html", "InteractiveTrainer", 5)]
    [InlineData(Html, "test.pdf", "application/pdf", "InteractiveTrainer", 5)]
    [InlineData(Html, "test.html", "application/pdf", "InteractiveTrainer", 5)]
    [InlineData(Html, "test.html", "text/html", "Formula", 5)]
    [InlineData(Html, "test.html", "text/html", "InteractiveTrainer", 12)]
    public async Task InvalidTrainer_IsRejectedWithoutStoredFiles(string html, string name, string mime, string type, int grade)
    {
        using var admin = await fixture.CreateAuthorizedClientAsync();
        using var form = Form(html, [grade], name, mime, type);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/documents", form)).StatusCode);
        Assert.Empty(Directory.GetFiles(fixture.StorageRoot));
    }

    private static MultipartFormDataContent Form(string html = Html, int[]? grades = null, string name = "test.html", string mime = "text/html", string type = "InteractiveTrainer")
    {
        var form = new MultipartFormDataContent();
        form.Add(new StringContent("Ділення натуральних чисел"), "title");
        form.Add(new StringContent("Ділення"), "topic");
        form.Add(new StringContent(type), "documentType");
        foreach (var grade in grades ?? [5, 7]) form.Add(new StringContent(grade.ToString()), "trainerGrades");
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(html));
        file.Headers.ContentType = new MediaTypeHeaderValue(mime);
        form.Add(file, "file", name);
        return form;
    }
}
