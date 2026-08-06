using MathArchive.Application.Files;
using Microsoft.Extensions.Options;

namespace MathArchive.Infrastructure.Storage;

public sealed class LocalFileStorage(IOptions<LocalStorageOptions> options) : IFileStorage
{
    private readonly string rootPath = Path.GetFullPath(options.Value.RootPath);

    public async Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(rootPath);

        var extension = Path.GetExtension(originalFileName).ToLowerInvariant();
        var storedFileName = $"{Guid.NewGuid():N}{extension}";
        var targetPath = GetSafePath(storedFileName);

        await using var targetStream = File.Create(targetPath);
        await stream.CopyToAsync(targetStream, cancellationToken);

        var length = targetStream.Length;
        return new StoredFileResult(Path.GetFileName(originalFileName), storedFileName, contentType, length);
    }

    public Task<Stream> OpenReadAsync(string storedFileName, CancellationToken cancellationToken)
    {
        var stream = File.OpenRead(GetSafePath(storedFileName));
        return Task.FromResult<Stream>(stream);
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
