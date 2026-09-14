using MathArchive.Infrastructure.Storage;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace MathArchive.Api.Health;

public sealed class FileStorageHealthCheck(IOptions<LocalStorageOptions> options) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var rootPath = Path.GetFullPath(options.Value.RootPath);
        var probeFilePath = Path.Combine(rootPath, $".health-{Guid.NewGuid():N}.tmp");

        try
        {
            Directory.CreateDirectory(rootPath);

            await File.WriteAllTextAsync(probeFilePath, "ok", cancellationToken);
            var content = await File.ReadAllTextAsync(probeFilePath, cancellationToken);

            return content == "ok"
                ? HealthCheckResult.Healthy("File storage is writable and readable.")
                : HealthCheckResult.Unhealthy("File storage health probe returned unexpected content.");
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("File storage health check failed.", exception);
        }
        finally
        {
            try
            {
                if (File.Exists(probeFilePath))
                {
                    File.Delete(probeFilePath);
                }
            }
            catch
            {
                // Health status should reflect the read/write probe; cleanup failure leaves a harmless temp file.
            }
        }
    }
}