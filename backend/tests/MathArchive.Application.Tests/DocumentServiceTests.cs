using MathArchive.Api.Controllers;
using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace MathArchive.Application.Tests;

public sealed class DocumentServiceTests
{
    [Fact]
    public async Task CreateAsync_saves_file_and_database_record()
    {
        var repository = new FakeDocumentRepository();
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        var result = await service.CreateAsync(CreateCommand(), CancellationToken.None);

        Assert.NotEqual(Guid.Empty, result.Id);
        Assert.Single(repository.Documents);
        Assert.Equal("stored-1.pdf", repository.Documents[0].StoredFileName);
        Assert.Contains("stored-1.pdf", storage.SavedFiles);
        Assert.Empty(storage.DeletedFiles);
        Assert.Equal(0, result.DisplayOrder);
    }

    [Fact]
    public async Task CreateAsync_allows_multiple_documents_with_the_same_topic()
    {
        var repository = new FakeDocumentRepository();
        var service = CreateService(repository, new FakeFileStorage());

        await service.CreateAsync(CreateCommand(), CancellationToken.None);
        await service.CreateAsync(CreateCommand(), CancellationToken.None);

        Assert.Equal(2, repository.Documents.Count);
        Assert.All(repository.Documents, document => Assert.Equal("Алгебра", document.Topic));
    }

    [Fact]
    public async Task CreateAsync_rejects_unknown_document_type()
    {
        var repository = new FakeDocumentRepository();
        var service = CreateService(repository, new FakeFileStorage());
        var command = new CreateDocumentCommand(
            new DocumentMetadata("Матеріал", null, 7, "Алгебра", (DocumentType)999),
            UploadedFile("material.pdf"));

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            service.CreateAsync(command, CancellationToken.None));

        Assert.Empty(repository.Documents);
    }

    [Fact]
    public async Task CreateAsync_when_file_save_fails_does_not_create_database_record()
    {
        var repository = new FakeDocumentRepository();
        var storage = new FakeFileStorage { FailSave = true };
        var service = CreateService(repository, storage);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(CreateCommand(), CancellationToken.None));

        Assert.Empty(repository.Documents);
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task CreateAsync_when_database_save_fails_deletes_new_file()
    {
        var repository = new FakeDocumentRepository { FailSaveChanges = true };
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(CreateCommand(), CancellationToken.None));

        Assert.Contains("stored-1.pdf", storage.SavedFiles);
        Assert.Contains("stored-1.pdf", storage.DeletedFiles);
    }

    [Fact]
    public async Task UpdateAsync_with_replacement_saves_new_file_updates_database_then_deletes_old_file()
    {
        var document = CreateDocument(storedFileName: "old.pdf");
        var repository = new FakeDocumentRepository(document);
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        var result = await service.UpdateAsync(document.Id, UpdateCommand(replacementFileName: "replacement.pdf"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("stored-1.pdf", document.StoredFileName);
        Assert.Contains("stored-1.pdf", storage.SavedFiles);
        Assert.Contains("old.pdf", storage.DeletedFiles);
    }

    [Fact]
    public async Task UpdateAsync_when_database_save_fails_deletes_new_file_and_keeps_old_file()
    {
        var document = CreateDocument(storedFileName: "old.pdf");
        var repository = new FakeDocumentRepository(document) { FailSaveChanges = true };
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateAsync(document.Id, UpdateCommand(replacementFileName: "replacement.pdf"), CancellationToken.None));

        Assert.Contains("stored-1.pdf", storage.DeletedFiles);
        Assert.DoesNotContain("old.pdf", storage.DeletedFiles);
    }

    [Fact]
    public async Task UpdateAsync_when_old_file_cleanup_fails_keeps_database_on_new_file()
    {
        var document = CreateDocument(storedFileName: "old.pdf");
        var repository = new FakeDocumentRepository(document);
        var storage = new FakeFileStorage { FailDeleteFor = "old.pdf" };
        var service = CreateService(repository, storage);

        var result = await service.UpdateAsync(document.Id, UpdateCommand(replacementFileName: "replacement.pdf"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("stored-1.pdf", document.StoredFileName);
        Assert.Contains("old.pdf", storage.DeleteAttempts);
    }

    [Fact]
    public async Task DeleteAsync_deletes_database_record_then_physical_file()
    {
        var document = CreateDocument(storedFileName: "stored.pdf");
        var repository = new FakeDocumentRepository(document);
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        var deleted = await service.DeleteAsync(document.Id, CancellationToken.None);

        Assert.True(deleted);
        Assert.Empty(repository.Documents);
        Assert.Contains("stored.pdf", storage.DeletedFiles);
    }

    [Fact]
    public async Task DeleteAsync_when_database_delete_fails_does_not_delete_physical_file()
    {
        var document = CreateDocument(storedFileName: "stored.pdf");
        var repository = new FakeDocumentRepository(document) { FailSaveChanges = true };
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.DeleteAsync(document.Id, CancellationToken.None));

        Assert.Contains(document, repository.Documents);
        Assert.Empty(storage.DeletedFiles);
    }

    [Fact]
    public async Task PrepareDownloadAsync_when_database_record_does_not_exist_returns_null()
    {
        var service = CreateService(new FakeDocumentRepository(), new FakeFileStorage());

        var download = await service.PrepareDownloadAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Null(download);
    }

    [Fact]
    public async Task PrepareDownloadAsync_when_physical_file_is_missing_throws_controlled_exception_without_incrementing_count()
    {
        var document = CreateDocument(storedFileName: "missing.pdf");
        var repository = new FakeDocumentRepository(document);
        var storage = new FakeFileStorage { MissingFiles = { "missing.pdf" } };
        var service = CreateService(repository, storage);

        await Assert.ThrowsAsync<MaterialFileNotFoundException>(() => service.PrepareDownloadAsync(document.Id, CancellationToken.None));

        Assert.Equal(0, document.DownloadCount);
        Assert.Equal(0, repository.SaveCount);
    }


    [Fact]
    public async Task PrepareDownloadAsync_opens_file_then_increments_download_count()
    {
        var document = CreateDocument(storedFileName: "stored.pdf");
        var repository = new FakeDocumentRepository(document);
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        var download = await service.PrepareDownloadAsync(document.Id, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal(1, document.DownloadCount);
        Assert.Equal(1, repository.SaveCount);
    }

    [Fact]
    public async Task PrepareDownloadAsync_uses_sanitized_title_timestamp_and_original_extension()
    {
        var document = CreateDocument("stored.pdf", "  Похідна: правила / приклади..  ", "random-upload.PDF");
        var service = CreateService(new FakeDocumentRepository(document), new FakeFileStorage());

        var download = await service.PrepareDownloadAsync(document.Id, CancellationToken.None);

        Assert.NotNull(download);
        Assert.Equal("Похідна-правила-приклади_2026-07-11_12-00-00.PDF", download.FileName);
        Assert.DoesNotContain("random-upload", download.FileName);
    }

    [Fact]
    public async Task SearchAsync_when_end_date_precedes_start_date_fails_validation_before_query()
    {
        var repository = new FakeDocumentRepository();
        var service = CreateService(repository, new FakeFileStorage());
        var query = new DocumentQueryParameters(null, null, false, null, null,
            new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 9), DocumentSortOrder.CreatedAtDescending);

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            service.SearchAsync(query, CancellationToken.None));

        Assert.Equal(0, repository.SearchCount);
    }

    [Fact]
    public async Task PreparePreviewAsync_opens_file_without_incrementing_download_count()
    {
        var document = CreateDocument(storedFileName: "stored.pdf");
        var repository = new FakeDocumentRepository(document);
        var storage = new FakeFileStorage();
        var service = CreateService(repository, storage);

        var preview = await service.PreparePreviewAsync(document.Id, CancellationToken.None);

        Assert.NotNull(preview);
        Assert.Equal(0, document.DownloadCount);
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task ReorderForGradeAsync_normalizes_selected_class_without_changing_other_classes()
    {
        var first = CreateDocument("first.pdf", grade: 7);
        var second = CreateDocument("second.pdf", grade: 7);
        var otherClass = CreateDocument("other.pdf", grade: 8);
        first.SetDisplayOrder(5);
        second.SetDisplayOrder(0);
        otherClass.SetDisplayOrder(1);
        var repository = new FakeDocumentRepository(first, second, otherClass);
        var service = CreateService(repository, new FakeFileStorage());

        var result = await service.ReorderForGradeAsync(7, [second.Id, first.Id], CancellationToken.None);

        Assert.Collection(result,
            item => Assert.Equal(1, item.DisplayOrder),
            item => Assert.Equal(2, item.DisplayOrder));
        Assert.Equal(1, otherClass.DisplayOrder);
        Assert.Equal(1, repository.SaveCount);
    }

    [Fact]
    public async Task ReorderForGradeAsync_rejects_duplicate_document_ids()
    {
        var document = CreateDocument("first.pdf", grade: 7);
        var repository = new FakeDocumentRepository(document);
        var service = CreateService(repository, new FakeFileStorage());

        var exception = await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            service.ReorderForGradeAsync(7, [document.Id, document.Id], CancellationToken.None));

        Assert.Contains(exception.Errors, error => error.ErrorMessage.Contains("duplicates"));
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task ReorderForGradeAsync_rejects_missing_document_ids()
    {
        var first = CreateDocument("first.pdf", grade: 7);
        var second = CreateDocument("second.pdf", grade: 7);
        var repository = new FakeDocumentRepository(first, second);
        var service = CreateService(repository, new FakeFileStorage());

        var exception = await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            service.ReorderForGradeAsync(7, [first.Id], CancellationToken.None));

        Assert.Contains(exception.Errors, error => error.ErrorMessage.Contains("every document"));
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task ReorderForGradeAsync_rejects_document_from_another_class()
    {
        var selectedClass = CreateDocument("selected.pdf", grade: 7);
        var otherClass = CreateDocument("other.pdf", grade: 8);
        var repository = new FakeDocumentRepository(selectedClass, otherClass);
        var service = CreateService(repository, new FakeFileStorage());

        var exception = await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            service.ReorderForGradeAsync(7, [selectedClass.Id, otherClass.Id], CancellationToken.None));

        Assert.Contains(exception.Errors, error => error.ErrorMessage.Contains("selected class"));
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task UpdateAsync_resets_display_order_when_class_changes()
    {
        var document = CreateDocument("ordered.pdf", grade: 7);
        document.SetDisplayOrder(3);
        var repository = new FakeDocumentRepository(document);
        var service = CreateService(repository, new FakeFileStorage());

        await service.UpdateAsync(document.Id, UpdateCommand(replacementFileName: "replacement.pdf"), CancellationToken.None);

        Assert.Equal(8, document.Grade);
        Assert.Equal(0, document.DisplayOrder);
    }

    private static DocumentService CreateService(FakeDocumentRepository repository, FakeFileStorage storage)
    {
        return new DocumentService(
            repository,
            storage,
            new FakeClock(),
            new DocumentMetadataValidator(),
            new UploadedFileValidator(),
            NullLogger<DocumentService>.Instance);
    }

    private static CreateDocumentCommand CreateCommand()
    {
        return new CreateDocumentCommand(
            new DocumentMetadata("Формули", null, 7, "Алгебра", DocumentType.Formula),
            UploadedFile("material.pdf"));
    }

    private static UpdateDocumentCommand UpdateCommand(string replacementFileName)
    {
        return new UpdateDocumentCommand(
            new DocumentMetadata("Оновлені формули", null, 8, "Геометрія", DocumentType.Test),
            UploadedFile(replacementFileName));
    }

    private static UploadedFile UploadedFile(string fileName)
    {
        return new UploadedFile(new MemoryStream([1, 2, 3]), fileName, "application/pdf", 3);
    }

    private static Document CreateDocument(
        string storedFileName,
        string title = "Формули",
        string originalFileName = "formulas.pdf",
        int? grade = 7)
    {
        return new Document(
            title,
            null,
            grade,
            "Алгебра",
            DocumentType.Formula,
            originalFileName,
            storedFileName,
            "application/pdf",
            3,
            DateTimeOffset.UtcNow);
    }

    private sealed class FakeClock : IClock
    {
        public DateTimeOffset UtcNow => new(2026, 7, 11, 12, 0, 0, TimeSpan.Zero);
    }

    private sealed class FakeFileStorage : IFileStorage
    {
        private int saveCount;

        public bool FailSave { get; init; }
        public string? FailDeleteFor { get; init; }
        public List<string> SavedFiles { get; } = [];
        public List<string> DeletedFiles { get; } = [];
        public List<string> DeleteAttempts { get; } = [];
        public HashSet<string> MissingFiles { get; } = [];

        public Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken cancellationToken)
        {
            if (FailSave)
            {
                throw new InvalidOperationException("File save failed.");
            }

            saveCount++;
            var storedFileName = $"stored-{saveCount}{Path.GetExtension(originalFileName)}";
            SavedFiles.Add(storedFileName);
            return Task.FromResult(new StoredFileResult(originalFileName, storedFileName, contentType, stream.Length));
        }

        public Task<Stream?> TryOpenReadAsync(string storedFileName, CancellationToken cancellationToken)
        {
            return Task.FromResult<Stream?>(MissingFiles.Contains(storedFileName) ? null : new MemoryStream([1, 2, 3]));
        }

        public Task DeleteAsync(string storedFileName, CancellationToken cancellationToken)
        {
            DeleteAttempts.Add(storedFileName);
            if (storedFileName == FailDeleteFor)
            {
                throw new InvalidOperationException("File delete failed.");
            }

            DeletedFiles.Add(storedFileName);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeDocumentRepository(params Document[] documents) : IDocumentRepository
    {
        private readonly List<Document> pendingAdds = [];
        private readonly List<Document> pendingRemoves = [];

        public bool FailSaveChanges { get; init; }
        public List<Document> Documents { get; } = [.. documents];
        public int SaveCount { get; private set; }
        public int SearchCount { get; private set; }

        public Task<PagedResult<Document>> SearchAsync(DocumentQueryParameters parameters, CancellationToken cancellationToken)
        {
            SearchCount++;
            return Task.FromResult(new PagedResult<Document>(Documents, 1, 12, Documents.Count, Documents.Count > 0 ? 1 : 0));
        }

        public Task<Document?> GetByIdAsync(Guid id, bool track, CancellationToken cancellationToken)
        {
            return Task.FromResult(Documents.FirstOrDefault(x => x.Id == id));
        }

        public Task<IReadOnlyList<Document>> GetByGradeAsync(int grade, bool track, CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<Document>>(Documents
                .Where(document => document.Grade == grade)
                .OrderBy(document => document.DisplayOrder == 0)
                .ThenBy(document => document.DisplayOrder)
                .ThenByDescending(document => document.CreatedAt)
                .ToList());
        }

        public Task<IReadOnlyList<string>> GetTopicsAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<string>>(["Алгебра"]);
        }

        public void Add(Document document)
        {
            pendingAdds.Add(document);
        }

        public void Remove(Document document)
        {
            pendingRemoves.Add(document);
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            if (FailSaveChanges)
            {
                throw new InvalidOperationException("Database save failed.");
            }

            foreach (var document in pendingRemoves)
            {
                Documents.Remove(document);
            }

            foreach (var document in pendingAdds)
            {
                Documents.Add(document);
            }

            pendingRemoves.Clear();
            pendingAdds.Clear();
            SaveCount++;
            return Task.CompletedTask;
        }
    }
}
