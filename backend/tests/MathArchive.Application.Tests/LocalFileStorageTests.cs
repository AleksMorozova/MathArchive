using MathArchive.Infrastructure.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Tests;

public sealed class LocalFileStorageTests
{
    [Fact]
    public async Task SaveAsync_when_copy_succeeds_writes_complete_file_and_returns_generated_name()
    {
        var rootPath = CreateRootPath();
        var storage = CreateStorage(rootPath);
        var content = new byte[] { 1, 2, 3, 4 };

        try
        {
            await using var source = new MemoryStream(content);

            var result = await storage.SaveAsync(source, "material.PDF", "application/pdf", CancellationToken.None);

            Assert.Equal("material.PDF", result.OriginalFileName);
            Assert.EndsWith(".pdf", result.StoredFileName, StringComparison.Ordinal);
            Assert.Equal(content.Length, result.FileSize);
            Assert.Equal(content, await File.ReadAllBytesAsync(Path.Combine(rootPath, result.StoredFileName)));
        }
        finally
        {
            DeleteRootPath(rootPath);
        }
    }

    [Fact]
    public async Task SaveAsync_when_copy_fails_removes_partially_written_file_and_rethrows()
    {
        var rootPath = CreateRootPath();
        var storage = CreateStorage(rootPath);
        await using var source = new ThrowAfterFirstReadStream([1, 2, 3, 4]);

        try
        {
            var exception = await Assert.ThrowsAsync<IOException>(() =>
                storage.SaveAsync(source, "material.pdf", "application/pdf", CancellationToken.None));

            Assert.Equal("Source read failed.", exception.Message);
            Assert.Empty(Directory.EnumerateFiles(rootPath));
        }
        finally
        {
            DeleteRootPath(rootPath);
        }
    }

    [Fact]
    public async Task SaveAsync_when_canceled_removes_target_file_and_propagates_cancellation()
    {
        var rootPath = CreateRootPath();
        var storage = CreateStorage(rootPath);
        await using var source = new MemoryStream([1, 2, 3, 4]);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        try
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
                storage.SaveAsync(source, "material.pdf", "application/pdf", cancellation.Token));

            Assert.Empty(Directory.EnumerateFiles(rootPath));
        }
        finally
        {
            DeleteRootPath(rootPath);
        }
    }

    private static LocalFileStorage CreateStorage(string rootPath)
    {
        return new LocalFileStorage(
            Options.Create(new LocalStorageOptions { RootPath = rootPath }),
            NullLogger<LocalFileStorage>.Instance);
    }

    private static string CreateRootPath()
    {
        return Path.Combine(Path.GetTempPath(), $"matharchive-storage-{Guid.NewGuid():N}");
    }

    private static void DeleteRootPath(string rootPath)
    {
        if (Directory.Exists(rootPath))
        {
            Directory.Delete(rootPath, recursive: true);
        }
    }

    private sealed class ThrowAfterFirstReadStream(byte[] firstChunk) : Stream
    {
        private bool hasReturnedChunk;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            return Read(buffer.AsSpan(offset, count));
        }

        public override int Read(Span<byte> buffer)
        {
            if (hasReturnedChunk)
            {
                throw new IOException("Source read failed.");
            }

            hasReturnedChunk = true;
            var count = Math.Min(firstChunk.Length, buffer.Length);
            firstChunk.AsSpan(0, count).CopyTo(buffer);
            return count;
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            try
            {
                return Task.FromResult(Read(buffer, offset, count));
            }
            catch (Exception exception)
            {
                return Task.FromException<int>(exception);
            }
        }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            try
            {
                return ValueTask.FromResult(Read(buffer.Span));
            }
            catch (Exception exception)
            {
                return ValueTask.FromException<int>(exception);
            }
        }

        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
