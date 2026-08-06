namespace MathArchive.Application.Documents;

public sealed record DocumentDownload(Stream Stream, string FileName, string ContentType);
