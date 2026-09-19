using MathArchive.Application.Common;
using MathArchive.Application.Files;
using MathArchive.Domain.AiUsage;

namespace MathArchive.Application.Ai;

public sealed record FieldConfidence(decimal? Title, decimal? Grade, decimal? Topic, decimal? Type);
public sealed record MaterialAnalysisResult(string? Title, int? Grade, string? Topic, string? DocumentType,
    string? Description, FieldConfidence Confidence, bool RequiresReview);
public sealed record OpenAiAnalysisResult(string? Title, string? Grade, string? Topic, string? Type,
    string? Description, FieldConfidence Confidence, int? InputTokens, int? OutputTokens, int? TotalTokens,
    int? HttpStatusCode, string? RequestId);

public interface IOpenAiMaterialClient
{
    Task<OpenAiAnalysisResult> AnalyzeAsync(UploadedFile file, IReadOnlyList<string> documentTypes,
        CancellationToken cancellationToken);
}

public sealed record AiUsageSummary(int RequestsToday, int RequestsThisMonth, int Succeeded, int Failed,
    long InputTokens, long OutputTokens, long TotalTokens, decimal? EstimatedCostThisMonthUsd,
    decimal? AverageDurationMilliseconds, decimal? MonthlyWarningLimitUsd, int LimitUsagePercent,
    bool LimitReached, bool IsBlocked);
public sealed record AiUsageItem(Guid Id, DateTimeOffset StartedAt, string Operation, string Model,
    AiRequestStatus Status, int? InputTokens, int? OutputTokens, int? TotalTokens,
    long DurationMilliseconds, decimal? EstimatedCostUsd);
public sealed record AiUsageQuery(DateTimeOffset? From, DateTimeOffset? To, AiRequestStatus? Status,
    string? Model, string? Operation, int Page = 1, int PageSize = 20);

public interface IAiUsageRepository
{
    Task AddAsync(AiUsageRecord record, CancellationToken cancellationToken);
    Task<AiUsageSummaryData> GetSummaryAsync(DateTimeOffset todayStart, DateTimeOffset monthStart, CancellationToken cancellationToken);
    Task<PagedResult<AiUsageItem>> GetHistoryAsync(AiUsageQuery query, CancellationToken cancellationToken);
    Task<AiCostRecalculationResult> RecalculateMissingCostsAsync(IOpenAiUsageCostCalculator calculator, CancellationToken cancellationToken);
}

public sealed record AiCostRecalculationResult(int Updated, int Skipped);

public sealed record AiUsageSummaryData(int RequestsToday, int RequestsThisMonth, int Succeeded, int Failed,
    long InputTokens, long OutputTokens, long TotalTokens, decimal? EstimatedCostThisMonthUsd,
    decimal? AverageDurationMilliseconds);

public interface IOpenAiUsageCostCalculator
{
    decimal? Calculate(string model, int? inputTokens, int? outputTokens);
}

public sealed class MaterialAnalysisException(string message, string errorType, int statusCode = 502,
    int? upstreamStatusCode = null, string? requestId = null, Exception? inner = null)
    : Exception(message, inner)
{
    public string ErrorType { get; } = errorType;
    public int StatusCode { get; } = statusCode;
    public int? UpstreamStatusCode { get; } = upstreamStatusCode;
    public string? RequestId { get; } = requestId;
}

public sealed class AiLimitExceededException() : Exception("The monthly AI usage limit has been reached.");
