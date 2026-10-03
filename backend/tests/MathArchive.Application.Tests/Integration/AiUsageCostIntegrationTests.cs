using System.Net;
using System.Net.Http.Json;
using MathArchive.Application.Ai;
using MathArchive.Domain.AiUsage;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class AiUsageCostIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Admin_recalculation_updates_only_missing_known_costs_and_summary_shows_partial_sum()
    {
        await using (var db = Context())
        {
            var now = DateTimeOffset.UtcNow;
            db.AiUsageRecords.AddRange(
                Record(now, "gpt-4o-mini", 37181, 113, null),
                Record(now, "gpt-4o-mini", 100, 100, 0.000075m),
                Record(now, "unknown-model", 100, 100, null),
                Record(now, "gpt-4o-mini", null, 100, null));
            await db.SaveChangesAsync();
        }

        using var anonymous = fixture.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsync("/api/admin/ai-usage/recalculate-costs", null)).StatusCode);
        using var admin = await fixture.CreateAuthorizedClientAsync();
        var first = await admin.PostAsync("/api/admin/ai-usage/recalculate-costs", null);
        first.EnsureSuccessStatusCode();
        Assert.Equal(new AiCostRecalculationResult(1, 2),
            await first.Content.ReadFromJsonAsync<AiCostRecalculationResult>(fixture.JsonOptions));
        var second = await admin.PostAsync("/api/admin/ai-usage/recalculate-costs", null);
        second.EnsureSuccessStatusCode();
        Assert.Equal(new AiCostRecalculationResult(0, 2),
            await second.Content.ReadFromJsonAsync<AiCostRecalculationResult>(fixture.JsonOptions));

        var summary = await admin.GetFromJsonAsync<AiUsageSummary>("/api/admin/ai-usage/summary", fixture.JsonOptions);
        Assert.Equal(0.00571995m, summary!.EstimatedCostUsd);
        await using var verify = Context();
        Assert.Equal(2, await verify.AiUsageRecords.CountAsync(x => x.EstimatedCostUsd.HasValue));
    }

    [Fact]
    public async Task Summary_and_history_use_the_same_filters_and_include_the_complete_end_date()
    {
        await using (var db = Context())
        {
            db.AiUsageRecords.AddRange(
                Record(new DateTimeOffset(2026, 9, 10, 0, 0, 0, TimeSpan.Zero), "gpt-5.6-luna", 10, 20, 0.1m),
                Record(new DateTimeOffset(2026, 9, 11, 23, 59, 59, TimeSpan.Zero), "gpt-5.6-luna", 30, 40, 0.2m,
                    AiRequestStatus.Failed, "MaterialAnalysis", 300),
                Record(new DateTimeOffset(2026, 9, 12, 0, 0, 0, TimeSpan.Zero), "gpt-5.6-luna", 50, 60, 0.3m),
                Record(new DateTimeOffset(2026, 9, 11, 12, 0, 0, TimeSpan.Zero), "other-model", 70, 80, 0.4m));
            await db.SaveChangesAsync();
        }

        using var admin = await fixture.CreateAuthorizedClientAsync();
        const string range = "from=2026-09-10T00%3A00%3A00Z&to=2026-09-12T00%3A00%3A00Z";
        var summary = await admin.GetFromJsonAsync<AiUsageSummary>(
            $"/api/admin/ai-usage/summary?{range}&model=%20GPT-5.6-LUNA%20", fixture.JsonOptions);
        var history = await admin.GetFromJsonAsync<MathArchive.Application.Common.PagedResult<AiUsageItem>>(
            $"/api/admin/ai-usage/history?{range}&model=%20GPT-5.6-LUNA%20&page=1&pageSize=20", fixture.JsonOptions);

        Assert.Equal(2, summary!.RequestsForPeriod);
        Assert.Equal(history!.TotalCount, summary.RequestsForPeriod);
        Assert.Equal(1, summary.Succeeded);
        Assert.Equal(1, summary.Failed);
        Assert.Equal(40, summary.InputTokens);
        Assert.Equal(60, summary.OutputTokens);
        Assert.Equal(100, summary.TotalTokens);
        Assert.Equal(0.3m, summary.EstimatedCostUsd);
        Assert.Equal(200m, summary.AverageDurationMilliseconds);

        var failed = await admin.GetFromJsonAsync<AiUsageSummary>(
            $"/api/admin/ai-usage/summary?{range}&status=Failed&model=gpt-5.6-luna&operation=materialanalysis",
            fixture.JsonOptions);
        Assert.Equal(1, failed!.RequestsForPeriod);
        Assert.Equal(0, failed.Succeeded);
        Assert.Equal(1, failed.Failed);
        Assert.Equal(0.2m, failed.EstimatedCostUsd);
    }

    private MathArchiveDbContext Context() => new(new DbContextOptionsBuilder<MathArchiveDbContext>()
        .UseNpgsql(fixture.ConnectionString).Options);

    private static AiUsageRecord Record(DateTimeOffset at, string model, int? input, int? output, decimal? cost,
        AiRequestStatus status = AiRequestStatus.Succeeded, string operation = "MaterialAnalysis", long duration = 100) =>
        new(at, operation, model, status, duration, input, output,
            input + output, 200, null, null, cost, "admin");
}
