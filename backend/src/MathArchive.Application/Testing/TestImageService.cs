using MathArchive.Application.Common;
using MathArchive.Application.Files;
using MathArchive.Domain.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
namespace MathArchive.Application.Testing;

public sealed record TestImageDto(Guid Id, int Width, int Height);
public sealed record ProcessedTestImage(byte[] Bytes, string Extension, string ContentType, int Width, int Height);
public sealed record TestImageFile(Stream Stream, string ContentType);
public interface ITestImageProcessor
{
    Task<ProcessedTestImage> ProcessAsync(Stream stream, string fileName, string contentType, CancellationToken ct);
}
public interface ITestImageRepository
{
    Task AddAsync(TestImage image, CancellationToken ct);
    Task<TestImage?> FindAsync(Guid id, CancellationToken ct);
}
public sealed class TestImageService(ITestImageRepository images, ITestingRepository tests, ITestImageProcessor processor,
    [FromKeyedServices("TestImages")] IFileStorage storage, IClock clock, ILogger<TestImageService> logger)
{
    public const long MaximumBytes = 5 * 1024 * 1024;
    public async Task<TestImageDto> UploadAsync(UploadedFile file, CancellationToken ct)
    {
        if (file.Length is <= 0 or > MaximumBytes) throw new TestingException(400, "Розмір зображення має бути від 1 байта до 5 МБ.");
        // Bound actual stream length as well as the supplied length before invoking a decoder.
        using var buffer = new MemoryStream(); var chunk = new byte[81920];
        while (true)
        {
            var read = await file.Stream.ReadAsync(chunk, ct); if (read == 0) break;
            if (buffer.Length + read > MaximumBytes) throw new TestingException(400, "Зображення перевищує 5 МБ.");
            await buffer.WriteAsync(chunk.AsMemory(0, read), ct);
        }
        buffer.Position = 0;
        var result = await processor.ProcessAsync(buffer, file.FileName, file.ContentType, ct);
        using var content = new MemoryStream(result.Bytes);
        var stored = await storage.SaveAsync(content, "image" + result.Extension, result.ContentType, ct);
        var row = new TestImage { StoredFileName = stored.StoredFileName, ContentType = result.ContentType,
            FileSize = stored.FileSize, Width = result.Width, Height = result.Height, CreatedAt = clock.UtcNow };
        try { await images.AddAsync(row, ct); }
        catch
        {
            try { await storage.DeleteAsync(stored.StoredFileName, CancellationToken.None); }
            catch (Exception cleanup) { logger.LogWarning(cleanup, "Failed to remove test image {StoredFileName} after persistence failed.", stored.StoredFileName); }
            throw;
        }
        return new(row.Id, row.Width, row.Height);
    }
    public async Task<TestImageFile> OpenAsync(Guid imageId, Guid? attemptId, string? token, CancellationToken ct, Guid? studentId = null)
    {
        if (attemptId.HasValue)
        {
            await tests.WithAttemptAsync(attemptId.Value, a =>
            {
                TestingService.Authorize(a, token, studentId);
                if (!TestRichContent.ImageIds(TestingService.Definition(a.SnapshotJson)).Contains(imageId)) throw Missing();
                return true;
            }, ct);
        }
        // A null attempt is used only by the controller protected by AdminOnly.
        var image = await images.FindAsync(imageId, ct) ?? throw Missing();
        var stream = await storage.TryOpenReadAsync(image.StoredFileName, ct) ?? throw Missing();
        return new(stream, image.ContentType);
    }
    private static TestingException Missing() => new(404, "Зображення не знайдено.");
}

