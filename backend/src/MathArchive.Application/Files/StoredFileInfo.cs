namespace MathArchive.Application.Files;

public sealed record StoredFileInfo(string StoredFileName, long FileSize, DateTimeOffset LastModifiedAt);
