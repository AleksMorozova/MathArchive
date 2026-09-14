namespace MathArchive.Application.Documents;

public sealed record DocumentStorageReference(Guid DocumentId, string Title, string StoredFileName, long ExpectedFileSize);
