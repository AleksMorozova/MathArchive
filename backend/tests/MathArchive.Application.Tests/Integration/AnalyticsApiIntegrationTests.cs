using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MathArchive.Application.Analytics;
using MathArchive.Domain.Analytics;
using MathArchive.Domain.Documents;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class AnalyticsApiIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private MathArchiveDbContext Context() => new(new DbContextOptionsBuilder<MathArchiveDbContext>().UseNpgsql(fixture.ConnectionString).Options);

    [Fact]
    public async Task Rename_migration_preserves_historical_file_open_events()
    {
        // This fixture owns an isolated temporary database; never downgrade the application's database.
        await using var db = Context();
        var document = CreateDocument("Historical open");
        db.Documents.Add(document);
        await db.SaveChangesAsync();
        var id = Guid.NewGuid();
        var session = Guid.NewGuid();
        var createdAt = DateTimeOffset.Parse("2026-08-31T10:00:00Z");
        var migrator = db.GetService<IMigrator>();
        try
        {
            await migrator.MigrateAsync("20260831135409_AddAnalyticsEvents");
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO analytics_events (id, session_id, event_type, document_id, created_at) VALUES ({id}, {session}, {"DocumentView"}, {document.Id}, {createdAt})");
        }
        finally
        {
            await migrator.MigrateAsync();
        }
        var item = await db.AnalyticsEvents.SingleAsync();
        Assert.Equal(id, item.Id);
        Assert.Equal(session, item.SessionId);
        Assert.Equal(createdAt, item.CreatedAt);
        Assert.Equal(document.Id, item.DocumentId);
        Assert.Equal(AnalyticsEventType.DocumentDownload, item.EventType);
        var report = await new AnalyticsRepository(db).GetReportAsync(createdAt, createdAt.AddDays(1), CancellationToken.None);
        Assert.Equal(1, report.Summary.DocumentDownloads);
        Assert.Equal(1, Assert.Single(report.Documents).DownloadCount);
    }

    [Theory]
    [InlineData(AnalyticsEventType.SiteVisit)]
    [InlineData(AnalyticsEventType.DocumentPreview)]
    [InlineData(AnalyticsEventType.DocumentDownload)]
    public async Task Public_endpoint_records_each_event(AnalyticsEventType type)
    {
        await using var db = Context();
        var document = CreateDocument("Material");
        db.Documents.Add(document);
        await db.SaveChangesAsync();
        using var client = fixture.CreateClient();
        var request = new RecordAnalyticsEvent(Guid.NewGuid(), type, type == AnalyticsEventType.SiteVisit ? null : document.Id);
        var response = await client.PostAsync("/api/analytics/events", JsonContent.Create(request, options: fixture.JsonOptions));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var item = await db.AnalyticsEvents.SingleAsync();
        Assert.Equal(request.SessionId, item.SessionId);
        Assert.Equal(request.EventType, item.EventType);
        Assert.Equal(request.DocumentId, item.DocumentId);
        Assert.Equal(TimeSpan.Zero, item.CreatedAt.Offset);
        using var admin = await fixture.CreateAuthorizedClientAsync();
        var from = Uri.EscapeDataString(item.CreatedAt.AddSeconds(-1).ToString("O"));
        var to = Uri.EscapeDataString(item.CreatedAt.AddSeconds(1).ToString("O"));
        var reportResponse = await admin.GetAsync($"/api/admin/analytics?from={from}&to={to}");
        reportResponse.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await reportResponse.Content.ReadAsStringAsync());
        var summary = json.RootElement.GetProperty("summary");
        Assert.Equal(type == AnalyticsEventType.DocumentDownload ? 1 : 0, summary.GetProperty("documentDownloads").GetInt32());
        Assert.False(summary.TryGetProperty("documentViews", out _));
        if (request.DocumentId.HasValue)
        {
            var row = Assert.Single(json.RootElement.GetProperty("documents").EnumerateArray());
            Assert.Equal(request.DocumentId, row.GetProperty("documentId").GetGuid());
            Assert.Equal(type == AnalyticsEventType.DocumentDownload ? 1 : 0, row.GetProperty("downloadCount").GetInt32());
            Assert.Equal(type == AnalyticsEventType.DocumentPreview ? 1 : 0, row.GetProperty("previewCount").GetInt32());
            Assert.False(row.TryGetProperty("viewCount", out _));
        }
    }

    [Theory]
    [InlineData("Unknown", null)]
    [InlineData("DocumentPreview", null)]
    [InlineData("DocumentDownload", "00000000-0000-0000-0000-000000000000")]
    [InlineData("DocumentDownload", "11111111-1111-4111-8111-111111111111")]
    [InlineData("SiteVisit", "11111111-1111-4111-8111-111111111111")]
    public async Task Public_endpoint_rejects_invalid_events(string eventType, string? documentId)
    {
        using var client = fixture.CreateClient();
        var response = await client.PostAsJsonAsync("/api/analytics/events", new { sessionId = Guid.NewGuid(), eventType, documentId });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        await using var db = Context();
        Assert.Empty(await db.AnalyticsEvents.ToListAsync());
    }

    [Fact]
    public async Task Report_requires_admin_and_valid_range()
    {
        using var anonymous = fixture.CreateClient();
        using var forbidden = fixture.CreateForbiddenClient();
        using var admin = await fixture.CreateAuthorizedClientAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/analytics")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await forbidden.GetAsync("/api/admin/analytics")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/analytics")).StatusCode);
    }

    [Fact]
    public async Task Report_filters_half_open_range_counts_both_types_and_sorts_with_zero_counters()
    {
        await using var db = Context();
        var first = CreateDocument("Most downloads");
        var second = CreateDocument("Preview only");
        var third = CreateDocument("Download only");
        db.Documents.AddRange(first, second, third);
        var from = DateTimeOffset.Parse("2026-08-30T21:00:00Z");
        var to = from.AddDays(1);
        var session = Guid.NewGuid();
        db.AnalyticsEvents.AddRange(
            new(session, AnalyticsEventType.SiteVisit, null, from.AddSeconds(-1)),
            new(session, AnalyticsEventType.SiteVisit, null, from),
            new(session, AnalyticsEventType.SiteVisit, null, to),
            new(session, AnalyticsEventType.DocumentPreview, first.Id, from),
            new(session, AnalyticsEventType.DocumentDownload, first.Id, from),
            new(session, AnalyticsEventType.DocumentDownload, third.Id, from),
            new(session, AnalyticsEventType.DocumentPreview, second.Id, from),
            new(session, AnalyticsEventType.DocumentPreview, second.Id, to.AddSeconds(-1)));
        await db.SaveChangesAsync();
        using var admin = await fixture.CreateAuthorizedClientAsync();
        var url = $"/api/admin/analytics?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}";
        var report = await admin.GetFromJsonAsync<AnalyticsReport>(url, fixture.JsonOptions);
        Assert.NotNull(report);
        Assert.Equal(new AnalyticsSummary(1, 3, 2), report.Summary);
        Assert.Collection(report.Documents,
            row => { Assert.Equal(first.Id, row.DocumentId); Assert.Equal(1, row.PreviewCount); Assert.Equal(1, row.DownloadCount); },
            row => { Assert.Equal(third.Id, row.DocumentId); Assert.Equal(0, row.PreviewCount); Assert.Equal(1, row.DownloadCount); },
            row => { Assert.Equal(second.Id, row.DocumentId); Assert.Equal(2, row.PreviewCount); Assert.Equal(0, row.DownloadCount); });
        db.Documents.Remove(first);
        await db.SaveChangesAsync();
        var afterDelete = await admin.GetFromJsonAsync<AnalyticsReport>(url, fixture.JsonOptions);
        Assert.Equal(report.Summary, afterDelete!.Summary);
        Assert.Null(afterDelete.Documents.Single(x => x.DocumentId == first.Id).Title);
        var empty = await admin.GetFromJsonAsync<AnalyticsReport>("/api/admin/analytics?from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z", fixture.JsonOptions);
        Assert.Equal(new AnalyticsSummary(0, 0, 0), empty!.Summary);
        Assert.Empty(empty.Documents);
    }

    private static Document CreateDocument(string title) => new(title, null, 7, "Topic", DocumentType.Theory, "file.pdf", $"{Guid.NewGuid()}.pdf", "application/pdf", 10, DateTimeOffset.UtcNow);
}
