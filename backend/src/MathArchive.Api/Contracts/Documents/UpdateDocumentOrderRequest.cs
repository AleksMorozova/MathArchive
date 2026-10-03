namespace MathArchive.Api.Contracts.Documents;

public sealed record UpdateDocumentOrderRequest(IReadOnlyList<Guid>? DocumentIds);
