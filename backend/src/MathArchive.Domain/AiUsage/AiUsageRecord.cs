namespace MathArchive.Domain.AiUsage;

public sealed class AiUsageRecord
{
    private AiUsageRecord() { }

    public AiUsageRecord(DateTimeOffset startedAt, string operation, string model, AiRequestStatus status,
        long durationMilliseconds, int? inputTokens, int? outputTokens, int? totalTokens,
        int? httpStatusCode, string? requestId, string? errorType, decimal? estimatedCostUsd, string? adminId)
    {
        Id = Guid.NewGuid();
        StartedAt = startedAt.ToUniversalTime();
        Operation = operation;
        Model = model;
        Status = status;
        DurationMilliseconds = durationMilliseconds;
        InputTokens = inputTokens;
        OutputTokens = outputTokens;
        TotalTokens = totalTokens;
        HttpStatusCode = httpStatusCode;
        RequestId = requestId;
        ErrorType = errorType;
        EstimatedCostUsd = estimatedCostUsd;
        AdminId = adminId;
    }

    public Guid Id { get; private set; }
    public DateTimeOffset StartedAt { get; private set; }
    public string Operation { get; private set; } = string.Empty;
    public string Model { get; private set; } = string.Empty;
    public AiRequestStatus Status { get; private set; }
    public int? InputTokens { get; private set; }
    public int? OutputTokens { get; private set; }
    public int? TotalTokens { get; private set; }
    public long DurationMilliseconds { get; private set; }
    public int? HttpStatusCode { get; private set; }
    public string? RequestId { get; private set; }
    public string? ErrorType { get; private set; }
    public decimal? EstimatedCostUsd { get; private set; }
    public string? AdminId { get; private set; }

    public void SetEstimatedCost(decimal cost)
    {
        if (EstimatedCostUsd is null) EstimatedCostUsd = cost;
    }
}
