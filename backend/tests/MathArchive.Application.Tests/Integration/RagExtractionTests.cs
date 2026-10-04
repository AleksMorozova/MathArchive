using System.IO.Compression;
using System.Text;
using MathArchive.Application.Ai;
using MathArchive.Application.Assistant;
using MathArchive.Application.Files;
using MathArchive.Application.Documents;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
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
        public string Text = "Лінійне рівняння ax + b = 0. Приклад: 2x + 4 = 0. [Нерозбірливо]";
        public Task<ProviderResult> ExtractAsync(string model, string instructions, IReadOnlyList<VisionInput> inputs, int maxOutputTokens, CancellationToken ct)
        {
            Calls++;
            Assert.Contains("do not explain, solve", instructions);
            Assert.InRange(inputs.Sum(x => x.Units), 1, 5);
            if (Fail) throw new IOException("fake failure");
            return Task.FromResult(new ProviderResult(Text, 100, 50));
        }
    }
    private sealed class Storage(byte[] bytes) : IFileStorage
    {
        public int Reads;
        public Task<Stream?> TryOpenReadAsync(string name, CancellationToken ct) { Reads++; return Task.FromResult<Stream?>(new MemoryStream(bytes)); }
        public Task<StoredFileResult> SaveAsync(Stream stream, string name, string type, CancellationToken ct) =>
            Task.FromResult(new StoredFileResult(name, Guid.NewGuid() + Path.GetExtension(name), type, bytes.Length));
        public Task DeleteAsync(string name, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Embeddings : IEmbeddingService
    {
        public List<string> Inputs { get; } = [];
        public bool Fail;
        public Task<EmbeddingResult> EmbedAsync(string model, string text, CancellationToken ct)
        { Inputs.Add(text); if (Fail) throw new IOException("fake embedding failure"); AfterEmbedding?.Invoke(); return Task.FromResult(new EmbeddingResult([1, 0], 20)); }
        public Action? AfterEmbedding;
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
                ["text-embedding-3-small"] = new() { InputPerMillionTokensUsd = 0.02m },
                ["other-embedding"] = new() { InputPerMillionTokensUsd = 0.02m } } });
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
    private sealed class Clock : MathArchive.Application.Common.IClock
    {
        public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    }
    private static DocumentService Documents(Harness h) => new(new DocumentRepository(h.Db), h.Files, new Clock(),
        new DocumentMetadataValidator(), new InlineValidator<UploadedFile>(), NullLogger<DocumentService>.Instance);
    private static async Task RunPendingAsync(Harness h)
    {
        // Drive the same production tick, with zero network-capable providers.
        var services = new ServiceCollection().AddSingleton(h.Db).AddSingleton<IAssistantStore>(h.Store)
            .AddSingleton<IRagIndexer>(h.Indexer).BuildServiceProvider();
        await RagPendingIndexer.ProcessPendingAsync(services, default);
    }
    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task PNG_upload_commits_pending_before_AI_and_survives_provider_failures(bool visionFails, bool embeddingFails)
    {
        using var h = new Harness(Context(), [1, 2, 3]);
        h.Vision.Fail = visionFails; h.Embeddings.Fail = embeddingFails;
        h.Store.Settings.Enabled = false;
        var dto = await Documents(h).CreateAsync(new CreateDocumentCommand(
            new DocumentMetadata("Натуральні числа", "Опис", 5, "Числа", DocumentType.Theory),
            new UploadedFile(new MemoryStream([1, 2, 3]), "numbers.png", "image/png", 3)), default);
        Assert.Equal(0, h.Vision.Calls); Assert.Empty(h.Embeddings.Inputs);
        Assert.Equal("Pending", (await h.StateAsync(dto.Id)).Status);
        await RunPendingAsync(h);
        Assert.True(await h.Db.Documents.AnyAsync(d => d.Id == dto.Id));
        Assert.Equal(visionFails || embeddingFails ? "Failed" : "Indexed", (await h.StateAsync(dto.Id)).Status);
        Assert.Equal(1, h.Vision.Calls);
        if (embeddingFails)
        {
            Assert.NotNull((await h.StateAsync(dto.Id)).ExtractedText);
            h.Embeddings.Fail = false;
            await h.Indexer.IndexAsync(dto.Id, false, default);
            Assert.Equal(1, h.Vision.Calls); Assert.Equal("Indexed", (await h.StateAsync(dto.Id)).Status);
        }
    }
    [Fact]
    public async Task Image_metadata_reuses_vision_but_replacement_clears_old_approval_and_extracts_again()
    {
        using var h = new Harness(Context(), [1, 2, 3]);
        var d = await h.AddAsync(".png");
        await h.Indexer.IndexAsync(d.Id, false, default);
        await Documents(h).UpdateAsync(d.Id, new UpdateDocumentCommand(
            new DocumentMetadata("Інша назва", "Інший опис", 8, "Інша тема", DocumentType.Theory), null), default);
        await RunPendingAsync(h);
        Assert.Equal(1, h.Vision.Calls); Assert.Equal(2, h.Embeddings.Inputs.Count);
        Assert.Contains("Інший опис", h.Embeddings.Inputs.Last());
        var state = await h.StateAsync(d.Id); state.ApprovedText = "Перевірений учителем текст попереднього зображення.";
        await h.Db.SaveChangesAsync();
        await Documents(h).UpdateAsync(d.Id, new UpdateDocumentCommand(
            new DocumentMetadata("Інша назва", "Інший опис", 8, "Інша тема", DocumentType.Theory),
            new UploadedFile(new MemoryStream([1, 2, 3]), "replacement.png", "image/png", 3)), default);
        Assert.Null((await h.StateAsync(d.Id)).ApprovedText);
        Assert.Null((await h.StateAsync(d.Id)).ExtractedText);
        await RunPendingAsync(h);
        Assert.Equal(2, h.Vision.Calls); Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status);
        Assert.Single(await h.Db.Set<RagChunk>().ToArrayAsync());
    }
    [Fact]
    public async Task Pending_worker_recovers_interrupted_indexing_and_can_prepare_with_public_AI_disabled()
    {
        using var h = new Harness(Context(), [1, 2, 3]);
        var d = await h.AddAsync(".png");
        h.Db.Add(new RagIndexState { MaterialId = d.Id, Status = "Indexing" }); await h.Db.SaveChangesAsync();
        h.Store.Settings.Enabled = false;
        await RunPendingAsync(h);
        Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status); Assert.Equal(1, h.Vision.Calls);
        await RunPendingAsync(h); Assert.Equal(1, h.Vision.Calls);
    }
    [Fact]
    public async Task Public_off_allows_full_reindex_and_retry_while_RAG_off_preserves_chunks_and_pending_work()
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png");
        h.Store.Settings.Enabled = false;
        await h.Indexer.ReindexAsync(default);
        var chunk = await h.Db.Set<RagChunk>().AsNoTracking().SingleAsync();
        var text = (await h.StateAsync(d.Id)).ExtractedText;
        h.Store.Settings.RagEnabled = false;
        await h.Indexer.ScheduleMissingAsync(d.Id, default);
        await RunPendingAsync(h);
        Assert.Equal("Pending", (await h.StateAsync(d.Id)).Status);
        Assert.Equal(chunk.Id, (await h.Db.Set<RagChunk>().AsNoTracking().SingleAsync()).Id);
        Assert.Equal(text, (await h.StateAsync(d.Id)).ExtractedText);
        Assert.Equal(1, h.Vision.Calls); Assert.Single(h.Embeddings.Inputs);
        h.Store.Settings.RagEnabled = true;
        await RunPendingAsync(h);
        Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status);
        await h.Indexer.ReindexAsync(default);
        Assert.Equal(1, h.Vision.Calls); Assert.Single(h.Embeddings.Inputs);
        Assert.Single(await h.Db.Set<RagChunk>().ToArrayAsync());
    }
    [Fact]
    public async Task Missing_archive_can_be_scheduled_without_indexing_in_HTTP_request()
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png");
        using var anonymous = fixture.CreateClient();
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/admin/assistant/rag/pending", null)).StatusCode);
        using var admin = await fixture.CreateAuthorizedClientAsync();
        Assert.Equal(System.Net.HttpStatusCode.Accepted, (await admin.PostAsync("/api/admin/assistant/rag/pending", null)).StatusCode);
        Assert.Equal("Pending", (await h.StateAsync(d.Id)).Status); Assert.Equal(0, h.Vision.Calls);
        await RunPendingAsync(h);
        Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status);
        Assert.Equal(System.Net.HttpStatusCode.Accepted, (await admin.PostAsync("/api/admin/assistant/rag/pending", null)).StatusCode);
        await RunPendingAsync(h); Assert.Equal(1, h.Vision.Calls);
    }
    [Fact]
    public async Task Unreadable_OCR_retains_manual_text_path_without_embedding()
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png");
        h.Vision.Text = "[Нерозбірливо]";
        await h.Indexer.IndexAsync(d.Id, false, default);
        Assert.Equal("NeedsText", (await h.StateAsync(d.Id)).Status); Assert.Empty(h.Embeddings.Inputs);
    }
    [Fact]
    public async Task Changed_embedding_model_is_scheduled_as_stale_without_another_vision_call()
    {
        using var h = new Harness(Context(), [1, 2, 3]); var d = await h.AddAsync(".png");
        await h.Indexer.IndexAsync(d.Id, false, default);
        h.Store.Settings.EmbeddingModel = "other-embedding";
        await h.Indexer.ScheduleMissingAsync(null, default);
        Assert.Equal("Pending", (await h.StateAsync(d.Id)).Status);
        await RunPendingAsync(h);
        Assert.Equal(1, h.Vision.Calls); Assert.Equal(2, h.Embeddings.Inputs.Count);
        Assert.Equal("other-embedding", (await h.Db.Set<RagChunk>().SingleAsync()).EmbeddingModel);
        await h.Indexer.ScheduleMissingAsync(null, default);
        Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status);
    }
    [Fact]
    public async Task Batch_stops_on_budget_rejection_preserves_completed_materials_and_resumes_without_duplicates()
    {
        using var h = new Harness(Context(), [1, 2, 3]);
        for (var i = 0; i < 3; i++) await h.AddAsync(".png");
        await h.Indexer.ScheduleMissingAsync(null, default);
        h.Embeddings.AfterEmbedding = () => h.Store.AllowSpend = false;
        var error = await Assert.ThrowsAsync<AssistantException>(() => RunPendingAsync(h));
        Assert.Equal("DailyBudget", error.Category);
        Assert.Equal(1, await h.Db.Set<RagIndexState>().CountAsync(x => x.Status == "Indexed"));
        Assert.Equal(1, await h.Db.Set<RagIndexState>().CountAsync(x => x.Status == "Pending"));
        Assert.Equal(1, h.Vision.Calls);
        h.Store.AllowSpend = true; h.Embeddings.AfterEmbedding = null;
        await h.Indexer.ScheduleMissingAsync(null, default); await RunPendingAsync(h);
        Assert.Equal(3, h.Vision.Calls);
        Assert.Equal(3, await h.Db.Set<RagChunk>().CountAsync());
        Assert.Equal(3, await h.Db.Set<RagIndexState>().CountAsync(x => x.Status == "Indexed"));
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
    public async Task Vision_transcription_is_cached_and_automatically_embedded(string extension)
    {
        using var h = new Harness(Context(), extension == ".pdf" ? Pdf(false) : [1, 2, 3]);
        var d = await h.AddAsync(extension);
        await h.Indexer.ReindexAsync(default, false);
        Assert.Equal("NeedsText", (await h.StateAsync(d.Id)).Status); Assert.Equal(0, h.Vision.Calls);
        await h.Indexer.ReindexAsync(default, true);
        var state = await h.StateAsync(d.Id);
        Assert.Equal("Indexed", state.Status); Assert.Equal("Vision/OCR", state.ExtractionMethod);
        Assert.Contains("ax + b", state.ExtractedText); Assert.NotNull(state.ExtractedAt);
        Assert.Contains("IndexVision", h.Store.Last!.ExecutionsJson);
        Assert.True(h.Store.Last.CostUsd > 0);
        Assert.Single(h.Embeddings.Inputs); Assert.Equal(1, h.Vision.Calls);
        await h.Indexer.ReindexAsync(default, true);
        Assert.Equal(1, h.Vision.Calls); Assert.Single(h.Embeddings.Inputs);
        state = await h.StateAsync(d.Id); state.ApprovedText = "Перевірений текст: ax + b = 0.";
        await h.Db.SaveChangesAsync();
        await h.Indexer.IndexAsync(d.Id, false, default);
        Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status);
        Assert.Contains("Перевірений текст", h.Embeddings.Inputs.Last());
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
        Assert.Equal("Indexed", (await h.StateAsync(d.Id)).Status); Assert.Equal(2, h.Vision.Calls);
        await h.Indexer.ReindexAsync(default, true); Assert.Equal(2, h.Vision.Calls);
    }
    [Theory]
    [InlineData(true, false)]
    [InlineData(false, false)]
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
        Assert.Equal(0, status.RootElement.GetProperty("needsReviewMaterials").GetInt32());
        Assert.Equal(1, status.RootElement.GetProperty("pendingMaterials").GetInt32());
        Assert.Equal(2, status.RootElement.GetProperty("distribution").GetArrayLength());
        using var text = System.Text.Json.JsonDocument.Parse(await admin.GetStringAsync($"/api/admin/assistant/rag/materials/{image.Id}/text"));
        Assert.Contains("ax + b", text.RootElement.GetProperty("text").GetString());
        Assert.Equal("Extracted", text.RootElement.GetProperty("extractionStatus").GetString());
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
