using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Domain.Documents;
using Microsoft.EntityFrameworkCore;

namespace MathArchive.Infrastructure.Persistence;

public sealed class DocumentRepository(MathArchiveDbContext dbContext) : IDocumentRepository
{
    public async Task<PagedResult<Document>> SearchAsync(DocumentQueryParameters parameters, CancellationToken cancellationToken)
    {
        var query = dbContext.Documents.AsQueryable();

        if (!string.IsNullOrWhiteSpace(parameters.Search))
        {
            var search = EscapeLikePattern(parameters.Search.Trim());
            var pattern = $"%{search}%";
            query = query.Where(x =>
                EF.Functions.ILike(x.Title, pattern) ||
                (x.Description != null && EF.Functions.ILike(x.Description, pattern)) ||
                EF.Functions.ILike(x.Topic, pattern));
        }

        if (parameters.GeneralOnly)
        {
            query = query.Where(x => x.Grade == null);
        }
        else if (parameters.Grade.HasValue)
        {
            query = query.Where(x => x.Grade == parameters.Grade.Value);
        }

        if (!string.IsNullOrWhiteSpace(parameters.Topic))
        {
            query = query.Where(x => x.Topic == parameters.Topic);
        }

        if (parameters.DocumentType.HasValue)
        {
            query = query.Where(x => x.DocumentType == parameters.DocumentType.Value);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)parameters.PageSize);

        var items = await query
            .AsNoTracking()
            .OrderBy(x => x.Grade == null)
            .ThenBy(x => x.Grade)
            .ThenByDescending(x => x.CreatedAt)
            .Skip((parameters.Page - 1) * parameters.PageSize)
            .Take(parameters.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<Document>(items, parameters.Page, parameters.PageSize, totalCount, totalPages);
    }

    public Task<Document?> GetByIdAsync(Guid id, bool track, CancellationToken cancellationToken)
    {
        var query = track ? dbContext.Documents : dbContext.Documents.AsNoTracking();
        return query.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<string>> GetTopicsAsync(CancellationToken cancellationToken)
    {
        return await dbContext.Documents
            .AsNoTracking()
            .Select(x => x.Topic)
            .Distinct()
            .OrderBy(x => x)
            .ToListAsync(cancellationToken);
    }

    public void Add(Document document)
    {
        dbContext.Documents.Add(document);
    }

    public void Remove(Document document)
    {
        dbContext.Documents.Remove(document);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        return dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string EscapeLikePattern(string value)
    {
        return value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
    }
}
