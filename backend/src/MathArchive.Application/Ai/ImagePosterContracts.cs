using MathArchive.Application.Files;

namespace MathArchive.Application.Ai;

public sealed record GeneratedPoster(byte[] Content, string FileName, string ContentType);

public sealed record OpenAiGeneratedImage(
    byte[] Content,
    int? InputTokens,
    int? OutputTokens,
    int? TotalTokens,
    int? HttpStatusCode,
    string? RequestId);

public interface IOpenAiImagePosterClient
{
    Task<OpenAiGeneratedImage> TransformAsync(UploadedFile image, CancellationToken cancellationToken);
}

public interface IImagePosterService
{
    Task<GeneratedPoster> TransformAsync(UploadedFile image, string? adminId, CancellationToken cancellationToken);
}
