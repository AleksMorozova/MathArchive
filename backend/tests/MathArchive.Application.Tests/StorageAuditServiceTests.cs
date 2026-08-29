using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Application.StorageAudit;
using MathArchive.Domain.Documents;
using Microsoft.Extensions.Logging.Abstractions;

namespace MathArchive.Application.Tests;

public sealed class StorageAuditServiceTests
{
    [Fact]
    public async Task AuditAsync_classifies_missing_orphaned_and_size_mismatched_files()
    {
        var repository = new AuditRepository([
            new(Guid.Parse("11111111-1111-1111-1111-111111111111"), "Missing", "missing.pdf", 10),
            new(Guid.Parse("22222222-2222-2222-2222-222222222222"), "Changed", "changed.pdf", 20),
            new(Guid.Parse("33333333-3333-3333-3333-333333333333"), "Valid", "valid.pdf", 30)
        ]);
        var storage = new AuditStorage([
            new("changed.pdf", 21, DateTimeOffset.Parse("2026-08-01T00:00:00Z")),
            new("valid.pdf", 30, DateTimeOffset.Parse("2026-08-01T00:00:00Z")),
            new("orphan.pdf", 40, DateTimeOffset.Parse("2026-08-01T00:00:00Z"))
        ]);

        var report = await CreateService(repository, storage).AuditAsync(CancellationToken.None);

        Assert.False(report.IsHealthy);
        Assert.Equal(3, report.ReferencedFileCount);
        Assert.Equal(3, report.StoredFileCount);
        Assert.Equal(91, report.StoredBytes);
        Assert.Equal(40, report.ReclaimableBytes);
        Assert.Equal("missing.pdf", Assert.Single(report.MissingFiles).StoredFileName);
        Assert.Equal("orphan.pdf", Assert.Single(report.OrphanedFiles).StoredFileName);
        Assert.Equal(21, Assert.Single(report.SizeMismatches).ActualFileSize);
    }

    [Fact]
    public async Task DeleteOrphansAsync_rechecks_references_before_each_delete()
    {
        var repository = new AuditRepository([]);
        var storage = new AuditStorage([
            new("keep.pdf", 10, DateTimeOffset.UtcNow),
            new("delete.pdf", 20, DateTimeOffset.UtcNow)
        ]);
        repository.OnReferencesRead = read => read == 2
            ? [new(Guid.NewGuid(), "Uploaded concurrently", "keep.pdf", 10)]
            : repository.References;

        var result = await CreateService(repository, storage).DeleteOrphansAsync(CancellationToken.None);

        Assert.Equal(["delete.pdf"], storage.DeletedFiles);
        Assert.Equal(1, result.DeletedFileCount);
        Assert.Equal(20, result.ReclaimedBytes);
    }

    private static StorageAuditService CreateService(AuditRepository repository, AuditStorage storage) =>
        new(repository, storage, new FixedClock(), NullLogger<StorageAuditService>.Instance);

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow => DateTimeOffset.Parse("2026-08-29T12:00:00Z");
    }

    private sealed class AuditRepository(IReadOnlyList<DocumentStorageReference> references) : IDocumentRepository
    {
        private int reads;
        public IReadOnlyList<DocumentStorageReference> References { get; } = references;
        public Func<int, IReadOnlyList<DocumentStorageReference>>? OnReferencesRead { get; set; }
        public Task<IReadOnlyList<DocumentStorageReference>> GetStorageReferencesAsync(CancellationToken cancellationToken) =>
            Task.FromResult(OnReferencesRead?.Invoke(++reads) ?? References);
        public Task<MathArchive.Application.Common.PagedResult<Document>> SearchAsync(DocumentQueryParameters parameters, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<Document?> GetByIdAsync(Guid id, bool track, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<string>> GetTopicsAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public void Add(Document document) => throw new NotSupportedException();
        public void Remove(Document document) => throw new NotSupportedException();
        public Task SaveChangesAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class AuditStorage(IEnumerable<StoredFileInfo> files) : IFileStorage
    {
        private readonly List<StoredFileInfo> files = [.. files];
        public List<string> DeletedFiles { get; } = [];
        public Task<IReadOnlyList<StoredFileInfo>> ListAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<StoredFileInfo>>([.. files]);
        public Task DeleteAsync(string storedFileName, CancellationToken cancellationToken)
        {
            DeletedFiles.Add(storedFileName);
            files.RemoveAll(file => string.Equals(file.StoredFileName, storedFileName, StringComparison.OrdinalIgnoreCase));
            return Task.CompletedTask;
        }
        public Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<Stream?> TryOpenReadAsync(string storedFileName, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
