using MathArchive.Application.Common;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public interface IDocumentRepository
{
    Task<PagedResult<Document>> SearchAsync(DocumentQueryParameters parameters, CancellationToken cancellationToken);

    Task<Document?> GetByIdAsync(Guid id, bool track, CancellationToken cancellationToken);

    Task<IReadOnlyList<string>> GetTopicsAsync(CancellationToken cancellationToken);

    void Add(Document document);

    void Remove(Document document);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
