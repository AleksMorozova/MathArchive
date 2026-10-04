using MathArchive.Application.Assistant;
using MathArchive.Domain.Assistant;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MathArchive.Infrastructure.Assistant;

// Single-instance, sequential processing of the existing persisted index states.
// No in-memory work list: Pending/Indexing survives restart; Failed requires an admin retry.
public sealed class RagPendingIndexer(IServiceScopeFactory scopes, ILogger<RagPendingIndexer> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = TimeSpan.FromSeconds(5);
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await ProcessPendingAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (AssistantException ex) when (ex.Category is "DailyBudget" or "Disabled")
            {
                delay = TimeSpan.FromMinutes(1);
                logger.LogInformation("Pending RAG processing paused: {Category}", ex.Category);
            }
            catch (Exception ex) { logger.LogError(ex, "Pending RAG processing failed; persisted work will be retried"); }
            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
        }
    }

    public static async Task ProcessPendingAsync(IServiceProvider services, CancellationToken ct)
    {
        var store = services.GetRequiredService<IAssistantStore>();
        var settings = await store.GetSettingsAsync(ct);
        if (!settings.RagEnabled || await store.DailySpendAsync(DateOnly.FromDateTime(DateTime.UtcNow), ct) >= settings.DailyBudgetUsd) return;
        var db = services.GetRequiredService<MathArchiveDbContext>();
        var ids = await db.Set<RagIndexState>().AsNoTracking()
            .Where(x => x.Status == "Pending" || x.Status == "Indexing")
            .OrderBy(x => x.MaterialId).Select(x => x.MaterialId).Take(20).ToArrayAsync(ct);
        var indexer = services.GetRequiredService<IRagIndexer>();
        foreach (var id in ids) await indexer.IndexAsync(id, false, ct);
    }
}
