using MathArchive.Application.Ai;
using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Domain.AiUsage;
using MathArchive.Domain.Documents;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Tests;

public sealed class MaterialAnalysisServiceTests
{
    [Fact]
    public async Task Analyze_ReturnsNormalizedSuggestionAndStoresUsageWithoutCreatingDocument()
    {
        var usage = new FakeUsage();
        var client = new FakeClient(new OpenAiAnalysisResult(
            "Похідна", "10", "Похідна та її застосування", "Memo", "Опис", new(.9m, .8m, .9m, .8m), 100, 20, 120, 200, "request-1"));
        var service = CreateService(usage, client);

        var result = await service.AnalyzeAsync(JpegFile(), "admin", CancellationToken.None);

        Assert.Equal("Похідна та її застосування", result.Topic);
        Assert.Equal("Memo", result.DocumentType);
        Assert.Contains("Memo", client.AllowedTypes);
        var record = Assert.Single(usage.Records);
        Assert.Equal(AiRequestStatus.Succeeded, record.Status);
        Assert.Equal(120, record.TotalTokens);
        Assert.Equal("admin", record.AdminId);
    }

    [Fact]
    public async Task Analyze_DoesNotLoseSuccessfulResultWhenTelemetryWriteFails()
    {
        var service = CreateService(new FakeUsage { Fail = true }, new FakeClient(new OpenAiAnalysisResult(
            "Алгебра", "7", "Алгебра", "Theory", null, new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Equal("Алгебра", result.Title);
    }

    [Fact]
    public async Task Analyze_RejectsMismatchedFileSignatureBeforeCallingOpenAi()
    {
        var client = new FakeClient(new OpenAiAnalysisResult(null, null, null, null, null, new(null, null, null, null), null, null, null, null, null));
        var service = CreateService(new FakeUsage(), client);
        var file = new UploadedFile(new MemoryStream([1, 2, 3]), "fake.jpg", "image/jpeg", 3);

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() => service.AnalyzeAsync(file, null, CancellationToken.None));
        Assert.Equal(0, client.CallCount);
    }

    [Theory]
    [InlineData("null")]
    [InlineData(" NULL ")]
    [InlineData("undefined")]
    [InlineData("N/A")]
    [InlineData("   ")]
    public async Task Analyze_RejectsResultWhenBothTitleAndTopicArePlaceholders(string placeholder)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            placeholder, placeholder, placeholder, placeholder, placeholder,
            new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var exception = await Assert.ThrowsAsync<MaterialAnalysisException>(() =>
            service.AnalyzeAsync(JpegFile(), null, CancellationToken.None));

        Assert.Equal("InvalidStructuredOutput", exception.ErrorType);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("null")]
    [InlineData("undefined")]
    [InlineData("N/A")]
    public async Task Analyze_UsesTopicBasedTitleFallbackForMissingOrPlaceholderTitle(string? title)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            title, "7", "Стереометрія", "Theory", null, new(null, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile("meaningless-4837.jpg"), null, CancellationToken.None);

        Assert.Equal("Основи стереометрії", result.Title);
        Assert.DoesNotContain("meaningless", result.Title, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("theory", "Theory")]
    [InlineData(" THEORY ", "Theory")]
    [InlineData("InventedType", null)]
    public async Task Analyze_ResolvesOnlyExistingDocumentTypesToCanonicalValue(string aiType, string? expected)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "Основи геометрії", "7", "Геометрія", aiType, null, new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Equal(expected, result.DocumentType);
        Assert.Equal(expected is null, result.RequiresReview);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("12")]
    [InlineData("unknown")]
    public async Task Analyze_ClearsInvalidGrade(string grade)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "Основи геометрії", grade, "Геометрія", "Theory", null, new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Null(result.Grade);
        Assert.True(result.RequiresReview);
    }

    [Theory]
    [InlineData("Лінійні нерівності", "Лінійні нерівності")]
    [InlineData("Похідна", "Похідна та її застосування")]
    public async Task Analyze_AcceptsTopicEqualToOrAppropriatelyExpandingTitle(string title, string topic)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            title, "7", topic, "Theory", null, new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Equal(title, result.Title);
        Assert.Equal(topic, result.Topic);
        Assert.False(result.RequiresReview);
    }

    [Fact]
    public async Task Analyze_UsesTitleAsTopicWhenAiTopicIsBlank()
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "Формули скороченого множення", "7", " ", "Theory", null,
            new(.9m, .9m, null, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Equal("Формули скороченого множення", result.Topic);
    }

    [Theory]
    [InlineData("Матеріал пояснює похідну. Підготувала Олена Іваненко.")]
    [InlineData("МТВ")]
    [InlineData("Ліцей №23 «Соборний»")]
    [InlineData("© 2026 Автор: О. Іваненко")]
    [InlineData("Логотип MathArchive")]
    [InlineData("Джерело: https://example.com/material")]
    [InlineData("Більше матеріалів: @math_teacher")]
    public async Task Analyze_RejectsDescriptionContainingAttributionOrBranding(string description)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "Похідна", "10", "Похідна та її застосування", "Theory", description,
            new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Null(result.Description);
        Assert.True(result.RequiresReview);
    }

    [Fact]
    public async Task Analyze_PreservesDescriptionContainingOnlyEducationalContent()
    {
        const string description = "Матеріал пояснює означення похідної, правила диференціювання, формули та приклади, що допомагають учневі закріпити тему.";
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "Похідна", "10", "Похідна та її застосування", "Theory", description,
            new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Equal(description, result.Description);
        Assert.False(result.RequiresReview);
    }

    [Theory]
    [InlineData("Матеріал допоможе студентам засвоїти правила.")]
    [InlineData("Посібник призначений для студентів.")]
    [InlineData("Корисно для учнів і студенток.")]
    [InlineData("Завдання виконуються студентом самостійно.")]
    public async Task Analyze_RejectsEveryStudentWordFormFromDescription(string description)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "Лінійні нерівності", "8", "Лінійні нерівності", "Theory", description,
            new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Null(result.Description);
        Assert.True(result.RequiresReview);
    }

    [Theory]
    [InlineData("Матеріал допоможе учням засвоїти правила розв’язування лінійних нерівностей.")]
    [InlineData("Наочна пам’ятка для учнів 5–11 класів.")]
    [InlineData("Схема допомагає школярам повторити основні формули.")]
    public async Task Analyze_PreservesSchoolAudienceTerminology(string description)
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "Лінійні нерівності", "8", "Лінійні нерівності", "Theory", description,
            new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Equal(description, result.Description);
        Assert.DoesNotContain("студент", result.Description, StringComparison.OrdinalIgnoreCase);
        Assert.False(result.RequiresReview);
    }

    [Fact]
    public async Task Analyze_RejectsAttributionMonogramFromTitleAndUsesEducationalTopicFallback()
    {
        var service = CreateService(new FakeUsage(), new FakeClient(new OpenAiAnalysisResult(
            "МТВ", "10", "Похідна", "Theory", "Матеріал пояснює правила диференціювання.",
            new(.9m, .9m, .9m, .9m), null, null, null, 200, null)));

        var result = await service.AnalyzeAsync(JpegFile(), null, CancellationToken.None);

        Assert.Equal("Матеріал за темою «Похідна»", result.Title);
        Assert.Equal("Похідна", result.Topic);
        Assert.DoesNotContain("МТВ", result.Title);
        Assert.True(result.RequiresReview);
    }

    private static MaterialAnalysisService CreateService(FakeUsage usage, FakeClient client)
    {
        var options = Options.Create(new OpenAiOptions { Model = "test-model" });
        return new MaterialAnalysisService(client, usage, new UploadedFileValidator(),
            new OpenAiUsageCostCalculator(options), new FakeClock(), options, NullLogger<MaterialAnalysisService>.Instance);
    }

    private static UploadedFile JpegFile(string fileName = "scan.jpg") => new(new MemoryStream([0xff, 0xd8, 0xff, 0x00]), fileName, "image/jpeg", 4);
    private sealed class FakeClock : IClock { public DateTimeOffset UtcNow => new(2026, 9, 14, 12, 0, 0, TimeSpan.Zero); }
    private sealed class FakeClient(OpenAiAnalysisResult result) : IOpenAiMaterialClient
    {
        public int CallCount { get; private set; }
        public IReadOnlyList<string> AllowedTypes { get; private set; } = [];
        public Task<OpenAiAnalysisResult> AnalyzeAsync(UploadedFile file, IReadOnlyList<string> documentTypes, CancellationToken cancellationToken) { CallCount++; AllowedTypes = documentTypes; return Task.FromResult(result); }
    }
    private sealed class FakeUsage : IAiUsageRepository
    {
        public bool Fail { get; init; }
        public List<AiUsageRecord> Records { get; } = [];
        public Task AddAsync(AiUsageRecord record, CancellationToken cancellationToken) { if (Fail) throw new InvalidOperationException(); Records.Add(record); return Task.CompletedTask; }
        public Task<AiUsageSummaryData> GetSummaryAsync(DateTimeOffset todayStart, DateTimeOffset monthStart, CancellationToken cancellationToken) => Task.FromResult(new AiUsageSummaryData(0, 0, 0, 0, 0, 0, 0, null, null));
        public Task<PagedResult<AiUsageItem>> GetHistoryAsync(AiUsageQuery query, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<AiCostRecalculationResult> RecalculateMissingCostsAsync(IOpenAiUsageCostCalculator calculator, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
