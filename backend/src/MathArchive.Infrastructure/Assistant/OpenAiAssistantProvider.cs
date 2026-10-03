using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using MathArchive.Application.Ai;
using MathArchive.Application.Assistant;
using Microsoft.Extensions.Options;

namespace MathArchive.Infrastructure.Assistant;

public sealed class OpenAiAssistantProvider(HttpClient http, IOptions<OpenAiOptions> options) : IAssistantProvider, IEmbeddingService
{
    public async Task<ProviderResult> GenerateAsync(string model, string instructions, string input, int maxOutputTokens, CancellationToken ct)
    {
        using var response = await SendAsync("responses", new { model, instructions, input, max_output_tokens = maxOutputTokens, store = false }, ct);
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = json.RootElement;
        if (root.TryGetProperty("status", out var status) && status.GetString() != "completed")
            throw new AssistantException("IncompleteResponse", "Не вдалося завершити відповідь. Спробуй коротше запитання.");
        var text = string.Concat(root.GetProperty("output").EnumerateArray()
            .Where(x => x.TryGetProperty("content", out _)).SelectMany(x => x.GetProperty("content").EnumerateArray())
            .Where(x => x.GetProperty("type").GetString() == "output_text").Select(x => x.GetProperty("text").GetString()));
        if (string.IsNullOrWhiteSpace(text)) throw new AssistantException("EmptyResponse", "Помічник не зміг відповісти.");
        var usage = root.GetProperty("usage");
        return new(text, usage.GetProperty("input_tokens").GetInt32(), usage.GetProperty("output_tokens").GetInt32());
    }
    public async Task<EmbeddingResult> EmbedAsync(string model, string text, CancellationToken ct)
    {
        using var response = await SendAsync("embeddings", new { model, input = text, encoding_format = "float" }, ct);
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = json.RootElement;
        var vector = root.GetProperty("data")[0].GetProperty("embedding").EnumerateArray().Select(x => x.GetSingle()).ToArray();
        if (vector.Length == 0 || vector.Any(x => !float.IsFinite(x)) || vector.All(x => x == 0))
            throw new AssistantException("InvalidEmbedding", "Пошук тимчасово недоступний.");
        return new(vector, root.GetProperty("usage").GetProperty("prompt_tokens").GetInt32());
    }
    private async Task<HttpResponseMessage> SendAsync(string path, object body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(options.Value.ApiKey)) throw new AssistantException("NotConfigured", "AI-помічник ще налаштовується.");
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
        {
            var status = (int)response.StatusCode;
            response.Dispose();
            throw new AssistantException(status == 429 ? "ProviderLimit" : "ProviderFailure",
                "AI-помічник зараз недоступний. Спробуй пізніше.", status == 429 ? 429 : 503);
        }
        return response;
    }
}
