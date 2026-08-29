using MathArchive.Application.Common;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public interface IDocumentRepository
{
    Task<PagedResult<Document>> SearchAsync(DocumentQueryParameters parameters, CancellationToken cancellationToken);

    Task<Document?> GetByIdAsync(Guid id, bool track, CancellationToken cancellationToken);

    Task<IReadOnlyList<string>> GetTopicsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<DocumentStorageReference>> GetStorageReferencesAsync(CancellationToken cancellationToken) =>
        throw new NotSupportedException("This repository implementation does not support storage audits.");

    void Add(Document document);

    void Remove(Document document);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
