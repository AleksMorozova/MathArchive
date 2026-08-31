using FluentValidation;
using MathArchive.Application.Analytics;
using MathArchive.Application.Common;
using MathArchive.Domain.Analytics;

namespace MathArchive.Application.Tests;

public sealed class AnalyticsServiceTests
{
    [Theory]
    [InlineData(AnalyticsEventType.SiteVisit)]
    [InlineData(AnalyticsEventType.DocumentPreview)]
    [InlineData(AnalyticsEventType.DocumentDownload)]
    public async Task RecordAsync_records_valid_events_with_server_utc_time(AnalyticsEventType type)
    {
        var repository = new Repository();
        var request = new RecordAnalyticsEvent(Guid.NewGuid(), type, type == AnalyticsEventType.SiteVisit ? null : Guid.NewGuid());
        await Service(repository).RecordAsync(request, CancellationToken.None);
        var item = Assert.Single(repository.Events);
        Assert.Equal(request.SessionId, item.SessionId);
        Assert.Equal(type, item.EventType);
        Assert.Equal(request.DocumentId, item.DocumentId);
        Assert.Equal(new Clock().UtcNow.ToUniversalTime(), item.CreatedAt);
        Assert.Equal(TimeSpan.Zero, item.CreatedAt.Offset);
    }

    [Theory]
    [InlineData(AnalyticsEventType.SiteVisit, true)]
    [InlineData(AnalyticsEventType.DocumentPreview, false)]
    [InlineData(AnalyticsEventType.DocumentDownload, false)]
    [InlineData((AnalyticsEventType)999, false)]
    public async Task RecordAsync_rejects_invalid_event_document_combinations(AnalyticsEventType type, bool hasDocument)
    {
        var repository = new Repository();
        await Assert.ThrowsAsync<ValidationException>(() => Service(repository).RecordAsync(
            new(Guid.NewGuid(), type, hasDocument ? Guid.NewGuid() : null), CancellationToken.None));
        Assert.Empty(repository.Events);
    }

    [Fact]
    public async Task RecordAsync_rejects_empty_session_empty_document_and_unknown_document()
    {
        var repository = new Repository { Exists = false };
        var service = Service(repository);
        await Assert.ThrowsAsync<ValidationException>(() => service.RecordAsync(new(Guid.Empty, AnalyticsEventType.SiteVisit, null), CancellationToken.None));
        await Assert.ThrowsAsync<ValidationException>(() => service.RecordAsync(new(Guid.NewGuid(), AnalyticsEventType.DocumentDownload, Guid.Empty), CancellationToken.None));
        await Assert.ThrowsAsync<ValidationException>(() => service.RecordAsync(new(Guid.NewGuid(), AnalyticsEventType.DocumentPreview, Guid.NewGuid()), CancellationToken.None));
        Assert.Empty(repository.Events);
    }

    [Fact]
    public async Task Report_validates_range_and_normalizes_offsets()
    {
        var repository = new Repository();
        var service = Service(repository);
        var from = DateTimeOffset.Parse("2026-08-31T00:00:00+03:00");
        var to = from.AddDays(1);
        await Assert.ThrowsAsync<ValidationException>(() => service.GetReportAsync(null, to, CancellationToken.None));
        await Assert.ThrowsAsync<ValidationException>(() => service.GetReportAsync(to, from, CancellationToken.None));
        await Assert.ThrowsAsync<ValidationException>(() => service.GetReportAsync(from, from, CancellationToken.None));
        await service.GetReportAsync(from, to, CancellationToken.None);
        Assert.Equal(from.ToUniversalTime(), repository.From);
        Assert.Equal(to.ToUniversalTime(), repository.To);
        Assert.Equal(TimeSpan.Zero, repository.From.Offset);
    }

    private static AnalyticsService Service(Repository repository) => new(repository, new Clock(), new RecordAnalyticsEventValidator());
    private sealed class Clock : IClock { public DateTimeOffset UtcNow => DateTimeOffset.Parse("2026-08-31T10:00:00+03:00"); }
    private sealed class Repository : IAnalyticsRepository
    {
        public List<AnalyticsEvent> Events { get; } = [];
        public bool Exists { get; init; } = true;
        public DateTimeOffset From { get; private set; }
        public DateTimeOffset To { get; private set; }
        public Task<bool> DocumentExistsAsync(Guid id, CancellationToken cancellationToken) => Task.FromResult(Exists);
        public Task AddAsync(AnalyticsEvent item, CancellationToken cancellationToken) { Events.Add(item); return Task.CompletedTask; }
        public Task<AnalyticsReport> GetReportAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken)
        {
            From = from; To = to;
            return Task.FromResult(new AnalyticsReport(new(0, 0, 0), []));
        }
    }
}
