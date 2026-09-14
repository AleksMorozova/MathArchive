using System.Data.Common;
using MathArchive.Api.Startup;
using Microsoft.Extensions.Logging.Abstractions;

namespace MathArchive.Application.Tests;

public sealed class DatabaseMigrationRetryTests
{
    private static readonly IReadOnlyList<TimeSpan> ImmediateRetryDelays =
    [
        TimeSpan.Zero,
        TimeSpan.Zero
    ];

    [Fact]
    public async Task ExecuteAsync_TransientFailuresThenSuccess_CompletesAfterRetries()
    {
        var attemptCount = 0;

        await DatabaseMigrationRetry.ExecuteAsync(
            _ =>
            {
                attemptCount++;
                return attemptCount < 3
                    ? Task.FromException(new TimeoutException("Temporary database timeout."))
                    : Task.CompletedTask;
            },
            NullLogger.Instance,
            ImmediateRetryDelays,
            CancellationToken.None);

        Assert.Equal(3, attemptCount);
    }

    [Fact]
    public async Task ExecuteAsync_TransientFailuresExhausted_RethrowsLastFailure()
    {
        var attemptCount = 0;
        var finalFailure = new TimeoutException("Database remained unavailable.");

        var thrown = await Assert.ThrowsAsync<TimeoutException>(() =>
            DatabaseMigrationRetry.ExecuteAsync(
                _ =>
                {
                    attemptCount++;
                    return Task.FromException(finalFailure);
                },
                NullLogger.Instance,
                ImmediateRetryDelays,
                CancellationToken.None));

        Assert.Same(finalFailure, thrown);
        Assert.Equal(3, attemptCount);
    }

    [Fact]
    public async Task ExecuteAsync_NonTransientFailure_FailsImmediately()
    {
        var attemptCount = 0;

        await Assert.ThrowsAsync<NonTransientDatabaseException>(() =>
            DatabaseMigrationRetry.ExecuteAsync(
                _ =>
                {
                    attemptCount++;
                    return Task.FromException(new NonTransientDatabaseException("Invalid migration."));
                },
                NullLogger.Instance,
                ImmediateRetryDelays,
                CancellationToken.None));

        Assert.Equal(1, attemptCount);
    }

    [Fact]
    public async Task ExecuteAsync_CancellationDuringRetryDelay_StopsRetrying()
    {
        var attemptCount = 0;
        using var cancellationSource = new CancellationTokenSource();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            DatabaseMigrationRetry.ExecuteAsync(
                _ =>
                {
                    attemptCount++;
                    cancellationSource.Cancel();
                    return Task.FromException(new TimeoutException("Temporary database timeout."));
                },
                NullLogger.Instance,
                [TimeSpan.FromSeconds(1)],
                cancellationSource.Token));

        Assert.Equal(1, attemptCount);
    }

    private sealed class NonTransientDatabaseException(string message) : DbException(message)
    {
        public override bool IsTransient => false;
    }
}
