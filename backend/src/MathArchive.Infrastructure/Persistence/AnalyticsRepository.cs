using MathArchive.Application.Analytics;
using MathArchive.Domain.Analytics;
using Microsoft.EntityFrameworkCore;

namespace MathArchive.Infrastructure.Persistence;

public sealed class AnalyticsRepository(MathArchiveDbContext dbContext) : IAnalyticsRepository
{
    public Task<bool> DocumentExistsAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Documents.AnyAsync(x => x.Id == id, cancellationToken);

    public async Task AddAsync(AnalyticsEvent analyticsEvent, CancellationToken cancellationToken)
    {
        dbContext.AnalyticsEvents.Add(analyticsEvent);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<AnalyticsReport> GetReportAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken)
    {
        var events = dbContext.AnalyticsEvents.AsNoTracking().Where(x => x.CreatedAt >= from && x.CreatedAt < to);
        // One aggregate query gives the summary and table the same snapshot without loading raw events.
        var counts = await (from item in events
                            join document in dbContext.Documents on item.DocumentId equals document.Id into documents
                            from document in documents.DefaultIfEmpty()
                            group item by new { item.DocumentId, Title = document == null ? null : document.Title } into activity
                            select new
                            {
                                activity.Key.DocumentId,
                                activity.Key.Title,
                                SiteVisits = activity.Count(x => x.EventType == AnalyticsEventType.SiteVisit),
                                Previews = activity.Count(x => x.EventType == AnalyticsEventType.DocumentPreview),
                                Downloads = activity.Count(x => x.EventType == AnalyticsEventType.DocumentDownload)
                            }).ToListAsync(cancellationToken);
        return new AnalyticsReport(
            new AnalyticsSummary(counts.Sum(x => x.SiteVisits), counts.Sum(x => x.Previews), counts.Sum(x => x.Downloads)),
            counts.Where(x => x.DocumentId.HasValue)
                .OrderByDescending(x => x.Downloads).ThenByDescending(x => x.Previews).ThenBy(x => x.DocumentId)
                .Select(x => new DocumentAnalytics(x.DocumentId!.Value, x.Title, x.Previews, x.Downloads)).ToArray());
    }
}
