using System.IO.Compression;
using System.Text;
using MathArchive.Application.Ai;
using MathArchive.Application.Assistant;
using MathArchive.Application.Files;
using MathArchive.Domain.Assistant;
using MathArchive.Domain.Documents;
using MathArchive.Infrastructure.Ai;
using MathArchive.Infrastructure.Assistant;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class RagExtractionTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private MathArchiveDbContext Context() => new(new DbContextOptionsBuilder<MathArchiveDbContext>().UseNpgsql(fixture.ConnectionString).Options);
    private sealed class Vision : IRagVisionProvider
    {
        public int Calls;
        public bool Fail;
        public Task<ProviderResult> ExtractAsync(string model, string instructions, IReadOnlyList<VisionInput> inputs, int maxOutputTokens, CancellationToken ct)
        {
            Calls++;
            Assert.Contains("do not explain, solve", instructions);
            Assert.InRange(inputs.Sum(x => x.Units), 1, 5);
            if (Fail) throw new IOException("fake failure");
            return Task.FromResult(new ProviderResult("Лінійне рівняння ax + b = 0. Приклад: 2x + 4 = 0. [Нерозбірливо]", 100, 50));
        }
    }
    private sealed class Storage(byte[] bytes) : IFileStorage
    {
        public int Reads;
        public Task<Stream?> TryOpenReadAsync(string name, CancellationToken ct) { Reads++; return Task.FromResult<Stream?>(new MemoryStream(bytes)); }
        public Task<StoredFileResult> SaveAsync(Stream stream, string name, string type, CancellationToken ct) => throw new NotSupportedException();
        public Task DeleteAsync(string name, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Embeddings : IEmbeddingService
    {
        public List<string> Inputs { get; } = [];
        public Task<EmbeddingResult> EmbedAsync(string model, string text, CancellationToken ct)
        { Inputs.Add(text); return Task.FromResult(new EmbeddingResult([1, 0], 20)); }
    }
    private sealed class Harness : IDisposable
    {
        public readonly MathArchiveDbContext Db;
        public readonly AssistantTests.FakeStore Store = new();
        public readonly Vision Vision = new();
        public readonly Embeddings Embeddings = new();
        public readonly Storage Files;
        public readonly RagIndexer Indexer;
        public Harness(MathArchiveDbContext db, byte[] bytes)
        {
            Db = db; Files = new(bytes);
            Store.Settings.MaxRequestCostUsd = 1;
            var options = Options.Create(new OpenAiOptions { Model = "gpt-4o-mini", Pricing = new() {
                ["gpt-4o-mini"] = new() { InputPerMillionTokensUsd = 0.15m, OutputPerMillionTokensUsd = 0.60m },
                ["text-embedding-3-small"] = new() { InputPerMillionTokensUsd = 0.02m } } });
            var paid = new PaidAiService(Store, new AssistantTests.FakeProvider(), Embeddings, new OpenAiUsageCostCalculator(options), options, Vision);
            Indexer = new(Db, Files, Store, paid, new RagIndexLock(), NullLogger<RagIndexer>.Instance);
        }
        public void Dispose() => Db.Dispose();
        public async Task<Document> AddAsync(string extension, string? approved = null)
        {
            var d = new Document("Лінійні рівняння", "Опис матеріалу", 7, "Рівняння", DocumentType.Theory,
                "material" + extension, "immutable-source" + extension, "application/octet-stream", 100, DateTimeOffset.UtcNow);
            Db.Add(d); if (approved is not null) Db.Add(new RagIndexState { MaterialId = d.Id, ApprovedText = approved });
            await Db.SaveChangesAsync(); return d;
        }
        public async Task<RagIndexState> StateAsync(Guid id) { Db.ChangeTracker.Clear(); return (await Db.Set<RagIndexState>().FindAsync(id))!; }
    }
    private static byte[] Pdf(bool readable, int pages = 1)
    {
        var builder = new PdfDocumentBuilder();
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        for (var i = 0; i < pages; i++)
        {
            var page = builder.AddPage(PageSize.A4);
            if (readable) page.AddText("Linear equations: ax + b = 0. An equation has two equal expressions. Example: 2x + 4 = 0.", 12, new PdfPoint(20, 700), font);
        }
        return builder.Build();
    }
    private static byte[] Office(string path)
    {
        using var bytes = new MemoryStream();
        using (var zip = new ZipArchive(bytes, ZipArchiveMode.Create, true))
        using (var writer = new StreamWriter(zip.CreateEntry(path).Open(), Encoding.UTF8))
            writer.Write("<document><p><t>Лінійні рівняння: ax + b = 0. Рівняння — рівність з невідомим. Приклад: 2x + 4 = 0.</t></p></document>");
        return bytes.ToArray();
    }
    [Theory]
    [InlineData(".pdf", "Native PDF")]
    [InlineData(".docx", "DOCX")]
    [InlineData(".pptx", "PPTX")]
    public async Task Native_extraction_wins_and_text_and_embeddings_are_reused(string extension, string method)
    {
        using var h = new Harness(Context(), extension == ".pdf" ? Pdf(true) : Office(extension == ".docx" ? "word/document.xml" : "ppt/slides/slide1.xml"));
        var d = await h.AddAsync(extension);
        await h.Indexer.ReindexAsync(default, true);
        var state = await h.StateAsync(d.Id);
        Assert.Equal("Indexed", state.Status); Assert.Equal(method, state.ExtractionMethod);
        Assert.Equal(0, h.Vision.Calls); Assert.Equal(1, h.Files.Reads);
        var calls = h.Embeddings.Inputs.Count;
        await h.Indexer.ReindexAsync(default, true);
        Assert.Equal(calls, h.Embeddings.Inputs.Count); Assert.Equal(1, h.Files.Reads);
        Assert.Equal(0, h.Vision.Calls);
    }
    [Theory]
    [InlineData(".pdf")]
    [InlineData(".png")]
    public async Task Insufficient_sources_require_explicit_vision_then_teacher_review(string extension)
    {
        using var h = new Harness(Context(), extension == ".pdf" ? Pdf(false) : [1, 2, 3]);
        var d = await h.AddAsync(extension);
        await h.Indexer.ReindexAsync(default);
        Assert.Equal("NeedsText", (await h.StateAsync(d.Id)).Status); Assert.Equal(0, h.Vision.Calls);
        await h.Indexer.ReindexAsync(default, true);
        var state = await h.StateAsync(d.Id);
        Assert.Equal("NeedsReview", state.Status); Assert.Equal("Vision/OCR", state.ExtractionMethod);
        Assert.Contains("ax + b", state.ExtractedText); Assert.NotNull(state.ExtractedAt);
        Assert.Contains("IndexVision", h.Store.Last!.ExecutionsJson);
        Assert.True(h.Store.Last.CostUsd > 0);
        Assert.Empty(h.Embeddings.Inputs); Assert.Equal(1, h.Vision.Calls);
        await h.Indexer.ReindexAsync(default, true);
        Assert.Equal(1, h.Vision.Calls); Assert.Empty(h.Embeddings.Inputs);
        state = await h.StateAsync(d.Id); state.ApprovedText = "Перевірений текст: ax + b = 0.";
        await h.Db.SaveChangesAsync();
        await h.Indexer.IndexAsync(d.Id, false, default);
        Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status);
        Assert.Contains("Перевірений текст", Assert.Single(h.Embeddings.Inputs));
    }
    [Fact]
    public async Task Teacher_text_has_precedence_and_survives_full_reindex_without_opening_source()
    {
        using var h = new Harness(Context(), [1, 2, 3]);
        var d = await h.AddAsync(".png", "Учитель перевірив формулу: x = -b/a.");
        await h.Indexer.ReindexAsync(default, true); await h.Indexer.ReindexAsync(default, true);
        Assert.Equal(0, h.Files.Reads); Assert.Equal(0, h.Vision.Calls);
        Assert.Single(h.Embeddings.Inputs); var state = await h.StateAsync(d.Id);
        Assert.Equal("Teacher Approved", state.ExtractionMethod); Assert.Contains("Учитель", state.ApprovedText);
    }
    [Fact]
    public async Task Metadata_in_every_embedding_changes_hash_without_reextracting_source()
    {
        using var h = new Harness(Context(), Office("word/document.xml"));
        var d = await h.AddAsync(".docx"); await h.Indexer.IndexAsync(d.Id, false, default);
        var input = Assert.Single(h.Embeddings.Inputs);
        foreach (var metadata in new[] { d.Title, d.Topic, d.Description!, "Клас: 7" }) Assert.Contains(metadata, input);
        h.Db.ChangeTracker.Clear(); var tracked = await h.Db.Documents.SingleAsync();
        tracked.UpdateMetadata(tracked.Title, "Оновлений опис", tracked.Grade, tracked.Topic, tracked.DocumentType, DateTimeOffset.UtcNow);
        await new DocumentRepository(h.Db).SaveChangesAsync(default);
        await h.Indexer.IndexAsync(d.Id, false, default);
        Assert.Equal(1, h.Files.Reads); Assert.Equal(2, h.Embeddings.Inputs.Count);
        Assert.Contains("Оновлений опис", h.Embeddings.Inputs[1]); Assert.Equal(0, h.Vision.Calls);
        Assert.Single(await h.Db.Set<RagChunk>().ToArrayAsync());
    }
    [Fact]
    public async Task Failed_vision_is_retryable_and_completed_bulk_retry_does_not_repeat_paid_work()
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png");
        h.Vision.Fail = true; await h.Indexer.ReindexAsync(default, true);
        Assert.Equal("Failed", (await h.StateAsync(d.Id)).Status); Assert.Empty(h.Embeddings.Inputs);
        Assert.Contains("IndexVision", h.Store.Last!.ExecutionsJson);
        h.Vision.Fail = false; await h.Indexer.ReindexAsync(default, true);
        Assert.Equal("NeedsReview", (await h.StateAsync(d.Id)).Status); Assert.Equal(2, h.Vision.Calls);
        await h.Indexer.ReindexAsync(default, true); Assert.Equal(2, h.Vision.Calls);
    }
    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public async Task Disabled_AI_or_RAG_prevents_any_paid_extraction(bool enabled, bool rag)
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png");
        h.Store.Settings.Enabled = enabled; h.Store.Settings.RagEnabled = rag;
        await Assert.ThrowsAsync<AssistantException>(() => h.Indexer.ReindexAsync(default, true));
        await h.Indexer.ExtractVisionAsync(d.Id, default);
        Assert.Equal(0, h.Vision.Calls); Assert.Empty(h.Embeddings.Inputs);
    }
    [Fact]
    public async Task Exhausted_daily_budget_blocks_provider_and_retains_retryable_state()
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png"); h.Store.AllowSpend = false;
        var ex = await Assert.ThrowsAsync<AssistantException>(() => h.Indexer.ReindexAsync(default, true));
        Assert.Equal("DailyBudget", ex.Category); Assert.Equal(0, h.Vision.Calls);
        Assert.Equal("Failed", (await h.StateAsync(d.Id)).Status);
    }
    [Fact]
    public async Task Over_page_limit_stays_manual_without_sending_partial_pdf()
    {
        using var h = new Harness(Context(), Pdf(false, 6)); var d = await h.AddAsync(".pdf");
        await h.Indexer.ReindexAsync(default, true);
        var state = await h.StateAsync(d.Id);
        Assert.Equal("NeedsText", state.Status); Assert.Equal("UnsupportedOrOverLimit", state.ExtractionError);
        Assert.Equal(0, h.Vision.Calls);
    }
    [Fact]
    public async Task Admin_status_counts_unprocessed_materials_and_exposes_review_text_without_public_access()
    {
        using var h = new Harness(Context(), [1, 2, 3]);
        var missing = await h.AddAsync(".docx"); var image = await h.AddAsync(".png");
        await h.Indexer.ExtractVisionAsync(image.Id, default);
        using var anonymous = fixture.CreateClient(); using var forbidden = fixture.CreateForbiddenClient();
        foreach (var url in new[] { "/api/admin/assistant/rag/vision", $"/api/admin/assistant/rag/materials/{image.Id}/vision" })
        {
            Assert.Equal(System.Net.HttpStatusCode.Unauthorized, (await anonymous.PostAsync(url, null)).StatusCode);
            Assert.Equal(System.Net.HttpStatusCode.Forbidden, (await forbidden.PostAsync(url, null)).StatusCode);
        }
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/admin/assistant/rag/materials/{image.Id}/text")).StatusCode);
        using var admin = await fixture.CreateAuthorizedClientAsync();
        using var status = System.Text.Json.JsonDocument.Parse(await admin.GetStringAsync("/api/admin/assistant/rag/status"));
        Assert.Equal(2, status.RootElement.GetProperty("totalMaterials").GetInt32());
        Assert.Equal(1, status.RootElement.GetProperty("needsReviewMaterials").GetInt32());
        Assert.Equal(1, status.RootElement.GetProperty("pendingMaterials").GetInt32());
        Assert.Equal(2, status.RootElement.GetProperty("distribution").GetArrayLength());
        using var text = System.Text.Json.JsonDocument.Parse(await admin.GetStringAsync($"/api/admin/assistant/rag/materials/{image.Id}/text"));
        Assert.Contains("ax + b", text.RootElement.GetProperty("text").GetString());
        Assert.Equal("NeedsReview", text.RootElement.GetProperty("extractionStatus").GetString());
    }
    [Fact]
    public async Task Per_material_budget_rejects_vision_before_provider_call()
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png");
        h.Store.Settings.MaxRequestCostUsd = 0.0001m;
        await h.Indexer.ExtractVisionAsync(d.Id, default);
        Assert.Equal(0, h.Vision.Calls);
        Assert.Equal("RequestBudget", (await h.StateAsync(d.Id)).ExtractionError);
    }
    [Fact]
    public async Task Every_chunk_embedding_includes_metadata_and_unchanged_bulk_run_creates_no_duplicates()
    {
        using var h = new Harness(Context(), [1, 2, 3]);
        var text = string.Join('\n', Enumerable.Repeat("Linear equation: ax + b = 0. Example: 2x + 4 = 0.", 150));
        var d = await h.AddAsync(".png", text);
        await h.Indexer.ReindexAsync(default);
        Assert.True(h.Embeddings.Inputs.Count > 1);
        Assert.All(h.Embeddings.Inputs, input => {
            Assert.Contains(d.Title, input); Assert.Contains(d.Topic, input);
            Assert.Contains(d.Description!, input); Assert.Contains("Клас: 7", input);
        });
        var count = h.Embeddings.Inputs.Count;
        await h.Indexer.ReindexAsync(default, true);
        Assert.Equal(count, h.Embeddings.Inputs.Count);
        Assert.Equal(count, await h.Db.Set<RagChunk>().CountAsync());
        Assert.Equal(0, h.Vision.Calls); Assert.Equal(0, h.Files.Reads);
    }
}
