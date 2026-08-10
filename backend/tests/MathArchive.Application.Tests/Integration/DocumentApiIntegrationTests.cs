using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class DocumentApiIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task UploadDocument_WhenRequestIsValid_PersistsMetadataAndFile()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var content = CreateDocumentForm(title: "Valid upload", grade: 7, topic: "Алгебра", fileBytes: [1, 2, 3, 4]);

        var response = await client.PostAsync("/api/admin/documents", content);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var document = await ReadJsonAsync<DocumentDto>(response);
        Assert.Equal("Valid upload", document.Title);
        Assert.Equal(7, document.Grade);
        Assert.Equal(DocumentType.Formula, document.DocumentType);

        var persisted = await fixture.FindDocumentAsync(document.Id);
        Assert.NotNull(persisted);
        Assert.Equal("material.pdf", persisted.OriginalFileName);
        Assert.True(File.Exists(Path.Combine(fixture.StorageRoot, persisted.StoredFileName)));
    }


    [Fact]
    public async Task GetDocuments_WhenUnfiltered_SortsByGradeBeforeCreatedDate()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var gradeNine = CreateDocumentForm(title: "Grade 9 item", grade: 9);
        using var general = CreateDocumentForm(title: "General sorted item", grade: null);
        using var gradeFive = CreateDocumentForm(title: "Grade 5 item", grade: 5);
        await client.PostAsync("/api/admin/documents", gradeNine);
        await client.PostAsync("/api/admin/documents", general);
        await client.PostAsync("/api/admin/documents", gradeFive);

        var response = await client.GetAsync("/api/documents?page=1&pageSize=12");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await ReadJsonAsync<PagedResult<DocumentDto>>(response);
        var sortedItems = page.Items
            .Where(x => x.Title is "Grade 5 item" or "Grade 9 item" or "General sorted item")
            .ToList();
        Assert.Collection(
            sortedItems,
            item => Assert.Equal(5, item.Grade),
            item => Assert.Equal(9, item.Grade),
            item => Assert.Null(item.Grade));
    }
    [Fact]
    public async Task GetDocuments_WhenFilteredAndPaged_ReturnsExpectedPage()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var first = CreateDocumentForm(title: "Algebra page item", grade: 7, topic: "Алгебра");
        using var second = CreateDocumentForm(title: "Geometry page item", grade: 8, topic: "Геометрія", documentType: DocumentType.Test);
        await client.PostAsync("/api/admin/documents", first);
        await client.PostAsync("/api/admin/documents", second);

        var response = await client.GetAsync("/api/documents?grade=7&page=1&pageSize=1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await ReadJsonAsync<PagedResult<DocumentDto>>(response);
        Assert.Equal(1, page.Page);
        Assert.Equal(1, page.PageSize);
        Assert.True(page.TotalCount >= 1);
        Assert.Single(page.Items);
        Assert.Equal(7, page.Items[0].Grade);
    }


    [Fact]
    public async Task UploadDocument_WhenGradeIsOmitted_CreatesGeneralMaterial()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var content = CreateDocumentForm(title: "General assessment criteria", grade: null, topic: "Оцінювання", documentType: DocumentType.MethodicalMaterial);

        var response = await client.PostAsync("/api/admin/documents", content);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var document = await ReadJsonAsync<DocumentDto>(response);
        Assert.Null(document.Grade);
        Assert.Equal("Оцінювання", document.Topic);

        var persisted = await fixture.FindDocumentAsync(document.Id);
        Assert.NotNull(persisted);
        Assert.Null(persisted.Grade);
    }

    [Fact]
    public async Task UpdateDocument_WhenGradeSpecificBecomesGeneral_ClearsGrade()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var upload = CreateDocumentForm(title: "Grade specific", grade: 7);
        var uploadResponse = await client.PostAsync("/api/admin/documents", upload);
        var document = await ReadJsonAsync<DocumentDto>(uploadResponse);
        using var update = CreateDocumentForm(title: "Now general", grade: null, topic: "Довідка", documentType: DocumentType.Theory, includeFile: false);

        var response = await client.PutAsync($"/api/admin/documents/{document.Id}", update);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await ReadJsonAsync<DocumentDto>(response);
        Assert.Null(updated.Grade);
        Assert.Equal("Now general", updated.Title);
        Assert.Null((await fixture.FindDocumentAsync(document.Id))?.Grade);
    }

    [Fact]
    public async Task UpdateDocument_WhenGeneralBecomesGradeSpecific_SetsGrade()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var upload = CreateDocumentForm(title: "General material", grade: null);
        var uploadResponse = await client.PostAsync("/api/admin/documents", upload);
        var document = await ReadJsonAsync<DocumentDto>(uploadResponse);
        using var update = CreateDocumentForm(title: "Grade material", grade: 9, topic: "Геометрія", documentType: DocumentType.Test, includeFile: false);

        var response = await client.PutAsync($"/api/admin/documents/{document.Id}", update);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await ReadJsonAsync<DocumentDto>(response);
        Assert.Equal(9, updated.Grade);
        Assert.Equal(9, (await fixture.FindDocumentAsync(document.Id))?.Grade);
    }

    [Fact]
    public async Task GetDocuments_WhenUnfiltered_IncludesGradeSpecificAndGeneralMaterials()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var gradeSpecific = CreateDocumentForm(title: "Grade item", grade: 7);
        using var general = CreateDocumentForm(title: "General item", grade: null, topic: "Довідка");
        await client.PostAsync("/api/admin/documents", gradeSpecific);
        await client.PostAsync("/api/admin/documents", general);

        var response = await client.GetAsync("/api/documents?page=1&pageSize=12");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await ReadJsonAsync<PagedResult<DocumentDto>>(response);
        Assert.Contains(page.Items, x => x.Grade == 7);
        Assert.Contains(page.Items, x => x.Grade is null);
    }

    [Fact]
    public async Task GetDocuments_WhenGeneralOnly_ReturnsGeneralMaterials()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var gradeSpecific = CreateDocumentForm(title: "Grade item", grade: 7);
        using var general = CreateDocumentForm(title: "General item", grade: null, topic: "Довідка");
        await client.PostAsync("/api/admin/documents", gradeSpecific);
        await client.PostAsync("/api/admin/documents", general);

        var response = await client.GetAsync("/api/documents?generalOnly=true&page=1&pageSize=12");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await ReadJsonAsync<PagedResult<DocumentDto>>(response);
        Assert.NotEmpty(page.Items);
        Assert.All(page.Items, item => Assert.Null(item.Grade));
    }

    [Fact]
    public async Task GetDocuments_WhenSearchMatchesGeneralMaterial_ReturnsIt()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var content = CreateDocumentForm(title: "Загальні критерії оцінювання", grade: null, topic: "Оцінювання");
        await client.PostAsync("/api/admin/documents", content);

        var response = await client.GetAsync("/api/documents?search=критерії&page=1&pageSize=12");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await ReadJsonAsync<PagedResult<DocumentDto>>(response);
        Assert.Contains(page.Items, x => x.Title == "Загальні критерії оцінювання" && x.Grade is null);
    }
    [Fact]
    public async Task DownloadDocument_WhenFileExists_ReturnsContentAndIncrementsDownloadCount()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        var bytes = new byte[] { 9, 8, 7, 6 };
        using var upload = CreateDocumentForm(title: "Downloadable", fileBytes: bytes);
        var uploadResponse = await client.PostAsync("/api/admin/documents", upload);
        var document = await ReadJsonAsync<DocumentDto>(uploadResponse);

        var response = await client.GetAsync($"/api/documents/{document.Id}/download");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("material.pdf", response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName ?? string.Empty);
        Assert.Equal(bytes, await response.Content.ReadAsByteArrayAsync());

        var persisted = await fixture.FindDocumentAsync(document.Id);
        Assert.NotNull(persisted);
        Assert.Equal(1, persisted.DownloadCount);
    }

    [Fact]
    public async Task DownloadDocument_WhenDocumentDoesNotExist_ReturnsProblemDetailsNotFound()
    {
        using var client = fixture.CreateClient();

        var response = await client.GetAsync($"/api/documents/{Guid.NewGuid()}/download");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await ReadJsonAsync<ProblemDetails>(response);
        Assert.Equal("Material not found", problem.Title);
        Assert.Equal(StatusCodes.Status404NotFound, problem.Status);
    }

    [Fact]
    public async Task DownloadDocument_WhenPhysicalFileIsMissing_ReturnsControlledNotFoundProblemDetails()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var upload = CreateDocumentForm(title: "Missing physical file");
        var uploadResponse = await client.PostAsync("/api/admin/documents", upload);
        var document = await ReadJsonAsync<DocumentDto>(uploadResponse);
        var persisted = await fixture.FindDocumentAsync(document.Id);
        Assert.NotNull(persisted);
        File.Delete(Path.Combine(fixture.StorageRoot, persisted.StoredFileName));

        var response = await client.GetAsync($"/api/documents/{document.Id}/download");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await ReadJsonAsync<ProblemDetails>(response);
        Assert.Equal("Material file not found", problem.Title);
        Assert.Equal("The file associated with this material is unavailable.", problem.Detail);
        Assert.Equal(StatusCodes.Status404NotFound, problem.Status);
    }

    [Fact]
    public async Task DeleteDocument_WhenDocumentExists_RemovesMetadataAndFile()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var upload = CreateDocumentForm(title: "Delete me");
        var uploadResponse = await client.PostAsync("/api/admin/documents", upload);
        var document = await ReadJsonAsync<DocumentDto>(uploadResponse);
        var persisted = await fixture.FindDocumentAsync(document.Id);
        Assert.NotNull(persisted);
        var filePath = Path.Combine(fixture.StorageRoot, persisted.StoredFileName);
        Assert.True(File.Exists(filePath));

        var response = await client.DeleteAsync($"/api/admin/documents/{document.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await fixture.FindDocumentAsync(document.Id));
        Assert.False(File.Exists(filePath));
    }

    [Fact]
    public async Task DeleteDocument_WhenDocumentDoesNotExist_ReturnsProblemDetailsNotFound()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();

        var response = await client.DeleteAsync($"/api/admin/documents/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await ReadJsonAsync<ProblemDetails>(response);
        Assert.Equal("Material not found", problem.Title);
    }

    [Fact]
    public async Task UploadDocument_WhenFileIsMissing_ReturnsValidationProblemDetails()
    {
        using var client = await fixture.CreateAuthorizedClientAsync();
        using var content = CreateDocumentForm(includeFile: false);

        var response = await client.PostAsync("/api/admin/documents", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await ReadJsonAsync<ValidationProblemDetails>(response);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.Status);
        Assert.Contains("file", problem.Errors.Keys);
    }

    [Fact]
    public async Task AdminEndpoint_WhenUnauthenticated_ReturnsUnauthorizedProblemDetails()
    {
        using var client = fixture.CreateClient();

        var response = await client.PostAsync("/api/admin/documents", CreateDocumentForm());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var problem = await ReadJsonAsync<ProblemDetails>(response);
        Assert.Equal("Unauthorized", problem.Title);
        Assert.Equal(StatusCodes.Status401Unauthorized, problem.Status);
    }

    [Fact]
    public async Task AdminEndpoint_WhenAuthenticatedWithoutAdminRole_ReturnsForbiddenProblemDetails()
    {
        using var client = fixture.CreateForbiddenClient();

        var response = await client.DeleteAsync($"/api/admin/documents/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var problem = await ReadJsonAsync<ProblemDetails>(response);
        Assert.Equal("Forbidden", problem.Title);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.Status);
    }

    [Fact]
    public async Task UploadDocument_WhenFileStorageFails_DoesNotPersistMetadata()
    {
        await using var factory = fixture.CreateFactoryWithStorageFailure(new FailingSaveStorage());
        using var client = await CreateAuthorizedClientAsync(factory);
        using var content = CreateDocumentForm(title: "Storage failure");

        var response = await client.PostAsync("/api/admin/documents", content);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var problem = await ReadJsonAsync<ProblemDetails>(response);
        Assert.Equal(StatusCodes.Status500InternalServerError, problem.Status);
        Assert.Equal(0, await fixture.CountDocumentsAsync());
    }

    [Fact]
    public async Task UploadDocument_WhenDatabaseFailsAfterFileCreation_RemovesNewlyCreatedFile()
    {
        var failureStorageRoot = Path.Combine(Path.GetTempPath(), $"matharchive-db-failure-{Guid.NewGuid():N}");
        await using var factory = fixture.CreateFactoryWithConnectionString("Host=127.0.0.1;Port=1;Database=missing;Username=missing;Password=missing", failureStorageRoot, applyMigrationsOnStartup: false);
        using var client = await CreateAuthorizedClientAsync(factory);
        using var content = CreateDocumentForm(title: "Database failure after file");

        var response = await client.PostAsync("/api/admin/documents", content);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.True(Directory.Exists(failureStorageRoot));
        Assert.Empty(Directory.EnumerateFiles(failureStorageRoot));

        Directory.Delete(failureStorageRoot, recursive: true);
    }

    [Fact]
    public async Task DeleteDocument_WhenFileCleanupFails_StillDeletesDatabaseRecord()
    {
        var storage = new FailingDeleteStorage(fixture.StorageRoot);
        await using var factory = fixture.CreateFactoryWithStorageFailure(storage);
        using var client = await CreateAuthorizedClientAsync(factory);
        using var upload = CreateDocumentForm(title: "Cleanup failure");
        var uploadResponse = await client.PostAsync("/api/admin/documents", upload);
        var document = await ReadJsonAsync<DocumentDto>(uploadResponse);

        var response = await client.DeleteAsync($"/api/admin/documents/{document.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await fixture.FindDocumentAsync(document.Id));
        Assert.True(storage.DeleteWasAttempted);
    }

    private async Task<HttpClient> CreateAuthorizedClientAsync(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsync(
            "/api/auth/login",
            JsonContent.Create(new { username = "admin", password = "admin-password" }));
        response.EnsureSuccessStatusCode();
        var login = await response.Content.ReadFromJsonAsync<LoginResponseForTests>(fixture.JsonOptions)
            ?? throw new InvalidOperationException("Login response was empty.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.Token);
        return client;
    }

    private static MultipartFormDataContent CreateDocumentForm(
        string title = "Integration material",
        int? grade = 7,
        string topic = "Алгебра",
        DocumentType documentType = DocumentType.Formula,
        byte[]? fileBytes = null,
        bool includeFile = true)
    {
        var content = new MultipartFormDataContent
        {
            { new StringContent(title), "Title" },
            { new StringContent("Integration description"), "Description" },
            { new StringContent(topic), "Topic" },
            { new StringContent(documentType.ToString()), "DocumentType" }
        };

        if (grade.HasValue)
        {
            content.Add(new StringContent(grade.Value.ToString()), "Grade");
        }

        if (includeFile)
        {
            var file = new ByteArrayContent(fileBytes ?? [1, 2, 3]);
            file.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
            content.Add(file, "File", "material.pdf");
        }

        return content;
    }

    private async Task<T> ReadJsonAsync<T>(HttpResponseMessage response)
    {
        var value = await response.Content.ReadFromJsonAsync<T>(fixture.JsonOptions);
        return value ?? throw new InvalidOperationException($"Response body could not be parsed as {typeof(T).Name}.");
    }

    private sealed record LoginResponseForTests(string Token);

    private sealed class FailingSaveStorage : IFileStorage
    {
        public Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken)
        {
            throw new IOException("Simulated file save failure.");
        }

        public Task<Stream?> TryOpenReadAsync(string storedFileName, CancellationToken cancellationToken) => Task.FromResult<Stream?>(null);

        public Task DeleteAsync(string storedFileName, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FailingDeleteStorage(string rootPath) : IFileStorage
    {
        public bool DeleteWasAttempted { get; private set; }

        public async Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken)
        {
            Directory.CreateDirectory(rootPath);
            var storedFileName = $"{Guid.NewGuid():N}{Path.GetExtension(originalFileName)}";
            await using var target = File.Create(Path.Combine(rootPath, storedFileName));
            await stream.CopyToAsync(target, cancellationToken);
            return new StoredFileResult(originalFileName, storedFileName, contentType, target.Length);
        }

        public Task<Stream?> TryOpenReadAsync(string storedFileName, CancellationToken cancellationToken)
        {
            return Task.FromResult<Stream?>(File.OpenRead(Path.Combine(rootPath, storedFileName)));
        }

        public Task DeleteAsync(string storedFileName, CancellationToken cancellationToken)
        {
            DeleteWasAttempted = true;
            throw new IOException("Simulated file delete failure.");
        }
    }
}
