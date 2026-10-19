using MathArchive.Application.Common;
using MathArchive.Application.Files;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Testing;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;
namespace MathArchive.Application.Tests;

public sealed class TestImageServiceTests
{
    [Fact] public async Task Persistence_failure_compensates_with_non_cancelled_cleanup_and_keeps_original_error()
    {
        var failure = new InvalidOperationException("database unavailable"); var repo = new Images(failure); var storage = new Storage { CleanupFails = true };
        var service = new TestImageService(repo, null!, new TestImageProcessor(), storage, new Clock(), NullLogger<TestImageService>.Instance);
        var bytes = TestImageProcessorTests.Picture(SKEncodedImageFormat.Png); using var stream = new MemoryStream(bytes);
        var actual = await Assert.ThrowsAsync<InvalidOperationException>(() => service.UploadAsync(new UploadedFile(stream, "../../outside.png", "image/png", bytes.Length), default));
        Assert.Same(failure, actual); Assert.Equal("image.png", storage.OriginalName); Assert.Equal("stored.png", storage.Deleted); Assert.False(storage.DeleteToken.CanBeCanceled);
    }
    [Fact] public async Task Actual_oversized_stream_is_rejected_even_when_reported_length_is_small()
    {
        var repo = new Images(); var storage = new Storage();
        var service = new TestImageService(repo, null!, new TestImageProcessor(), storage, new Clock(), NullLogger<TestImageService>.Instance);
        using var stream = new MemoryStream(new byte[TestImageService.MaximumBytes + 1]);
        await Assert.ThrowsAsync<TestingException>(() => service.UploadAsync(new UploadedFile(stream, "x.png", "image/png", 1), default));
        Assert.Null(storage.OriginalName); Assert.False(repo.Added);
    }
    [Fact] public async Task Failed_storage_never_creates_image_metadata()
    {
        var repo = new Images(); var storage = new Storage { SaveFails = true }; var service = new TestImageService(repo, null!, new TestImageProcessor(), storage, new Clock(), NullLogger<TestImageService>.Instance);
        var bytes = TestImageProcessorTests.Picture(SKEncodedImageFormat.Png); using var stream = new MemoryStream(bytes);
        await Assert.ThrowsAsync<IOException>(() => service.UploadAsync(new UploadedFile(stream, "x.png", "image/png", bytes.Length), default)); Assert.False(repo.Added);
    }
    private sealed class Clock : IClock { public DateTimeOffset UtcNow => DateTimeOffset.UtcNow; }
    private sealed class Images(Exception? failure = null) : ITestImageRepository
    {
        public bool Added { get; private set; }
        public Task AddAsync(TestImage image, CancellationToken ct) { if (failure is not null) throw failure; Added = true; return Task.CompletedTask; }
        public Task<TestImage?> FindAsync(Guid id, CancellationToken ct) => Task.FromResult<TestImage?>(null);
    }
    private sealed class Storage : IFileStorage
    {
        public bool CleanupFails { get; init; } public bool SaveFails { get; init; }
        public string? OriginalName { get; private set; } public string? Deleted { get; private set; } public CancellationToken DeleteToken { get; private set; }
        public Task<StoredFileResult> SaveAsync(Stream stream, string originalFileName, string contentType, CancellationToken ct) { if (SaveFails) throw new IOException("disk full"); OriginalName = originalFileName; return Task.FromResult(new StoredFileResult(originalFileName, "stored.png", contentType, stream.Length)); }
        public Task<Stream?> TryOpenReadAsync(string name, CancellationToken ct) => Task.FromResult<Stream?>(null);
        public Task DeleteAsync(string name, CancellationToken ct) { Deleted = name; DeleteToken = ct; if (CleanupFails) throw new IOException("cleanup failed"); return Task.CompletedTask; }
    }
}
