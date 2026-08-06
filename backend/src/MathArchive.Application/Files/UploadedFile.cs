namespace MathArchive.Application.Files;

public sealed record UploadedFile(Stream Stream, string FileName, string ContentType, long Length);
