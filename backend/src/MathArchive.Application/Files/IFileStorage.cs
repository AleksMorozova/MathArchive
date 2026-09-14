namespace MathArchive.Application.Files;

public interface IFileStorage
{
    Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken);

    Task<Stream?> TryOpenReadAsync(string storedFileName, CancellationToken cancellationToken);

    Task DeleteAsync(string storedFileName, CancellationToken cancellationToken);

    Task<IReadOnlyList<StoredFileInfo>> ListAsync(CancellationToken cancellationToken) =>
        throw new NotSupportedException("This storage implementation does not support enumeration.");
}
