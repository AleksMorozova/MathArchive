using MathArchive.Api.Health;
using MathArchive.Infrastructure.Storage;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Tests;

public sealed class HealthCheckTests
{
    [Fact]
    public async Task FileStorageHealthCheck_returns_healthy_when_storage_is_readable_and_writable()
    {
        var rootPath = Path.Combine(Path.GetTempPath(), $"matharchive-health-{Guid.NewGuid():N}");
        var healthCheck = new FileStorageHealthCheck(Options.Create(new LocalStorageOptions { RootPath = rootPath }));

        try
        {
            var result = await healthCheck.CheckHealthAsync(new HealthCheckContext(), CancellationToken.None);

            Assert.Equal(HealthStatus.Healthy, result.Status);
        }
        finally
        {
            if (Directory.Exists(rootPath))
            {
                Directory.Delete(rootPath, recursive: true);
            }
        }
    }
}