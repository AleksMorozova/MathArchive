using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed record DocumentMetadata(string Title, string? Description, int Grade, string Topic, DocumentType DocumentType);
