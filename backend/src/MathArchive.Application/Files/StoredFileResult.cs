namespace MathArchive.Application.Files;

public sealed record StoredFileResult(string OriginalFileName, string StoredFileName, string ContentType, long FileSize);
