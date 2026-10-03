using System.Net;
using System.Text;
using System.Text.Json;
using MathArchive.Application.Ai;
using MathArchive.Application.Files;
using MathArchive.Infrastructure.Ai;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Tests;

public sealed class OpenAiImagePosterClientTests
{
    [Fact]
    public async Task Transform_sends_reference_image_and_poster_configuration_and_returns_png()
    {
        string? requestBody = null;
        string? authorization = null;
        var png = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3 };
        var handler = new StubHandler(async request =>
        {
            requestBody = await request.Content!.ReadAsStringAsync();
            authorization = request.Headers.Authorization?.ToString();
            var responseBody = JsonSerializer.Serialize(new
            {
                data = new[] { new { b64_json = Convert.ToBase64String(png) } },
                usage = new { input_tokens = 100, output_tokens = 200, total_tokens = 300 }
            });
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json")
            };
            response.Headers.Add("x-request-id", "image-request-id");
            return response;
        });
        var client = CreateClient(handler);
        await using var stream = new MemoryStream([137, 80, 78, 71, 13, 10, 26, 10]);

        var result = await client.TransformAsync(
            new UploadedFile(stream, "reference.png", "image/png", stream.Length), CancellationToken.None);

        Assert.Equal("Bearer test-key", authorization);
        Assert.Contains("name=image", requestBody);
        Assert.Contains("filename=reference.png", requestBody);
        Assert.Contains("gpt-image-2", requestBody);
        Assert.Contains("1024x1536", requestBody);
        Assert.Contains("output_format", requestBody);
        Assert.DoesNotContain("image[]", requestBody);
        Assert.DoesNotContain("style reference", requestBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("single uploaded SOURCE IMAGE", requestBody);
        Assert.Contains("grammatically correct Ukrainian", requestBody);
        Assert.Contains("PRESERVE WHAT IS EDUCATIONALLY USEFUL", requestBody);
        Assert.Contains("OPEN LAYOUT IS THE DEFAULT", requestBody);
        Assert.Contains("WHITESPACE IS THE PRIMARY SEPARATOR", requestBody);
        Assert.Contains("Body text is regular weight", requestBody);
        Assert.Contains("30–50% fewer visible", requestBody);
        Assert.Contains("Preserve useful pale color coding", requestBody);
        Assert.Contains("The more content the source contains, the less", requestBody);
        Assert.Contains("editorial educational layout", requestBody);
        Assert.Contains("ONE CONSISTENT HEADING SYSTEM", requestBody);
        Assert.Contains("TOPIC → MATHEMATICAL STRUCTURE → FORMULAS", requestBody);
        Assert.Contains("#FFFDF6", requestBody);
        Assert.Contains("#082B5C", requestBody);
        Assert.Contains("#EAF5FC", requestBody);
        Assert.Contains("#E8AE18", requestBody);
        Assert.Contains("МТВ", requestBody);
        Assert.Equal(png, result.Content);
        Assert.Equal(100, result.InputTokens);
        Assert.Equal(200, result.OutputTokens);
        Assert.Equal("image-request-id", result.RequestId);
    }

    [Fact]
    public async Task Transform_when_response_has_no_image_fails_safely()
    {
        var handler = new StubHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"data\":[]}", Encoding.UTF8, "application/json")
        }));
        var client = CreateClient(handler);
        await using var stream = new MemoryStream([137, 80, 78, 71, 13, 10, 26, 10]);

        var exception = await Assert.ThrowsAsync<MaterialAnalysisException>(() => client.TransformAsync(
            new UploadedFile(stream, "reference.png", "image/png", stream.Length), CancellationToken.None));

        Assert.Equal("EmptyResponse", exception.ErrorType);
    }

    private static OpenAiImagePosterClient CreateClient(HttpMessageHandler handler) => new(
        new HttpClient(handler) { BaseAddress = new Uri("https://api.openai.test/v1/") },
        Options.Create(new OpenAiOptions
        {
            ApiKey = "test-key",
            ImageModel = "gpt-image-2",
            ImageQuality = "medium",
            ImageSize = "1024x1536",
            ImageTimeoutSeconds = 180
        }));

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> responseFactory) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            responseFactory(request);
    }
}
