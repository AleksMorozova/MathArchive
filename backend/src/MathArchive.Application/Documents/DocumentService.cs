using FluentValidation;
using MathArchive.Application.Common;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;
using Microsoft.Extensions.Logging;

namespace MathArchive.Application.Documents;

public sealed class DocumentService(
    IDocumentRepository documentRepository,
    IFileStorage fileStorage,
    IClock clock,
    IValidator<DocumentMetadata> metadataValidator,
    IValidator<UploadedFile> fileValidator,
    ILogger<DocumentService> logger)
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
        try
        {
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
        catch (Exception exception)
        {
            await TryDeleteCompensationAsync(storedFile.StoredFileName, "created material file after database persistence failed", exception);
            throw;
        }
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
        StoredFileResult? replacementFile = null;
        if (command.ReplacementFile is not null)
        {
            replacementFile = await fileStorage.SaveAsync(command.ReplacementFile.Stream, command.ReplacementFile.FileName, command.ReplacementFile.ContentType, cancellationToken);
        }

        try
        {
            document.UpdateMetadata(command.Metadata.Title, command.Metadata.Description, command.Metadata.Grade, command.Metadata.Topic, command.Metadata.DocumentType, clock.UtcNow);

            if (replacementFile is not null)
            {
                document.ReplaceFile(replacementFile.OriginalFileName, replacementFile.StoredFileName, replacementFile.ContentType, replacementFile.FileSize, clock.UtcNow);
            }

            await documentRepository.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            if (replacementFile is not null)
            {
                await TryDeleteCompensationAsync(replacementFile.StoredFileName, "replacement material file after database update failed", exception);
            }

            throw;
        }

        if (replacementFile is not null)
        {
            try
            {
                await fileStorage.DeleteAsync(oldStoredFileName, CancellationToken.None);
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "Old material file cleanup failed after document {DocumentId} was updated to a replacement file.",
                    document.Id);
            }
        }

        return DocumentMapper.ToDto(document);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var document = await documentRepository.GetByIdAsync(id, track: true, cancellationToken);
        if (document is null)
        {
            return false;
        }

        var storedFileName = document.StoredFileName;
        documentRepository.Remove(document);
        await documentRepository.SaveChangesAsync(cancellationToken);

        try
        {
            await fileStorage.DeleteAsync(storedFileName, CancellationToken.None);
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Material file cleanup failed after document {DocumentId} was deleted from the database.",
                id);
        }

        return true;
    }

    public async Task<DocumentDownload?> PrepareDownloadAsync(Guid id, CancellationToken cancellationToken)
    {
        return await PrepareFileAsync(id, incrementDownloadCount: true, cancellationToken);
    }

    public async Task<DocumentDownload?> PreparePreviewAsync(Guid id, CancellationToken cancellationToken)
    {
        return await PrepareFileAsync(id, incrementDownloadCount: false, cancellationToken);
    }

    private async Task<DocumentDownload?> PrepareFileAsync(Guid id, bool incrementDownloadCount, CancellationToken cancellationToken)
    {
        var document = await documentRepository.GetByIdAsync(id, track: incrementDownloadCount, cancellationToken);
        if (document is null)
        {
            return null;
        }

        var stream = await fileStorage.TryOpenReadAsync(document.StoredFileName, cancellationToken);
        if (stream is null)
        {
            logger.LogWarning("Material file is missing for document {DocumentId}.", document.Id);
            throw new MaterialFileNotFoundException(document.Id);
        }

        try
        {
            if (incrementDownloadCount)
            {
                document.IncrementDownloadCount();
                await documentRepository.SaveChangesAsync(cancellationToken);
            }

            return new DocumentDownload(stream, document.OriginalFileName, document.ContentType);
        }
        catch
        {
            await stream.DisposeAsync();
            throw;
        }
    }

    private async Task TryDeleteCompensationAsync(string storedFileName, string cleanupReason, Exception primaryException)
    {
        try
        {
            await fileStorage.DeleteAsync(storedFileName, CancellationToken.None);
        }
        catch (Exception cleanupException)
        {
            logger.LogError(
                cleanupException,
                "Compensation failed while deleting {CleanupReason}. The original operation failed with {PrimaryExceptionType}.",
                cleanupReason,
                primaryException.GetType().Name);
        }
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
