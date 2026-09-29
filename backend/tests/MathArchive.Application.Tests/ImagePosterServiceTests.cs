using FluentValidation;
using MathArchive.Application.Ai;
using MathArchive.Application.Common;
using MathArchive.Application.Files;
using MathArchive.Domain.AiUsage;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Tests;

public sealed class ImagePosterServiceTests
{
    [Fact]
    public async Task Transform_rejects_empty_image_without_calling_open_ai()
    {
        var client = new FakeClient();
        var service = CreateService(client);
        var file = new UploadedFile(new MemoryStream(), "empty.png", "image/png", 0);

        await Assert.ThrowsAsync<ValidationException>(() => service.TransformAsync(file, "admin", CancellationToken.None));

        Assert.Equal(0, client.CallCount);
    }

    [Fact]
    public async Task Transform_rejects_unsupported_image_without_calling_open_ai()
    {
        var client = new FakeClient();
        var service = CreateService(client);
        var file = new UploadedFile(new MemoryStream("text"u8.ToArray()), "notes.txt", "text/plain", 4);

        await Assert.ThrowsAsync<ValidationException>(() => service.TransformAsync(file, "admin", CancellationToken.None));

        Assert.Equal(0, client.CallCount);
    }

    [Fact]
    public async Task Transform_rejects_oversized_image_without_calling_open_ai()
    {
        var client = new FakeClient();
        var service = CreateService(client, maximumBytes: 3);
        var file = JpegFile();

        await Assert.ThrowsAsync<ValidationException>(() => service.TransformAsync(file, "admin", CancellationToken.None));

        Assert.Equal(0, client.CallCount);
    }

    [Fact]
    public async Task Transform_returns_timestamped_png_and_records_success()
    {
        var usage = new FakeUsage();
        var client = new FakeClient();
        var service = CreateService(client, usage: usage);

        var result = await service.TransformAsync(JpegFile(), "admin", CancellationToken.None);

        Assert.Equal("matharchive-2026-09-28-1620.png", result.FileName);
        Assert.Equal("image/png", result.ContentType);
        Assert.Equal(client.Result.Content, result.Content);
        Assert.Single(usage.Records);
        Assert.Equal(AiRequestStatus.Succeeded, usage.Records[0].Status);
        Assert.Equal("ImagePosterTransformation", usage.Records[0].Operation);
    }

    [Fact]
    public async Task Transform_propagates_safe_ai_failure_and_records_failure()
    {
        var usage = new FakeUsage();
        var client = new FakeClient { Failure = new MaterialAnalysisException("failure", "OpenAiHttpError") };
        var service = CreateService(client, usage: usage);

        await Assert.ThrowsAsync<MaterialAnalysisException>(() =>
            service.TransformAsync(JpegFile(), "admin", CancellationToken.None));

        Assert.Single(usage.Records);
        Assert.Equal(AiRequestStatus.Failed, usage.Records[0].Status);
    }

    private static ImagePosterService CreateService(FakeClient client, long maximumBytes = 10 * 1024 * 1024, FakeUsage? usage = null)
    {
        var options = Options.Create(new OpenAiOptions
        {
            ImageModel = "gpt-image-2",
            MaximumImageUploadBytes = maximumBytes
        });
        return new ImagePosterService(client, usage ?? new FakeUsage(), new OpenAiUsageCostCalculator(options),
            new FakeClock(), options, NullLogger<ImagePosterService>.Instance);
    }

    private static UploadedFile JpegFile() =>
        new(new MemoryStream([0xff, 0xd8, 0xff, 0x00]), "source.jpg", "image/jpeg", 4);

    private sealed class FakeClock : IClock
    {
        public DateTimeOffset UtcNow => new(2026, 9, 28, 16, 20, 0, TimeSpan.Zero);
    }

    private sealed class FakeClient : IOpenAiImagePosterClient
    {
        public int CallCount { get; private set; }
        public MaterialAnalysisException? Failure { get; init; }
        public OpenAiGeneratedImage Result { get; } = new(
            [137, 80, 78, 71, 13, 10, 26, 10, 1], 10, 20, 30, 200, "request-id");

        public Task<OpenAiGeneratedImage> TransformAsync(UploadedFile image, CancellationToken cancellationToken)
        {
            CallCount++;
            if (Failure is not null) throw Failure;
            return Task.FromResult(Result);
        }
    }

    private sealed class FakeUsage : IAiUsageRepository
    {
        public List<AiUsageRecord> Records { get; } = [];
        public Task AddAsync(AiUsageRecord record, CancellationToken cancellationToken) { Records.Add(record); return Task.CompletedTask; }
        public Task<AiUsageSummaryData> GetSummaryAsync(AiUsageQuery query, CancellationToken cancellationToken) =>
            Task.FromResult(new AiUsageSummaryData(0, 0, 0, 0, 0, 0, null, null));
        public Task<PagedResult<AiUsageItem>> GetHistoryAsync(AiUsageQuery query, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<AiCostRecalculationResult> RecalculateMissingCostsAsync(IOpenAiUsageCostCalculator calculator, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
