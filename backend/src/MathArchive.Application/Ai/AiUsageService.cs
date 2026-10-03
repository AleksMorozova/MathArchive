using MathArchive.Application.Common;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Ai;

public sealed class AiUsageService(IAiUsageRepository repository, IClock clock, IOptions<OpenAiOptions> options,
    IOpenAiUsageCostCalculator calculator)
{
    public async Task<AiUsageSummary> GetSummaryAsync(AiUsageQuery query, CancellationToken cancellationToken)
    {
        var normalizedQuery = Normalize(query);
        var data = await repository.GetSummaryAsync(normalizedQuery, cancellationToken);
        var now = clock.UtcNow;
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var monthData = await repository.GetSummaryAsync(
            new AiUsageQuery(monthStart, null, null, null, null), cancellationToken);
        var limit = options.Value.MonthlyWarningLimitUsd;
        var percent = limit > 0 && monthData.EstimatedCostUsd.HasValue
            ? (int)Math.Min(100, decimal.Floor(monthData.EstimatedCostUsd.Value / limit * 100m)) : 0;
        var reached = limit > 0 && monthData.EstimatedCostUsd >= limit;
        return new AiUsageSummary(data.Requests, data.Succeeded, data.Failed,
            data.InputTokens, data.OutputTokens, data.TotalTokens, data.EstimatedCostUsd,
            data.AverageDurationMilliseconds, limit > 0 ? limit : null, percent, reached,
            reached && options.Value.BlockRequestsWhenLimitReached);
    }

    public Task<PagedResult<AiUsageItem>> GetHistoryAsync(AiUsageQuery query, CancellationToken cancellationToken) =>
        repository.GetHistoryAsync(Normalize(query), cancellationToken);

    public Task<AiCostRecalculationResult> RecalculateMissingCostsAsync(CancellationToken cancellationToken) =>
        repository.RecalculateMissingCostsAsync(calculator, cancellationToken);

    private static AiUsageQuery Normalize(AiUsageQuery query) => query with
    {
        Model = string.IsNullOrWhiteSpace(query.Model) ? null : query.Model.Trim(),
        Operation = string.IsNullOrWhiteSpace(query.Operation) ? null : query.Operation.Trim(),
        Page = Math.Max(1, query.Page),
        PageSize = Math.Clamp(query.PageSize, 1, 100)
    };
}
