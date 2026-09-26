using MathArchive.Application.Ai;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MathArchive.Infrastructure.Ai;

public sealed class AiUsageCostBackfillService(
    IServiceScopeFactory scopeFactory,
    ILogger<AiUsageCostBackfillService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var repository = scope.ServiceProvider.GetRequiredService<IAiUsageRepository>();
            var calculator = scope.ServiceProvider.GetRequiredService<IOpenAiUsageCostCalculator>();
            var result = await repository.RecalculateMissingCostsAsync(calculator, cancellationToken);
            if (result.Updated > 0)
            {
                logger.LogInformation(
                    "Backfilled estimated costs for {UpdatedCount} AI usage records; {SkippedCount} records remain unpriced.",
                    result.Updated,
                    result.Skipped);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "AI usage cost backfill failed during application startup.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
