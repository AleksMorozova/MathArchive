using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using MathArchive.OllamaProcessor.Configuration;
using MathArchive.OllamaProcessor.Models;
using Microsoft.Extensions.Options;

namespace MathArchive.OllamaProcessor.Services;

public sealed class OllamaClient(
    HttpClient httpClient,
    IOptions<OllamaOptions> options,
    AnalysisValidator validator,
    ILogger<OllamaClient> logger)
{
    internal static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

    public async Task<OllamaStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        var model = options.Value.VisionModel.Trim();
        try
        {
            using var response = await httpClient.GetAsync("api/tags", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return UnavailableStatus(model);
            }

            var tags = await response.Content.ReadFromJsonAsync<TagsResponse>(JsonOptions, cancellationToken);
            var isInstalled = tags?.Models?.Any(item => ModelNamesMatch(item.Name, model)) == true;
            return isInstalled
                ? new OllamaStatus(true, true, model, "Ollama підключено. Модель готова.", null)
                : new OllamaStatus(true, false, model,
                    $"Ollama підключено, але модель '{model}' не встановлена.", $"ollama pull {model}");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogDebug(exception, "Ollama status check failed.");
            return UnavailableStatus(model);
        }
    }

    public async Task<AnalysisResponse> AnalyzeAsync(
        byte[] imageBytes,
        string contentType,
        bool includeRawResponse,
        CancellationToken cancellationToken)
    {
        var status = await GetStatusAsync(cancellationToken);
        if (!status.Connected)
        {
            throw new OllamaException("Ollama недоступно. Запустіть Ollama та повторіть спробу.", OllamaErrorKind.Unavailable);
        }

        if (!status.ModelInstalled)
        {
            throw new OllamaException(
                $"Модель '{status.Model}' не встановлена. Виконайте: {status.InstallCommand}",
                OllamaErrorKind.ModelMissing);
        }

        var payload = new
        {
            model = status.Model,
            messages = new[]
            {
                new
                {
                    role = "user",
                    content = OllamaAnalysisPrompt.Content,
                    images = new[] { Convert.ToBase64String(imageBytes) }
                }
            },
            stream = false,
            think = false,
            keep_alive = options.Value.KeepAlive,
            format = OllamaAnalysisSchema.Create(),
            options = new
            {
                temperature = 0,
                num_ctx = options.Value.ContextWindow,
                num_predict = options.Value.MaximumOutputTokens
            }
        };

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(options.Value.TimeoutSeconds, 30, 1800)));
        var stopwatch = Stopwatch.StartNew();

        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsJsonAsync("api/chat", payload, JsonOptions, timeout.Token);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(
                "Ollama image analysis timed out after {TimeoutSeconds} seconds for model {Model}.",
                options.Value.TimeoutSeconds,
                status.Model);
            throw new OllamaException("Аналіз перевищив налаштований час очікування.", OllamaErrorKind.Timeout, exception);
        }
        catch (OperationCanceledException exception)
        {
            logger.LogInformation("Ollama image analysis was cancelled by the client for model {Model}.", status.Model);
            throw new OllamaException("Аналіз скасовано клієнтом.", OllamaErrorKind.Cancelled, exception);
        }
        catch (HttpRequestException exception)
        {
            throw new OllamaException("Ollama недоступно. Запустіть Ollama та повторіть спробу.", OllamaErrorKind.Unavailable, exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var kind = response.StatusCode == HttpStatusCode.NotFound
                    ? OllamaErrorKind.ModelMissing
                    : OllamaErrorKind.InvalidResponse;
                throw new OllamaException(
                    kind == OllamaErrorKind.ModelMissing
                        ? $"Модель '{status.Model}' не знайдена. Виконайте: ollama pull {status.Model}"
                        : $"Ollama повернуло HTTP {(int)response.StatusCode}.",
                    kind);
            }

            OllamaChatResponse? chatResponse;
            try
            {
                chatResponse = await response.Content.ReadFromJsonAsync<OllamaChatResponse>(JsonOptions, cancellationToken);
            }
            catch (JsonException exception)
            {
                throw new OllamaException("Ollama повернуло некоректну HTTP-відповідь.", OllamaErrorKind.InvalidResponse, exception);
            }

            var raw = chatResponse?.Message?.Content;
            if (string.IsNullOrWhiteSpace(raw))
            {
                throw new OllamaException("Ollama повернуло порожній результат.", OllamaErrorKind.InvalidResponse);
            }

            MathArchiveImageAnalysis? analysis;
            try
            {
                analysis = JsonSerializer.Deserialize<MathArchiveImageAnalysis>(raw, JsonOptions);
            }
            catch (JsonException exception)
            {
                throw new OllamaException("Ollama повернуло JSON, який не відповідає схемі.", OllamaErrorKind.InvalidResponse, exception);
            }

            validator.Validate(analysis);
            stopwatch.Stop();
            logger.LogInformation(
                "Ollama image analysis completed with model {Model} in {ElapsedMilliseconds} ms. Image content type: {ContentType}; size: {ImageSizeBytes} bytes.",
                status.Model,
                stopwatch.ElapsedMilliseconds,
                contentType,
                imageBytes.Length);

            return new AnalysisResponse(
                analysis!,
                status.Model,
                stopwatch.ElapsedMilliseconds,
                includeRawResponse ? raw : null);
        }
    }

    private static bool ModelNamesMatch(string? installedName, string configuredName)
    {
        if (string.IsNullOrWhiteSpace(installedName))
        {
            return false;
        }

        var installed = installedName.Trim();
        var configured = configuredName.Trim();
        return installed.Equals(configured, StringComparison.OrdinalIgnoreCase) ||
            (!configured.Contains(':') && installed.Equals(configured + ":latest", StringComparison.OrdinalIgnoreCase));
    }

    private static OllamaStatus UnavailableStatus(string model) =>
        new(false, false, model, "Ollama недоступно. Запустіть Ollama та повторіть спробу.", null);

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };
        jsonOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false));
        return jsonOptions;
    }

    internal sealed record TagsResponse(IReadOnlyList<ModelTag>? Models);
    internal sealed record ModelTag(string? Name);
    internal sealed record OllamaChatResponse(OllamaMessage? Message, long? TotalDuration);
    internal sealed record OllamaMessage(string? Role, string? Content);
}
