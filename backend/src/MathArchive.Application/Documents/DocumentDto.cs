using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed record DocumentDto(
    Guid Id,
    string Title,
    string? Description,
    int Grade,
    string Topic,
    DocumentType DocumentType,
    string OriginalFileName,
    string ContentType,
    long FileSize,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int DownloadCount);
