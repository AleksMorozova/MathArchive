using System.Diagnostics;
using System.Text.RegularExpressions;
using FluentValidation;
using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Domain.AiUsage;
using MathArchive.Domain.Documents;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Ai;

public interface IMaterialAnalysisService
{
    Task<MaterialAnalysisResult> AnalyzeAsync(UploadedFile file, string? adminId, CancellationToken cancellationToken);
}

public sealed class MaterialAnalysisService(
    IOpenAiMaterialClient client,
    IAiUsageRepository usageRepository,
    IValidator<UploadedFile> fileValidator,
    IOpenAiUsageCostCalculator costCalculator,
    IClock clock,
    IOptions<OpenAiOptions> options,
    ILogger<MaterialAnalysisService> logger) : IMaterialAnalysisService
{
    private const string Operation = "MaterialAnalysis";
    private static readonly string[] AttributionMarkers =
    [
        "мтв", "створено", "створила", "створив", "підготувала", "підготував", "автор", "авторка",
        "розроблено", "розробила", "розробив", "copyright", "ліцей", "школа", "гімназія", "університет",
        "інститут", "кафедра", "логотип", "водяний знак", "watermark"
    ];

    public async Task<MaterialAnalysisResult> AnalyzeAsync(UploadedFile file, string? adminId, CancellationToken cancellationToken)
    {
        await fileValidator.ValidateAndThrowAsync(file, cancellationToken);
        await ValidateSignatureAsync(file, cancellationToken);
        await EnsureLimitAllowsRequestAsync(cancellationToken);

        var startedAt = clock.UtcNow;
        var stopwatch = Stopwatch.StartNew();
        OpenAiAnalysisResult? response = null;
        var status = AiRequestStatus.Failed;
        string? errorType = null;
        int? upstreamStatusCode = null;
        string? requestId = null;

        try
        {
            var types = Enum.GetNames<DocumentType>();
            response = await client.AnalyzeAsync(file, types, cancellationToken);
            var result = Normalize(response, types);
            status = AiRequestStatus.Succeeded;
            return result;
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
            throw new MaterialAnalysisException("Material analysis failed.", "UnexpectedError", inner: exception);
        }
        finally
        {
            stopwatch.Stop();
            var cost = response is null ? null : costCalculator.Calculate(options.Value.Model, response.InputTokens, response.OutputTokens);
            var record = new AiUsageRecord(startedAt, Operation, options.Value.Model, status, stopwatch.ElapsedMilliseconds,
                response?.InputTokens, response?.OutputTokens, response?.TotalTokens, response?.HttpStatusCode ?? upstreamStatusCode,
                response?.RequestId ?? requestId, errorType, cost, adminId);
            try
            {
                await usageRepository.AddAsync(record, CancellationToken.None);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "AI usage telemetry could not be persisted for request {UsageRecordId}.", record.Id);
            }
        }
    }

    private async Task EnsureLimitAllowsRequestAsync(CancellationToken cancellationToken)
    {
        var configured = options.Value;
        if (!configured.BlockRequestsWhenLimitReached || configured.MonthlyWarningLimitUsd <= 0) return;
        var now = clock.UtcNow;
        var todayStart = new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, TimeSpan.Zero);
        var summary = await usageRepository.GetSummaryAsync(todayStart, new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero), cancellationToken);
        if (summary.EstimatedCostThisMonthUsd >= configured.MonthlyWarningLimitUsd) throw new AiLimitExceededException();
    }

    private static MaterialAnalysisResult Normalize(OpenAiAnalysisResult result, IReadOnlyList<string> types)
    {
        var gradeValue = Clean(result.Grade, 2);
        var typeValue = Clean(result.Type, 100);
        int? grade = int.TryParse(gradeValue, out var parsedGrade) && parsedGrade is >= 1 and <= 11 ? parsedGrade : null;
        var type = types.FirstOrDefault(x => string.Equals(x, typeValue, StringComparison.OrdinalIgnoreCase));
        var generatedTopic = Clean(result.Topic, 150);
        var generatedTitle = Clean(result.Title, 200);
        var metadataRejected = ContainsAttributionOrBranding(generatedTopic) || ContainsAttributionOrBranding(generatedTitle);
        if (ContainsAttributionOrBranding(generatedTopic)) generatedTopic = null;
        if (ContainsAttributionOrBranding(generatedTitle)) generatedTitle = null;
        var title = generatedTitle ?? BuildFallbackTitle(generatedTopic);
        var topic = generatedTopic ?? title;
        if (title is null || topic is null)
            throw new MaterialAnalysisException("OpenAI did not return a usable title or topic.", "InvalidStructuredOutput");
        var description = Clean(result.Description, 2000);
        var descriptionRejected = ContainsAttributionOrBranding(description) || ContainsStudentTerm(description);
        if (descriptionRejected) description = null;
        var requiresReview = grade is null || type is null || metadataRejected ||
            descriptionRejected ||
            new[] { result.Confidence.Title, result.Confidence.Grade, result.Confidence.Topic, result.Confidence.Type }
                .Any(value => !value.HasValue || value < 0.7m);

        return new MaterialAnalysisResult(title, grade, topic, type, description, result.Confidence, requiresReview);
    }

    private static string? BuildFallbackTitle(string? topic)
    {
        if (topic is null) return null;
        return topic.Equals("Стереометрія", StringComparison.OrdinalIgnoreCase)
            ? "Основи стереометрії"
            : $"Матеріал за темою «{topic}»";
    }

    private static string? Clean(string? value, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed) ||
            trimmed.Equals("null", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Equals("undefined", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Equals("n/a", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return trimmed[..Math.Min(trimmed.Length, maxLength)];
    }

    private static bool ContainsAttributionOrBranding(string? value)
    {
        if (value is null) return false;

        if (AttributionMarkers.Any(marker =>
                value.Contains(marker, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return value.Contains('©') ||
            Regex.IsMatch(value, @"(?:https?://|www\.)\S+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant) ||
            Regex.IsMatch(value, @"(?<![\p{L}\p{N}])@[\p{L}\p{N}_.-]+", RegexOptions.CultureInvariant);
    }

    private static bool ContainsStudentTerm(string? value) =>
        value is not null && Regex.IsMatch(value, @"(?<!\p{L})студент\p{L}*(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static async Task ValidateSignatureAsync(UploadedFile file, CancellationToken cancellationToken)
    {
        if (!file.Stream.CanSeek) throw new ValidationException("The uploaded file stream must be seekable for analysis.");
        var start = file.Stream.Position;
        var header = new byte[8];
        var read = await file.Stream.ReadAsync(header, cancellationToken);
        file.Stream.Position = start;
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var valid = extension switch
        {
            ".pdf" => read >= 5 && header.AsSpan(0, 5).SequenceEqual("%PDF-"u8),
            ".png" => read >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            ".jpg" or ".jpeg" => read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff,
            ".doc" or ".xls" => read >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 }),
            ".docx" or ".xlsx" => read >= 4 && header[0] == 0x50 && header[1] == 0x4b && header[2] is 0x03 or 0x05 or 0x07 && header[3] is 0x04 or 0x06 or 0x08,
            _ => false
        };
        if (!valid) throw new ValidationException("File signature does not match its extension.");
    }
}
