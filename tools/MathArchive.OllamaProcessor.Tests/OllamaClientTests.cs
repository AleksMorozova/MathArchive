using System.Net;
using System.Text;
using System.Text.Json;
using MathArchive.OllamaProcessor.Configuration;
using MathArchive.OllamaProcessor.Models;
using MathArchive.OllamaProcessor.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace MathArchive.OllamaProcessor.Tests;

public sealed class OllamaClientTests
{
    [Fact]
    public async Task AnalyzeAsync_DeserializesValidStructuredResponseAndPreservesBackslashes()
    {
        var client = CreateClient(
            JsonResponse(new { models = new[] { new { name = "qwen3-vl:8b-instruct" } } }),
            ChatResponse(ValidAnalysisJson));

        var result = await client.AnalyzeAsync([1, 2, 3], "image/png", true, CancellationToken.None);

        Assert.Equal("Тригонометрія", result.Analysis.Title);
        Assert.Equal(@"\sin^2 \alpha + \cos^2 \alpha = 1", result.Analysis.Sections[0].Formulas[0]);
        Assert.Equal(AnalysisWarningType.FormulaUncertain, result.Analysis.Warnings[0].Type);
        Assert.Equal(ValidAnalysisJson, result.RawResponse);
    }

    [Fact]
    public async Task AnalyzeAsync_DisablesThinkingAndKeepsModelWarm()
    {
        var handler = new SequenceHandler([InstalledModels(), ChatResponse(ValidAnalysisJson)]);
        var client = CreateClient(handler);

        await client.AnalyzeAsync([1, 2, 3], "image/png", false, CancellationToken.None);

        Assert.NotNull(handler.LastPostBody);
        using var request = JsonDocument.Parse(handler.LastPostBody);
        Assert.False(request.RootElement.GetProperty("think").GetBoolean());
        Assert.Equal("10m", request.RootElement.GetProperty("keep_alive").GetString());
        Assert.Equal(4096, request.RootElement.GetProperty("options").GetProperty("num_ctx").GetInt32());
        Assert.Equal(1536, request.RootElement.GetProperty("options").GetProperty("num_predict").GetInt32());
        Assert.Equal(0, request.RootElement.GetProperty("options").GetProperty("temperature").GetInt32());
    }

    [Fact]
    public async Task AnalyzeAsync_RejectsInvalidJson()
    {
        var client = CreateClient(InstalledModels(), ChatResponse("not-json"));

        var exception = await Assert.ThrowsAsync<OllamaException>(() =>
            client.AnalyzeAsync([1], "image/png", false, CancellationToken.None));

        Assert.Equal(OllamaErrorKind.InvalidResponse, exception.Kind);
    }

    [Fact]
    public async Task AnalyzeAsync_RejectsEmptyResult()
    {
        var client = CreateClient(InstalledModels(), ChatResponse(" "));

        var exception = await Assert.ThrowsAsync<OllamaException>(() =>
            client.AnalyzeAsync([1], "image/png", false, CancellationToken.None));

        Assert.Contains("порожній", exception.Message);
    }

    [Fact]
    public async Task AnalyzeAsync_RejectsUnknownSectionType()
    {
        var invalid = ValidAnalysisJson.Replace("FormulaGroup", "PosterCard", StringComparison.Ordinal);
        var client = CreateClient(InstalledModels(), ChatResponse(invalid));

        var exception = await Assert.ThrowsAsync<OllamaException>(() =>
            client.AnalyzeAsync([1], "image/png", false, CancellationToken.None));

        Assert.Equal(OllamaErrorKind.InvalidResponse, exception.Kind);
    }

    [Fact]
    public async Task AnalyzeAsync_RejectsUnknownWarningType()
    {
        var invalid = ValidAnalysisJson.Replace("FormulaUncertain", "VisualMaybe", StringComparison.Ordinal);
        var client = CreateClient(InstalledModels(), ChatResponse(invalid));

        var exception = await Assert.ThrowsAsync<OllamaException>(() =>
            client.AnalyzeAsync([1], "image/png", false, CancellationToken.None));

        Assert.Equal(OllamaErrorKind.InvalidResponse, exception.Kind);
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsUnavailableWhenOllamaCannotBeReached()
    {
        var handler = new ThrowingHandler(new HttpRequestException("connection refused"));
        var client = CreateClient(handler);

        var status = await client.GetStatusAsync(CancellationToken.None);

        Assert.False(status.Connected);
        Assert.Contains("Запустіть Ollama", status.Message);
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsInstallCommandWhenModelIsMissing()
    {
        var client = CreateClient(JsonResponse(new { models = Array.Empty<object>() }));

        var status = await client.GetStatusAsync(CancellationToken.None);

        Assert.True(status.Connected);
        Assert.False(status.ModelInstalled);
        Assert.Equal("ollama pull qwen3-vl:8b-instruct", status.InstallCommand);
    }

    private static OllamaClient CreateClient(params HttpResponseMessage[] responses) =>
        CreateClient(new SequenceHandler(responses));

    private static OllamaClient CreateClient(HttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:11434/") };
        var options = Options.Create(new OllamaOptions { VisionModel = "qwen3-vl:8b-instruct", TimeoutSeconds = 30 });
        return new OllamaClient(httpClient, options, new AnalysisValidator(), NullLogger<OllamaClient>.Instance);
    }

    private static HttpResponseMessage InstalledModels() =>
        JsonResponse(new { models = new[] { new { name = "qwen3-vl:8b-instruct" } } });

    private static HttpResponseMessage ChatResponse(string content) =>
        JsonResponse(new { message = new { role = "assistant", content }, total_duration = 1000 });

    private static HttpResponseMessage JsonResponse(object value) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json")
    };

    private const string ValidAnalysisJson = """
        {
          "title": "Тригонометрія",
          "sourceLanguage": "uk",
          "suggestedGrade": 10,
          "suggestedTopic": "Основні тригонометричні тотожності",
          "sections": [{
            "id": "1",
            "type": "FormulaGroup",
            "title": "Основна тотожність",
            "text": null,
            "formulas": ["\\sin^2 \\alpha + \\cos^2 \\alpha = 1"],
            "table": null,
            "visual": null
          }],
          "warnings": [{
            "type": "FormulaUncertain",
            "sectionId": "1",
            "message": "Перевірте формулу вручну."
          }]
        }
        """;

    private sealed class SequenceHandler(IEnumerable<HttpResponseMessage> responses) : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> _responses = new(responses);
        public string? LastPostBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method == HttpMethod.Post)
            {
                LastPostBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            }

            return _responses.Dequeue();
        }
    }

    private sealed class ThrowingHandler(Exception exception) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromException<HttpResponseMessage>(exception);
    }
}
