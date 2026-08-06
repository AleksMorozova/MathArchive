using FluentValidation;
using MathArchive.Application.Common;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed class DocumentService(
    IDocumentRepository documentRepository,
    IFileStorage fileStorage,
    IClock clock,
    IValidator<DocumentMetadata> metadataValidator,
    IValidator<UploadedFile> fileValidator)
{
    public async Task<PagedResult<DocumentDto>> SearchAsync(DocumentQueryParameters parameters, CancellationToken cancellationToken)
    {
        var result = await documentRepository.SearchAsync(Normalize(parameters), cancellationToken);

        return new PagedResult<DocumentDto>(
            result.Items.Select(DocumentMapper.ToDto).ToList(),
            result.Page,
            result.PageSize,
            result.TotalCount,
            result.TotalPages);
    }

    public async Task<DocumentDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        var document = await documentRepository.GetByIdAsync(id, track: false, cancellationToken);
        return document is null ? null : DocumentMapper.ToDto(document);
    }

    public Task<IReadOnlyList<string>> GetTopicsAsync(CancellationToken cancellationToken)
    {
        return documentRepository.GetTopicsAsync(cancellationToken);
    }

    public async Task<DocumentDto> CreateAsync(CreateDocumentCommand command, CancellationToken cancellationToken)
    {
        await metadataValidator.ValidateAndThrowAsync(command.Metadata, cancellationToken);
        await fileValidator.ValidateAndThrowAsync(command.File, cancellationToken);

        var storedFile = await fileStorage.SaveAsync(command.File.Stream, command.File.FileName, command.File.ContentType, cancellationToken);
        var document = new Document(
            command.Metadata.Title,
            command.Metadata.Description,
            command.Metadata.Grade,
            command.Metadata.Topic,
            command.Metadata.DocumentType,
            storedFile.OriginalFileName,
            storedFile.StoredFileName,
            storedFile.ContentType,
            storedFile.FileSize,
            clock.UtcNow);

        documentRepository.Add(document);
        await documentRepository.SaveChangesAsync(cancellationToken);

        return DocumentMapper.ToDto(document);
    }

    public async Task<DocumentDto?> UpdateAsync(Guid id, UpdateDocumentCommand command, CancellationToken cancellationToken)
    {
        await metadataValidator.ValidateAndThrowAsync(command.Metadata, cancellationToken);
        if (command.ReplacementFile is not null)
        {
            await fileValidator.ValidateAndThrowAsync(command.ReplacementFile, cancellationToken);
        }

        var document = await documentRepository.GetByIdAsync(id, track: true, cancellationToken);
        if (document is null)
        {
            return null;
        }

        var oldStoredFileName = document.StoredFileName;
        document.UpdateMetadata(command.Metadata.Title, command.Metadata.Description, command.Metadata.Grade, command.Metadata.Topic, command.Metadata.DocumentType, clock.UtcNow);

        if (command.ReplacementFile is not null)
        {
            var storedFile = await fileStorage.SaveAsync(command.ReplacementFile.Stream, command.ReplacementFile.FileName, command.ReplacementFile.ContentType, cancellationToken);
            document.ReplaceFile(storedFile.OriginalFileName, storedFile.StoredFileName, storedFile.ContentType, storedFile.FileSize, clock.UtcNow);
            await fileStorage.DeleteAsync(oldStoredFileName, cancellationToken);
        }

        await documentRepository.SaveChangesAsync(cancellationToken);
        return DocumentMapper.ToDto(document);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var document = await documentRepository.GetByIdAsync(id, track: true, cancellationToken);
        if (document is null)
        {
            return false;
        }

        documentRepository.Remove(document);
        await documentRepository.SaveChangesAsync(cancellationToken);
        await fileStorage.DeleteAsync(document.StoredFileName, cancellationToken);

        return true;
    }

    public async Task<DocumentDownload?> PrepareDownloadAsync(Guid id, CancellationToken cancellationToken)
    {
        var document = await documentRepository.GetByIdAsync(id, track: true, cancellationToken);
        if (document is null)
        {
            return null;
        }

        document.IncrementDownloadCount();
        await documentRepository.SaveChangesAsync(cancellationToken);

        var stream = await fileStorage.OpenReadAsync(document.StoredFileName, cancellationToken);
        return new DocumentDownload(stream, document.OriginalFileName, document.ContentType);
    }

    private static DocumentQueryParameters Normalize(DocumentQueryParameters parameters)
    {
        return parameters with
        {
            Page = Math.Max(1, parameters.Page),
            PageSize = Math.Clamp(parameters.PageSize, 1, 60)
        };
    }
}
