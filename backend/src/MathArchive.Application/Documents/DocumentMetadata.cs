using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed record DocumentMetadata(string Title, string? Description, int? Grade, string Topic, DocumentType DocumentType, int[]? TrainerGrades = null, bool TrainerPublished = true);
