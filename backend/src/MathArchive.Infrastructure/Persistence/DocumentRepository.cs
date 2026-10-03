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

        if (parameters.CreatedFrom.HasValue)
        {
            var createdFrom = new DateTimeOffset(parameters.CreatedFrom.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            query = query.Where(x => x.CreatedAt >= createdFrom);
        }

        if (parameters.CreatedTo.HasValue)
        {
            var createdToExclusive = new DateTimeOffset(parameters.CreatedTo.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            query = query.Where(x => x.CreatedAt < createdToExclusive);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)parameters.PageSize);

        IOrderedQueryable<Document> orderedQuery;
        if (parameters.Sort == DocumentSortOrder.CreatedAtDescending)
        {
            orderedQuery = query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id);
        }
        else if (parameters.Grade.HasValue && !parameters.GeneralOnly)
        {
            orderedQuery = query
                .OrderBy(x => x.DisplayOrder == 0)
                .ThenBy(x => x.DisplayOrder)
                .ThenByDescending(x => x.CreatedAt)
                .ThenByDescending(x => x.Id);
        }
        else
        {
            orderedQuery = query
                .OrderBy(x => x.Grade == null)
                .ThenBy(x => x.Grade)
                .ThenByDescending(x => x.CreatedAt)
                .ThenByDescending(x => x.Id);
        }

        var items = await orderedQuery
            .AsNoTracking()
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

    public async Task<IReadOnlyList<Document>> GetByGradeAsync(int grade, bool track, CancellationToken cancellationToken)
    {
        var query = track ? dbContext.Documents : dbContext.Documents.AsNoTracking();
        return await query
            .Where(x => x.Grade == grade)
            .OrderBy(x => x.DisplayOrder == 0)
            .ThenBy(x => x.DisplayOrder)
            .ThenByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .ToListAsync(cancellationToken);
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

    public async Task<IReadOnlyList<DocumentStorageReference>> GetStorageReferencesAsync(CancellationToken cancellationToken)
    {
        return await dbContext.Documents
            .AsNoTracking()
            .OrderBy(x => x.Title)
            .Select(x => new DocumentStorageReference(x.Id, x.Title, x.StoredFileName, x.FileSize))
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

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        dbContext.ChangeTracker.DetectChanges();
        var changed = dbContext.ChangeTracker.Entries<Document>().Where(x =>
            x.State == EntityState.Added || (x.State == EntityState.Modified &&
            new[] { nameof(Document.Title), nameof(Document.Description), nameof(Document.Grade), nameof(Document.Topic), nameof(Document.StoredFileName) }
                .Any(name => x.Property(name).IsModified))).ToArray();
        foreach (var entry in changed)
        {
            var state = await dbContext.Set<MathArchive.Domain.Assistant.RagIndexState>().FindAsync([entry.Entity.Id], cancellationToken);
            if (state is null) dbContext.Add(state = new MathArchive.Domain.Assistant.RagIndexState { MaterialId = entry.Entity.Id });
            state.Status = "Pending";
            if (entry.Property(nameof(Document.StoredFileName)).IsModified) state.ApprovedText = null;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string EscapeLikePattern(string value)
    {
        return value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
    }
}
