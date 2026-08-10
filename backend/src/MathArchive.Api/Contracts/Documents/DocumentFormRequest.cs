using MathArchive.Domain.Documents;

namespace MathArchive.Api.Contracts.Documents;

public sealed class DocumentFormRequest
{
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? Grade { get; init; }
    public string Topic { get; init; } = string.Empty;
    public DocumentType DocumentType { get; init; }
    public IFormFile? File { get; init; }
}
