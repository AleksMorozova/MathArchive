using MathArchive.Application.Common;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Ai;

public sealed class AiUsageService(IAiUsageRepository repository, IClock clock, IOptions<OpenAiOptions> options,
    IOpenAiUsageCostCalculator calculator)
{
    public async Task<AiUsageSummary> GetSummaryAsync(CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var todayStart = new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, TimeSpan.Zero);
        var data = await repository.GetSummaryAsync(todayStart, new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero), cancellationToken);
        var limit = options.Value.MonthlyWarningLimitUsd;
        var percent = limit > 0 && data.EstimatedCostThisMonthUsd.HasValue
            ? (int)Math.Min(100, decimal.Floor(data.EstimatedCostThisMonthUsd.Value / limit * 100m)) : 0;
        var reached = limit > 0 && data.EstimatedCostThisMonthUsd >= limit;
        return new AiUsageSummary(data.RequestsToday, data.RequestsThisMonth, data.Succeeded, data.Failed,
            data.InputTokens, data.OutputTokens, data.TotalTokens, data.EstimatedCostThisMonthUsd,
            data.AverageDurationMilliseconds, limit > 0 ? limit : null, percent, reached,
            reached && options.Value.BlockRequestsWhenLimitReached);
    }

    public Task<PagedResult<AiUsageItem>> GetHistoryAsync(AiUsageQuery query, CancellationToken cancellationToken) =>
        repository.GetHistoryAsync(query with { Page = Math.Max(1, query.Page), PageSize = Math.Clamp(query.PageSize, 1, 100) }, cancellationToken);

    public Task<AiCostRecalculationResult> RecalculateMissingCostsAsync(CancellationToken cancellationToken) =>
        repository.RecalculateMissingCostsAsync(calculator, cancellationToken);
}
