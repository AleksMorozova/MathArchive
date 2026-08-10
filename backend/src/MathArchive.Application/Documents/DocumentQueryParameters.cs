using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed record DocumentQueryParameters(
    string? Search,
    int? Grade,
    bool GeneralOnly,
    string? Topic,
    DocumentType? DocumentType,
    int Page = 1,
    int PageSize = 12);