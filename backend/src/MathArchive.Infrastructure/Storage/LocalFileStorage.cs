using MathArchive.Application.Files;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MathArchive.Infrastructure.Storage;

public sealed class LocalFileStorage(
    IOptions<LocalStorageOptions> options,
    ILogger<LocalFileStorage> logger) : IFileStorage
{
    private readonly string rootPath = Path.GetFullPath(options.Value.RootPath);

    public async Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(rootPath);

        var extension = Path.GetExtension(originalFileName).ToLowerInvariant();
        var storedFileName = $"{Guid.NewGuid():N}{extension}";
        var targetPath = GetSafePath(storedFileName);

        try
        {
            long length;
            await using (var targetStream = File.Create(targetPath))
            {
                await stream.CopyToAsync(targetStream, cancellationToken);
                length = targetStream.Length;
            }

            return new StoredFileResult(Path.GetFileName(originalFileName), storedFileName, contentType, length);
        }
        catch (Exception saveException)
        {
            try
            {
                if (File.Exists(targetPath))
                {
                    File.Delete(targetPath);
                }
            }
            catch (Exception cleanupException)
            {
                logger.LogWarning(
                    cleanupException,
                    "Failed to remove partially written file {StoredFileName} after file save failed with {SaveExceptionType}.",
                    storedFileName,
                    saveException.GetType().Name);
            }

            throw;
        }
    }

    public Task<Stream?> TryOpenReadAsync(string storedFileName, CancellationToken cancellationToken)
    {
        var path = GetSafePath(storedFileName);
        if (!File.Exists(path))
        {
            return Task.FromResult<Stream?>(null);
        }

        return Task.FromResult<Stream?>(File.OpenRead(path));
    }

    public Task DeleteAsync(string storedFileName, CancellationToken cancellationToken)
    {
        var path = GetSafePath(storedFileName);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private string GetSafePath(string storedFileName)
    {
        var fileName = Path.GetFileName(storedFileName);
        var fullPath = Path.GetFullPath(Path.Combine(rootPath, fileName));

        if (!fullPath.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Stored file name resolves outside the storage root.");
        }

        return fullPath;
    }
}
