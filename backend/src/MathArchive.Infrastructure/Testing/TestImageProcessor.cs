using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;
namespace MathArchive.Infrastructure.Testing;

public sealed class TestImageProcessor : ITestImageProcessor
{
    public Task<ProcessedTestImage> ProcessAsync(Stream stream, string fileName, string contentType, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var expected = extension switch { ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".webp" => "image/webp", _ => "" };
        if (expected == "" || !string.Equals(contentType, expected, StringComparison.OrdinalIgnoreCase)) throw Invalid();
        using var codec = SKCodec.Create(stream);
        if (codec is null) throw Invalid();
        var actual = codec.EncodedFormat switch { SKEncodedImageFormat.Png => "image/png", SKEncodedImageFormat.Jpeg => "image/jpeg", SKEncodedImageFormat.Webp => "image/webp", _ => "" };
        if (actual != expected) throw Invalid();
        var info = codec.Info;
        if (info.Width is <= 0 or > 6000 || info.Height is <= 0 or > 6000 || (long)info.Width * info.Height > 16_000_000)
            throw new TestingException(400, "Зображення: до 6000 пікселів на сторону та 16 мегапікселів.");
        using var bitmap = new SKBitmap(new SKImageInfo(info.Width, info.Height, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success) throw Invalid();
        ct.ThrowIfCancellationRequested();
        using var oriented = Orient(bitmap, codec.EncodedOrigin);
        using var image = SKImage.FromBitmap(oriented);
        // Re-encoding from decoded pixels removes embedded metadata and any appended payload.
        using var encoded = image.Encode(codec.EncodedFormat, 100);
        if (encoded is null || encoded.Size > 16 * 1024 * 1024) throw new TestingException(400, "Після обробки зображення надто велике. Зменште його розміри.");
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(new ProcessedTestImage(encoded.ToArray(), expected == "image/jpeg" ? ".jpg" : extension, expected, oriented.Width, oriented.Height));
    }
    private static SKBitmap Orient(SKBitmap source, SKEncodedOrigin origin)
    {
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var result = new SKBitmap(swap ? source.Height : source.Width, swap ? source.Width : source.Height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var canvas = new SKCanvas(result);
        var w = source.Width; var h = source.Height;
        var matrix = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1),
            _ => SKMatrix.Identity
        };
        canvas.SetMatrix(matrix); canvas.DrawBitmap(source, 0, 0, new SKSamplingOptions(SKFilterMode.Nearest)); canvas.Flush();
        return result;
    }
    private static TestingException Invalid() => new(400, "Завантажте справжнє зображення PNG, JPEG або WebP. SVG не підтримується.");
}
public sealed class TestImageRepository(MathArchiveDbContext db) : ITestImageRepository
{
    public async Task AddAsync(TestImage image, CancellationToken ct) { db.Add(image); await db.SaveChangesAsync(ct); }
    public Task<TestImage?> FindAsync(Guid id, CancellationToken ct) => db.Set<TestImage>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
}
