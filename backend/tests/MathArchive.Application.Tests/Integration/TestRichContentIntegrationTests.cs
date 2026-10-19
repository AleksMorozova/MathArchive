using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using SkiaSharp;
namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class TestRichContentIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync(); public Task DisposeAsync() => Task.CompletedTask;
    private async Task<HttpResponseMessage> Upload(HttpClient client, byte[] data, string fileName = "diagram.png", string mime = "image/png")
    {
        using var body = new MultipartFormDataContent(); var bytes = new ByteArrayContent(data); bytes.Headers.ContentType = new MediaTypeHeaderValue(mime); body.Add(bytes, "file", fileName);
        return await client.PostAsync("/api/admin/test-images", body);
    }
    [Fact] public async Task Upload_requires_admin_and_validates_actual_content_and_size()
    {
        using var anon = fixture.CreateClient(); using var forbidden = fixture.CreateForbiddenClient(); using var admin = await fixture.CreateAuthorizedClientAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(anon, [1])).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(forbidden, [1])).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(admin, System.Text.Encoding.UTF8.GetBytes("<script>alert(1)</script>"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(admin, new byte[5 * 1024 * 1024 + 1])).StatusCode);
        var response = await Upload(admin, TestImageProcessorTests.Picture(SKEncodedImageFormat.Webp), "graph.webp", "image/webp"); response.EnsureSuccessStatusCode();
        var image = (await response.Content.ReadFromJsonAsync<TestImageDto>(fixture.JsonOptions))!;
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync($"/api/admin/test-images/{image.Id}")).StatusCode);
        Assert.Equal("image/webp", (await admin.GetAsync($"/api/admin/test-images/{image.Id}")).Content.Headers.ContentType!.MediaType);
    }
    [Fact] public async Task Formula_and_images_survive_edit_and_delete_without_leaking_draft_or_answer_key()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync(grade: 7); using var stranger = await fixture.CreateStudentClientAsync(grade: 7);
        var uploaded = await Upload(admin, TestImageProcessorTests.Picture(SKEncodedImageFormat.Png), "../../diagram.png"); uploaded.EnsureSuccessStatusCode();
        var image = (await uploaded.Content.ReadFromJsonAsync<TestImageDto>(fixture.JsonOptions))!;
        var replacement = await Upload(admin, TestImageProcessorTests.Picture(SKEncodedImageFormat.Png)); replacement.EnsureSuccessStatusCode();
        var unused = (await replacement.Content.ReadFromJsonAsync<TestImageDto>(fixture.JsonOptions))!;
        var content = new List<TestContentBlock> { new(TestContentKind.Text, "Розв’яжіть:"), new(TestContentKind.BlockMath, @"x^2-5x+6=0"), new(TestContentKind.Image, ImageId: image.Id, Description: "Графік"), new(TestContentKind.InlineMath, @"\sqrt{2}") };
        var q = new TestQuestion(Guid.NewGuid(), "", QuestionType.SingleChoice, 2, "Пояснення", [new(Guid.NewGuid(), "", true, [new(TestContentKind.Image, ImageId: image.Id)]), new(Guid.NewGuid(), "Інший", false)], [], content);
        var d = new TestDefinition("Геометрія", null, 7, null, new(AnswerVisibility.Never, ShowScore: false), [q]);
        var saved = await admin.PostAsync("/api/admin/tests", JsonContent.Create(d, options: fixture.JsonOptions)); saved.EnsureSuccessStatusCode(); var t = (await saved.Content.ReadFromJsonAsync<AdminTest>(fixture.JsonOptions))!;
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/tests/{t.Id}")).StatusCode);
        var read = await admin.GetFromJsonAsync<AdminTest>($"/api/admin/tests/{t.Id}", fixture.JsonOptions); Assert.Equal(content, read!.Definition.Questions[0].Content);
        (await admin.PostAsync($"/api/admin/tests/{t.Id}/publish?status=Published", null)).EnsureSuccessStatusCode();
        var started = await student.PostAsync($"/api/tests/{t.Id}/attempts", JsonContent.Create(new StartAttempt("Олена", "Тестова", 7, Guid.NewGuid().ToString()), options: fixture.JsonOptions)); started.EnsureSuccessStatusCode();
        var c = (await started.Content.ReadFromJsonAsync<AttemptCredentials>(fixture.JsonOptions))!;
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/test-attempts/{c.Id}/images/{image.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await student.GetAsync($"/api/test-attempts/{c.Id}/images/{unused.Id}")).StatusCode);
        var publicView = await student.GetFromJsonAsync<AttemptView>($"/api/test-attempts/{c.Id}", fixture.JsonOptions); Assert.Equal(content, publicView!.Questions[0].Content); Assert.Single(publicView.Questions[0].Options[0].Content!); Assert.Empty(publicView.Review);
        (await admin.PutAsync($"/api/admin/tests/{t.Id}", JsonContent.Create(d with { Questions = [q with { Content = [new(TestContentKind.Text, "Нове питання")], Options = [new(Guid.NewGuid(), "Нова відповідь", true), new(Guid.NewGuid(), "Інша", false)] }] }, options: fixture.JsonOptions))).EnsureSuccessStatusCode();
        (await student.PutAsync($"/api/test-attempts/{c.Id}/answers", JsonContent.Create(new AnswerInput(q.Id, [q.Options[0].Id], null), options: fixture.JsonOptions))).EnsureSuccessStatusCode();
        (await student.PostAsync($"/api/test-attempts/{c.Id}/submit", null)).EnsureSuccessStatusCode(); (await admin.DeleteAsync($"/api/admin/tests/{t.Id}")).EnsureSuccessStatusCode();
        var historical = await student.GetAsync($"/api/test-attempts/{c.Id}/images/{image.Id}"); historical.EnsureSuccessStatusCode(); Assert.True(historical.Headers.CacheControl?.NoStore); Assert.Equal("image/png", historical.Content.Headers.ContentType!.MediaType);
        var result = await student.GetFromJsonAsync<AttemptView>($"/api/test-attempts/{c.Id}", fixture.JsonOptions); Assert.Equal(content, result!.Questions[0].Content); Assert.Empty(result.Review); Assert.Null(result.EarnedPoints);
        (await admin.GetAsync($"/api/admin/test-images/{image.Id}")).EnsureSuccessStatusCode();
    }
}

