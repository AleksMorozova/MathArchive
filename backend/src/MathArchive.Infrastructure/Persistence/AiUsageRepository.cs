using MathArchive.Application.Ai;
using MathArchive.Application.Common;
using MathArchive.Domain.AiUsage;
using Microsoft.EntityFrameworkCore;

namespace MathArchive.Infrastructure.Persistence;

public sealed class AiUsageRepository(MathArchiveDbContext dbContext) : IAiUsageRepository
{
    public async Task AddAsync(AiUsageRecord record, CancellationToken cancellationToken)
    {
        dbContext.AiUsageRecords.Add(record);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<AiUsageSummaryData> GetSummaryAsync(DateTimeOffset todayStart, DateTimeOffset monthStart, CancellationToken cancellationToken)
    {
        var records = dbContext.AiUsageRecords.AsNoTracking().Where(x => x.StartedAt >= monthStart);
        var aggregate = await records.GroupBy(_ => 1).Select(group => new
        {
            RequestsToday = group.Count(x => x.StartedAt >= todayStart),
            RequestsThisMonth = group.Count(),
            Succeeded = group.Count(x => x.Status == AiRequestStatus.Succeeded),
            Failed = group.Count(x => x.Status != AiRequestStatus.Succeeded),
            InputTokens = group.Sum(x => (long?)x.InputTokens) ?? 0,
            OutputTokens = group.Sum(x => (long?)x.OutputTokens) ?? 0,
            TotalTokens = group.Sum(x => (long?)x.TotalTokens) ?? 0,
            PricedCount = group.Count(x => x.EstimatedCostUsd.HasValue),
            Cost = group.Sum(x => x.EstimatedCostUsd),
            AverageDuration = group.Average(x => (decimal?)x.DurationMilliseconds)
        }).SingleOrDefaultAsync(cancellationToken);

        return aggregate is null
            ? new AiUsageSummaryData(0, 0, 0, 0, 0, 0, 0, null, null)
            : new AiUsageSummaryData(aggregate.RequestsToday, aggregate.RequestsThisMonth, aggregate.Succeeded,
                aggregate.Failed, aggregate.InputTokens, aggregate.OutputTokens, aggregate.TotalTokens,
                aggregate.PricedCount == 0 ? null : aggregate.Cost, aggregate.AverageDuration);
    }

    public async Task<AiCostRecalculationResult> RecalculateMissingCostsAsync(
        IOpenAiUsageCostCalculator calculator, CancellationToken cancellationToken)
    {
        var updated = 0;
        var skipped = 0;
        var records = await dbContext.AiUsageRecords
            .Where(x => x.EstimatedCostUsd == null).ToListAsync(cancellationToken);
        foreach (var record in records)
        {
            var cost = calculator.Calculate(record.Model, record.InputTokens, record.OutputTokens);
            if (cost.HasValue)
            {
                record.SetEstimatedCost(cost.Value);
                updated++;
            }
            else skipped++;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return new AiCostRecalculationResult(updated, skipped);
    }

    public async Task<PagedResult<AiUsageItem>> GetHistoryAsync(AiUsageQuery query, CancellationToken cancellationToken)
    {
        var records = dbContext.AiUsageRecords.AsNoTracking().AsQueryable();
        if (query.From.HasValue) records = records.Where(x => x.StartedAt >= query.From.Value);
        if (query.To.HasValue) records = records.Where(x => x.StartedAt < query.To.Value);
        if (query.Status.HasValue) records = records.Where(x => x.Status == query.Status.Value);
        if (!string.IsNullOrWhiteSpace(query.Model)) records = records.Where(x => x.Model == query.Model);
        if (!string.IsNullOrWhiteSpace(query.Operation)) records = records.Where(x => x.Operation == query.Operation);
        var totalCount = await records.CountAsync(cancellationToken);
        var items = await records.OrderByDescending(x => x.StartedAt).ThenByDescending(x => x.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(x => new AiUsageItem(x.Id, x.StartedAt, x.Operation, x.Model, x.Status, x.InputTokens,
                x.OutputTokens, x.TotalTokens, x.DurationMilliseconds, x.EstimatedCostUsd))
            .ToListAsync(cancellationToken);
        return new PagedResult<AiUsageItem>(items, query.Page, query.PageSize, totalCount,
            (int)Math.Ceiling(totalCount / (double)query.PageSize));
    }
}
