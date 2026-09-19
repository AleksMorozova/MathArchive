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
        Assert.Equal(0.00571995m, summary!.EstimatedCostThisMonthUsd);
        await using var verify = Context();
        Assert.Equal(2, await verify.AiUsageRecords.CountAsync(x => x.EstimatedCostUsd.HasValue));
    }

    private MathArchiveDbContext Context() => new(new DbContextOptionsBuilder<MathArchiveDbContext>()
        .UseNpgsql(fixture.ConnectionString).Options);

    private static AiUsageRecord Record(DateTimeOffset at, string model, int? input, int? output, decimal? cost) =>
        new(at, "MaterialAnalysis", model, AiRequestStatus.Succeeded, 100, input, output,
            input + output, 200, null, null, cost, "admin");
}
