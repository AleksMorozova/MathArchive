using System.Net.Http.Headers;
using System.Text.Json;
using MathArchive.Application.Ai;
using MathArchive.Application.Files;
using Microsoft.Extensions.Options;

namespace MathArchive.Infrastructure.Ai;

public sealed class OpenAiImagePosterClient(
    HttpClient httpClient,
    IOptions<OpenAiOptions> options) : IOpenAiImagePosterClient
{
    public async Task<OpenAiGeneratedImage> TransformAsync(
        UploadedFile image,
        CancellationToken cancellationToken)
    {
        var configured = options.Value;
        if (string.IsNullOrWhiteSpace(configured.ApiKey) || string.IsNullOrWhiteSpace(configured.ImageModel))
            throw new MaterialAnalysisException("OpenAI image generation is not configured.", "ConfigurationError", 503);

        image.Stream.Position = 0;
        using var form = new MultipartFormDataContent();
        using var imageContent = new StreamContent(image.Stream);
        imageContent.Headers.ContentType = MediaTypeHeaderValue.Parse(image.ContentType);
        form.Add(imageContent, "image", Path.GetFileName(image.FileName));
        form.Add(new StringContent(MathArchivePosterPrompt.Instructions), "prompt");
        form.Add(new StringContent(configured.ImageModel.Trim()), "model");
        form.Add(new StringContent(configured.ImageQuality.Trim()), "quality");
        form.Add(new StringContent(configured.ImageSize.Trim()), "size");
        form.Add(new StringContent("png"), "output_format");
        form.Add(new StringContent("1"), "n");

        using var request = new HttpRequestMessage(HttpMethod.Post, "images/edits") { Content = form };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", configured.ApiKey);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(configured.ImageTimeoutSeconds, 30, 600)));

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new MaterialAnalysisException("OpenAI image generation timed out.", "Timeout", 504, inner: exception);
        }

        using (response)
        {
            var requestId = response.Headers.TryGetValues("x-request-id", out var values) ? values.FirstOrDefault() : null;
            if (!response.IsSuccessStatusCode)
                throw new MaterialAnalysisException("OpenAI could not transform the image.", "OpenAiHttpError", 502,
                    (int)response.StatusCode, requestId);

            await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);
            var root = document.RootElement;
            var encodedImage = root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array &&
                data.GetArrayLength() > 0 && data[0].TryGetProperty("b64_json", out var encoded)
                    ? encoded.GetString()
                    : null;
            if (string.IsNullOrWhiteSpace(encodedImage))
                throw new MaterialAnalysisException("OpenAI returned an empty image.", "EmptyResponse");

            byte[] content;
            try { content = Convert.FromBase64String(encodedImage); }
            catch (FormatException exception)
            { throw new MaterialAnalysisException("OpenAI returned an invalid image.", "InvalidImageOutput", inner: exception); }
            if (content.Length < 8 || !content.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
                throw new MaterialAnalysisException("OpenAI returned an invalid PNG image.", "InvalidImageOutput");

            var usage = root.TryGetProperty("usage", out var usageElement) ? usageElement : default;
            int? ReadUsage(string name) => usage.ValueKind == JsonValueKind.Object &&
                usage.TryGetProperty(name, out var value) && value.TryGetInt32(out var count) ? count : null;
            return new OpenAiGeneratedImage(content, ReadUsage("input_tokens"), ReadUsage("output_tokens"),
                ReadUsage("total_tokens"), (int)response.StatusCode, requestId);
        }
    }

}
