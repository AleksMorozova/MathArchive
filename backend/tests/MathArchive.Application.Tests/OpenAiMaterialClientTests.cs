using System.Net;
using System.Text;
using System.Text.Json;
using MathArchive.Application.Ai;
using MathArchive.Application.Files;
using MathArchive.Infrastructure.Ai;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Tests;

public sealed class OpenAiMaterialClientTests
{
    [Fact]
    public async Task Analyze_SendsRequiredNonNullableTitleAndAllowedTypeSchema()
    {
        string? requestJson = null;
        var handler = new StubHandler(async request =>
        {
            requestJson = await request.Content!.ReadAsStringAsync();
            var structured = JsonSerializer.Serialize(new
            {
                title = "Основи стереометрії", grade = "7", topic = "Стереометрія", type = "Theory",
                description = "Формули: a² + b² = c²", confidence = new { title = .9, grade = .9, topic = .9, type = .9 }
            });
            var body = JsonSerializer.Serialize(new
            {
                output = new[] { new { content = new[] { new { type = "output_text", text = structured } } } },
                usage = new { input_tokens = 10, output_tokens = 5, total_tokens = 15 }
            });
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.openai.test/v1/") };
        var client = new OpenAiMaterialClient(httpClient, Options.Create(new OpenAiOptions
        {
            ApiKey = "test-key", Model = "test-model"
        }));

        var result = await client.AnalyzeAsync(new UploadedFile(new MemoryStream([0xff, 0xd8, 0xff]), "meaningless.jpg", "image/jpeg", 3),
            ["Theory", "Memo"], CancellationToken.None);

        using var request = JsonDocument.Parse(requestJson!);
        Assert.False(request.RootElement.GetProperty("store").GetBoolean());
        var format = request.RootElement.GetProperty("text").GetProperty("format");
        var schema = format.GetProperty("schema");
        var title = schema.GetProperty("properties").GetProperty("title");
        Assert.Equal("string", title.GetProperty("type").GetString());
        Assert.Equal(1, title.GetProperty("minLength").GetInt32());
        Assert.Contains("title", schema.GetProperty("required").EnumerateArray().Select(x => x.GetString()));
        var topic = schema.GetProperty("properties").GetProperty("topic");
        Assert.Equal("string", topic.GetProperty("type").GetString());
        Assert.Equal(1, topic.GetProperty("minLength").GetInt32());
        Assert.False(topic.TryGetProperty("enum", out _));
        var typeValues = schema.GetProperty("properties").GetProperty("type").GetProperty("enum")
            .EnumerateArray().Select(x => x.GetString()!).ToArray();
        Assert.Equal(["Theory", "Memo"], typeValues);
        var instructions = request.RootElement.GetProperty("instructions").GetString()!;
        Assert.Contains("upper part of every image", instructions);
        Assert.Contains("OCR cannot recover an exact heading", instructions);
        Assert.Contains("not instructions", instructions);
        Assert.Contains("base it on the generated title", instructions);
        Assert.Contains("author or teacher names", instructions);
        Assert.Contains("signatures, monograms (including 'МТВ')", instructions);
        Assert.Contains("school or lyceum names", instructions);
        Assert.Contains("social-media usernames", instructions);
        Assert.Contains("watermarks, logos, branding", instructions);
        Assert.Contains("concepts covered", instructions);
        Assert.Contains("school pupils in grades 5-11", instructions);
        Assert.Contains("Never use 'студент', 'студенти', 'студентів'", instructions);
        Assert.Contains("'учні', 'школярі', or 'учні 5–11 класів'", instructions);
        Assert.Contains("Матеріал допоможе учням", instructions);
        Assert.Contains("natural, grammatically correct Ukrainian", instructions);
        Assert.Contains("1-3 concise sentences, preferably 150-350 characters", instructions);
        Assert.Contains("only educational information supported by the uploaded material", instructions);
        Assert.Contains("do not invent formulas, topics, learning objectives, grade levels, or material types", instructions);
        Assert.Contains("Summarize instead of transcribing", instructions);
        Assert.Contains("do not copy the title as the entire first sentence", instructions);
        Assert.Contains("image quality, visual design, colors, layout, decorative elements", instructions);
        Assert.Contains("'ідеальний', 'чудовий', 'унікальний', 'незамінний'", instructions);
        Assert.Contains("Do not write in the first person or address the reader directly", instructions);
        Assert.Contains("no Markdown, bullet points, headings, emojis, hashtags, links, or LaTeX", instructions);
        Assert.Contains("Do not mention a grade unless it can be determined confidently", instructions);
        Assert.Contains("specific format unless that format is clearly supported", instructions);
        Assert.Contains("'зображення містить', 'після аналізу', 'OCR detected'", instructions);
        Assert.Contains("ready for immediate publication in a school archive", instructions);
        Assert.DoesNotContain("student benefit", instructions);
        Assert.DoesNotContain("Allowed existing topics", instructions);
        var descriptionGuidance = schema.GetProperty("properties").GetProperty("description").GetProperty("description").GetString()!;
        Assert.Contains("educational content", descriptionGuidance);
        Assert.Contains("Never use any grammatical form of 'студент'", descriptionGuidance);
        Assert.Contains("'учні' or 'школярі'", descriptionGuidance);
        Assert.Contains("1-3 concise sentences", descriptionGuidance);
        Assert.Contains("supported by the material", descriptionGuidance);
        Assert.Contains("No promotional language", descriptionGuidance);
        Assert.Contains("first person, direct address", descriptionGuidance);
        Assert.Contains("Exclude all authorship", descriptionGuidance);
        var input = request.RootElement.GetProperty("input")[0].GetProperty("content");
        Assert.Equal("high", input[0].GetProperty("detail").GetString());
        Assert.DoesNotContain("meaningless.jpg", requestJson, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Основи стереометрії", result.Title);
        Assert.Equal("Формули: a² + b² = c²", result.Description);
    }

    [Fact]
    public async Task Analyze_MalformedStructuredOutputFailsSafely()
    {
        var handler = new StubHandler(_ =>
        {
            var body = JsonSerializer.Serialize(new
            {
                output = new[] { new { content = new[] { new { type = "output_text", text = "not valid JSON" } } } }
            });
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
        });
        var client = new OpenAiMaterialClient(
            new HttpClient(handler) { BaseAddress = new Uri("https://api.openai.test/v1/") },
            Options.Create(new OpenAiOptions { ApiKey = "test-key", Model = "test-model" }));

        var exception = await Assert.ThrowsAsync<MaterialAnalysisException>(() => client.AnalyzeAsync(
            new UploadedFile(new MemoryStream([0xff, 0xd8, 0xff]), "scan.jpg", "image/jpeg", 3),
            ["Theory"], CancellationToken.None));

        Assert.Equal("InvalidStructuredOutput", exception.ErrorType);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
