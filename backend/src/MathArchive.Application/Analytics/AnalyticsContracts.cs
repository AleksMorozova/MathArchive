using MathArchive.Domain.Analytics;

namespace MathArchive.Application.Analytics;

public sealed record RecordAnalyticsEvent(Guid SessionId, AnalyticsEventType EventType, Guid? DocumentId);
public sealed record AnalyticsSummary(int SiteVisits, int DocumentPreviews, int DocumentDownloads);
public sealed record DocumentAnalytics(Guid DocumentId, string? Title, int PreviewCount, int DownloadCount);
public sealed record AnalyticsReport(AnalyticsSummary Summary, IReadOnlyList<DocumentAnalytics> Documents);

public interface IAnalyticsRepository
{
    Task<bool> DocumentExistsAsync(Guid id, CancellationToken cancellationToken);
    Task AddAsync(AnalyticsEvent analyticsEvent, CancellationToken cancellationToken);
    Task<AnalyticsReport> GetReportAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken);
}
