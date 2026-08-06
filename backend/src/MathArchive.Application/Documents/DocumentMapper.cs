using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public static class DocumentMapper
{
    public static DocumentDto ToDto(Document document)
    {
        return new DocumentDto(
            document.Id,
            document.Title,
            document.Description,
            document.Grade,
            document.Topic,
            document.DocumentType,
            document.OriginalFileName,
            document.ContentType,
            document.FileSize,
            document.CreatedAt,
            document.UpdatedAt,
            document.DownloadCount);
    }
}
