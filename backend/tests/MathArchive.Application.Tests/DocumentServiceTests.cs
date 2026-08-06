using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Tests;

public sealed class DocumentServiceTests
{
    [Fact]
    public async Task PrepareDownloadAsync_increments_download_count()
    {
        var document = new Document(
            "Формули",
            null,
            7,
            "Алгебра",
            DocumentType.Formula,
            "formulas.pdf",
            "stored.pdf",
            "application/pdf",
            3,
            DateTimeOffset.UtcNow);
        var repository = new FakeDocumentRepository(document);
        var storage = new FakeFileStorage();
        var service = new DocumentService(
            repository,
            storage,
            new FakeClock(),
            new DocumentMetadataValidator(),
            new UploadedFileValidator());

        var download = await service.PrepareDownloadAsync(document.Id, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal(1, document.DownloadCount);
        Assert.Equal(1, repository.SaveCount);
    }

    private sealed class FakeClock : IClock
    {
        public DateTimeOffset UtcNow => new(2026, 7, 11, 12, 0, 0, TimeSpan.Zero);
    }

    private sealed class FakeFileStorage : IFileStorage
    {
        public Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken)
        {
            return Task.FromResult(new StoredFileResult(originalFileName, "stored.pdf", contentType, stream.Length));
        }

        public Task<Stream> OpenReadAsync(string storedFileName, CancellationToken cancellationToken)
        {
            return Task.FromResult<Stream>(new MemoryStream([1, 2, 3]));
        }

        public Task DeleteAsync(string storedFileName, CancellationToken cancellationToken)
        {
            return Task.CompletedTask;
        }
    }

    private sealed class FakeDocumentRepository(Document document) : IDocumentRepository
    {
        public int SaveCount { get; private set; }

        public Task<PagedResult<Document>> SearchAsync(DocumentQueryParameters parameters, CancellationToken cancellationToken)
        {
            return Task.FromResult(new PagedResult<Document>([document], 1, 12, 1, 1));
        }

        public Task<Document?> GetByIdAsync(Guid id, bool track, CancellationToken cancellationToken)
        {
            return Task.FromResult<Document?>(id == document.Id ? document : null);
        }

        public Task<IReadOnlyList<string>> GetTopicsAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<string>>(["Алгебра"]);
        }

        public void Add(Document document)
        {
        }

        public void Remove(Document document)
        {
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveCount++;
            return Task.CompletedTask;
        }
    }
}
