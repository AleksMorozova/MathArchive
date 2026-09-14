using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed record DocumentQueryParameters(
    string? Search,
    int? Grade,
    bool GeneralOnly,
    string? Topic,
    DocumentType? DocumentType,
    DateOnly? CreatedFrom,
    DateOnly? CreatedTo,
    DocumentSortOrder Sort,
    int Page = 1,
    int PageSize = 12);
