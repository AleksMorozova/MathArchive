using System.Diagnostics;
using FluentValidation;
using FluentValidation.Results;
using MathArchive.Application.Common;
using MathArchive.Application.Files;
using MathArchive.Domain.AiUsage;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Ai;

public sealed class ImagePosterService(
    IOpenAiImagePosterClient client,
    IAiUsageRepository usageRepository,
    IOpenAiUsageCostCalculator costCalculator,
    IClock clock,
    IOptions<OpenAiOptions> options,
    ILogger<ImagePosterService> logger) : IImagePosterService
{
    private const string Operation = "ImagePosterTransformation";
    private static readonly IReadOnlyDictionary<string, string[]> SupportedImages =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            [".png"] = ["image/png"],
            [".jpg"] = ["image/jpeg"],
            [".jpeg"] = ["image/jpeg"],
            [".webp"] = ["image/webp"]
        };

    public async Task<GeneratedPoster> TransformAsync(
        UploadedFile image,
        string? adminId,
        CancellationToken cancellationToken)
    {
        await ValidateAsync(image, cancellationToken);
        await EnsureLimitAllowsRequestAsync(cancellationToken);
        var startedAt = clock.UtcNow;
        var stopwatch = Stopwatch.StartNew();
        OpenAiGeneratedImage? response = null;
        var status = AiRequestStatus.Failed;
        string? errorType = null;
        int? upstreamStatusCode = null;
        string? requestId = null;

        try
        {
            response = await client.TransformAsync(image, cancellationToken);
            status = AiRequestStatus.Succeeded;
            var fileName = $"matharchive-{clock.UtcNow:yyyy-MM-dd-HHmm}.png";
            return new GeneratedPoster(response.Content, fileName, "image/png");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            status = AiRequestStatus.Cancelled;
            errorType = "Cancelled";
            throw;
        }
        catch (MaterialAnalysisException exception)
        {
            status = exception.ErrorType == "Timeout" ? AiRequestStatus.TimedOut : AiRequestStatus.Failed;
            errorType = exception.ErrorType;
            upstreamStatusCode = exception.UpstreamStatusCode;
            requestId = exception.RequestId;
            throw;
        }
        catch (Exception exception)
        {
            errorType = exception.GetType().Name;
            throw new MaterialAnalysisException("Image transformation failed.", "UnexpectedError", inner: exception);
        }
        finally
        {
            stopwatch.Stop();
            var configuredModel = options.Value.ImageModel.Trim();
            var cost = response is null ? null : costCalculator.Calculate(
                configuredModel, response.InputTokens, response.OutputTokens);
            var usage = new AiUsageRecord(startedAt, Operation, configuredModel, status, stopwatch.ElapsedMilliseconds,
                response?.InputTokens, response?.OutputTokens, response?.TotalTokens,
                response?.HttpStatusCode ?? upstreamStatusCode, response?.RequestId ?? requestId,
                errorType, cost, adminId);
            try
            {
                await usageRepository.AddAsync(usage, CancellationToken.None);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "AI usage telemetry could not be persisted for request {UsageRecordId}.", usage.Id);
            }
        }
    }

    private async Task EnsureLimitAllowsRequestAsync(CancellationToken cancellationToken)
    {
        var configured = options.Value;
        if (!configured.BlockRequestsWhenLimitReached || configured.MonthlyWarningLimitUsd <= 0) return;
        var now = clock.UtcNow;
        var summary = await usageRepository.GetSummaryAsync(
            new AiUsageQuery(new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero),
                null, null, null, null), cancellationToken);
        if (summary.EstimatedCostUsd >= configured.MonthlyWarningLimitUsd) throw new AiLimitExceededException();
    }

    private async Task ValidateAsync(UploadedFile image, CancellationToken cancellationToken)
    {
        var failures = new List<ValidationFailure>();
        var configuredMaximum = Math.Clamp(options.Value.MaximumImageUploadBytes, 1, 10 * 1024 * 1024);
        var extension = Path.GetExtension(image.FileName);
        if (image.Length <= 0) failures.Add(new("file", "Image is required."));
        if (image.Length > configuredMaximum) failures.Add(new("file", $"Image must not exceed {configuredMaximum / 1024 / 1024} MB."));
        if (!SupportedImages.TryGetValue(extension, out var contentTypes) ||
            !contentTypes.Contains(image.ContentType, StringComparer.OrdinalIgnoreCase))
            failures.Add(new("file", "Only PNG, JPEG, and WEBP images are supported."));

        if (failures.Count == 0 && !await HasExpectedSignatureAsync(image, extension, cancellationToken))
            failures.Add(new("file", "The uploaded file is not a valid supported image."));
        if (failures.Count > 0) throw new ValidationException(failures);
    }

    private static async Task<bool> HasExpectedSignatureAsync(
        UploadedFile image,
        string extension,
        CancellationToken cancellationToken)
    {
        if (!image.Stream.CanSeek) return false;
        var start = image.Stream.Position;
        var header = new byte[12];
        var read = await image.Stream.ReadAsync(header, cancellationToken);
        image.Stream.Position = start;
        return extension.ToLowerInvariant() switch
        {
            ".png" => read >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            ".jpg" or ".jpeg" => read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff,
            ".webp" => read >= 12 && header.AsSpan(0, 4).SequenceEqual("RIFF"u8) && header.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            _ => false
        };
    }
}
