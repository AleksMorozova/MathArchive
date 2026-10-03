using MathArchive.OllamaProcessor.Configuration;
using Microsoft.Extensions.Options;

namespace MathArchive.OllamaProcessor.Services;

public sealed class ImageUploadValidator(IOptions<OllamaOptions> options)
{
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/webp"
    };

    public void Validate(IFormFile file)
    {
        if (file.Length <= 0)
        {
            throw new InvalidImageException("Оберіть непорожнє зображення.");
        }

        if (file.Length > options.Value.MaximumImageBytes)
        {
            throw new InvalidImageException($"Зображення перевищує ліміт {FormatMegabytes(options.Value.MaximumImageBytes)} МБ.");
        }

        if (!AllowedContentTypes.Contains(file.ContentType))
        {
            throw new InvalidImageException("Підтримуються лише PNG, JPEG і WEBP.");
        }
    }

    public static void ValidateSignature(ReadOnlySpan<byte> bytes, string contentType)
    {
        var valid = contentType.ToLowerInvariant() switch
        {
            "image/png" => bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/jpeg" => bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff,
            "image/webp" => bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes.Slice(8, 4).SequenceEqual("WEBP"u8),
            _ => false
        };

        if (!valid)
        {
            throw new InvalidImageException("Вміст зображення не відповідає заявленому формату.");
        }
    }

    private static long FormatMegabytes(long bytes) => Math.Max(1, bytes / 1024 / 1024);
}

public sealed class InvalidImageException(string message) : Exception(message);
