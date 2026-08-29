namespace MathArchive.Application.StorageAudit;

public sealed record MissingStoredFile(Guid DocumentId, string Title, string StoredFileName);

public sealed record OrphanedStoredFile(string StoredFileName, long FileSize, DateTimeOffset LastModifiedAt);

public sealed record SizeMismatch(Guid DocumentId, string Title, string StoredFileName, long ExpectedFileSize, long ActualFileSize);

public sealed record StorageAuditReport(
    DateTimeOffset CheckedAt,
    int ReferencedFileCount,
    int StoredFileCount,
    long StoredBytes,
    long ReclaimableBytes,
    IReadOnlyList<MissingStoredFile> MissingFiles,
    IReadOnlyList<OrphanedStoredFile> OrphanedFiles,
    IReadOnlyList<SizeMismatch> SizeMismatches)
{
    public bool IsHealthy => MissingFiles.Count == 0 && OrphanedFiles.Count == 0 && SizeMismatches.Count == 0;
}

public sealed record StorageCleanupResult(int DeletedFileCount, long ReclaimedBytes, StorageAuditReport CurrentState);
