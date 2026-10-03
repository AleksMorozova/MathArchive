using MathArchive.Domain.Assistant;
using MathArchive.Infrastructure.Persistence;
using MathArchive.Application.Assistant;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MathArchive.Infrastructure.Assistant;

public sealed class AssistantAuditRetention(IServiceScopeFactory scopes, ILogger<AssistantAuditRetention> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // No paid work or indexing runs in this task; it only enforces audit privacy retention.
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var store = scope.ServiceProvider.GetRequiredService<IAssistantStore>();
                var settings = await store.GetSettingsAsync(stoppingToken);
                var before = DateTimeOffset.UtcNow.AddDays(-settings.RetentionDays);
                await scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>().Set<AssistantRequest>()
                    .Where(x => x.CreatedAt < before).ExecuteDeleteAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { logger.LogError(ex, "Assistant audit retention cleanup failed"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
