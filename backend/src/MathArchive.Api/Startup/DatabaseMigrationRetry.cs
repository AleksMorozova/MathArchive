using System.Data.Common;
using System.Net.Sockets;

namespace MathArchive.Api.Startup;

internal static class DatabaseMigrationRetry
{
    private static readonly IReadOnlyList<TimeSpan> DefaultRetryDelays =
    [
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(4)
    ];

    internal static Task ExecuteAsync(
        Func<CancellationToken, Task> migrateAsync,
        ILogger logger,
        CancellationToken cancellationToken) =>
        ExecuteAsync(migrateAsync, logger, DefaultRetryDelays, cancellationToken);

    internal static async Task ExecuteAsync(
        Func<CancellationToken, Task> migrateAsync,
        ILogger logger,
        IReadOnlyList<TimeSpan> retryDelays,
        CancellationToken cancellationToken)
    {
        var maximumAttempts = retryDelays.Count + 1;

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await migrateAsync(cancellationToken);
                return;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception) when (attempt < maximumAttempts && IsTransient(exception))
            {
                var retryDelay = retryDelays[attempt - 1];
                logger.LogWarning(
                    exception,
                    "Database migration attempt {Attempt} of {MaximumAttempts} failed with a transient error. Retrying in {RetryDelaySeconds} seconds",
                    attempt,
                    maximumAttempts,
                    retryDelay.TotalSeconds);

                await Task.Delay(retryDelay, cancellationToken);
            }
            catch (Exception exception)
            {
                logger.LogError(
                    exception,
                    "Database migration failed after {AttemptCount} attempt(s). Application startup cannot continue",
                    attempt);
                throw;
            }
        }
    }

    private static bool IsTransient(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is DbException { IsTransient: true }
                or TimeoutException
                or IOException
                or SocketException)
            {
                return true;
            }
        }

        return false;
    }
}
