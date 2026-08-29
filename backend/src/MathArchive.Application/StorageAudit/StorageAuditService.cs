using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using Microsoft.Extensions.Logging;

namespace MathArchive.Application.StorageAudit;

public sealed class StorageAuditService(
    IDocumentRepository documentRepository,
    IFileStorage fileStorage,
    IClock clock,
    ILogger<StorageAuditService> logger)
{
    public async Task<StorageAuditReport> AuditAsync(CancellationToken cancellationToken)
    {
        var references = await documentRepository.GetStorageReferencesAsync(cancellationToken);
        var files = await fileStorage.ListAsync(cancellationToken);
        return BuildReport(references, files);
    }

    public async Task<StorageCleanupResult> DeleteOrphansAsync(CancellationToken cancellationToken)
    {
        var before = await AuditAsync(cancellationToken);
        var deletedCount = 0;
        long reclaimedBytes = 0;

        foreach (var orphan in before.OrphanedFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            // Re-read references immediately before each delete. Valid referenced content wins
            // over perfect cleanup if an upload completed after the initial audit.
            var references = await documentRepository.GetStorageReferencesAsync(cancellationToken);
            if (references.Any(reference => FileNameEquals(reference.StoredFileName, orphan.StoredFileName)))
            {
                logger.LogInformation("Skipped orphan candidate {StoredFileName} because it became referenced.", orphan.StoredFileName);
                continue;
            }

            await fileStorage.DeleteAsync(orphan.StoredFileName, cancellationToken);
            deletedCount++;
            reclaimedBytes += orphan.FileSize;
            logger.LogInformation("Deleted orphaned material file {StoredFileName} ({FileSize} bytes).", orphan.StoredFileName, orphan.FileSize);
        }

        return new StorageCleanupResult(deletedCount, reclaimedBytes, await AuditAsync(cancellationToken));
    }

    private StorageAuditReport BuildReport(
        IReadOnlyList<DocumentStorageReference> references,
        IReadOnlyList<StoredFileInfo> files)
    {
        var filesByName = files.ToDictionary(file => file.StoredFileName, StringComparer.OrdinalIgnoreCase);
        var referencedNames = references.Select(reference => reference.StoredFileName).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var missing = references
            .Where(reference => !filesByName.ContainsKey(reference.StoredFileName))
            .Select(reference => new MissingStoredFile(reference.DocumentId, reference.Title, reference.StoredFileName))
            .ToList();
        var orphans = files
            .Where(file => !referencedNames.Contains(file.StoredFileName))
            .Select(file => new OrphanedStoredFile(file.StoredFileName, file.FileSize, file.LastModifiedAt))
            .ToList();
        var mismatches = references
            .Where(reference => filesByName.TryGetValue(reference.StoredFileName, out var file) && file.FileSize != reference.ExpectedFileSize)
            .Select(reference => new SizeMismatch(
                reference.DocumentId,
                reference.Title,
                reference.StoredFileName,
                reference.ExpectedFileSize,
                filesByName[reference.StoredFileName].FileSize))
            .ToList();

        return new StorageAuditReport(
            clock.UtcNow,
            references.Count,
            files.Count,
            files.Sum(file => file.FileSize),
            orphans.Sum(file => file.FileSize),
            missing,
            orphans,
            mismatches);
    }

    private static bool FileNameEquals(string left, string right) =>
        string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
}
