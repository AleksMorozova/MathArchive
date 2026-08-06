using MathArchive.Application.Files;

namespace MathArchive.Application.Documents;

public sealed record CreateDocumentCommand(DocumentMetadata Metadata, UploadedFile File);

public sealed record UpdateDocumentCommand(DocumentMetadata Metadata, UploadedFile? ReplacementFile);
