using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using MathArchive.Application.Assistant;
using MathArchive.Application.Files;
using MathArchive.Domain.Assistant;
using MathArchive.Domain.Documents;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace MathArchive.Infrastructure.Assistant;

public sealed class RagIndexLock
{
    public SemaphoreSlim Gate { get; } = new(1, 1);
}

public static class RagChunking
{
    public static IReadOnlyList<string> Split(string text, int size, int overlap)
    {
        if (size <= 0 || overlap < 0 || overlap >= size) throw new ArgumentOutOfRangeException(nameof(size));
        var chunks = new List<string>();
        for (var start = 0; start < text.Length;)
        {
            var end = Math.Min(start + size, text.Length);
            if (end < text.Length)
            {
                var boundary = text.LastIndexOf('\n', end - 1, end - start);
                if (boundary > start + size / 2) end = boundary + 1;
            }
            var content = text[start..end].Trim();
            if (content.Length > 0) chunks.Add(content);
            if (end == text.Length) break;
            start = Math.Max(start + 1, end - overlap);
        }
        return chunks;
    }
    public static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
}

public sealed class RagIndexer(MathArchiveDbContext db, IFileStorage files, IAssistantStore store,
    PaidAiService paid, RagIndexLock indexLock, ILogger<RagIndexer> logger) : IRagIndexer
{
    public async Task ReindexAsync(CancellationToken ct, bool allowVision = false)
    {
        var settings = await store.GetSettingsAsync(ct);
        if (!settings.Enabled || !settings.RagEnabled) throw new AssistantException("Disabled", "Увімкни помічника та RAG перед індексацією.");
        if (!await indexLock.Gate.WaitAsync(0, ct)) throw new AssistantException("ReindexRunning", "Індексація вже виконується.", 409);
        try
        {
            var page = 0;
            while (true)
            {
                var currentSettings = await store.GetSettingsAsync(ct);
                if (!currentSettings.Enabled || !currentSettings.RagEnabled) throw new AssistantException("Disabled", "Індексацію зупинено: помічник або RAG вимкнений.");
                var ids = await db.Documents.AsNoTracking().OrderBy(x => x.Id).Skip(page++ * 20).Take(20).Select(x => x.Id).ToArrayAsync(ct);
                if (ids.Length == 0)
                {
                    db.ChangeTracker.Clear();
                    var maintenance = await db.Set<AssistantSetting>().SingleOrDefaultAsync(x => x.Id == 1, ct);
                    if (maintenance is null) db.Add(maintenance = new AssistantSetting { Json = JsonSerializer.Serialize(settings) });
                    maintenance.LastFullReindex = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    break;
                }
                foreach (var id in ids) await IndexCoreAsync(id, true, ct, allowVision);
            }
        }
        finally { indexLock.Gate.Release(); }
    }
    public async Task IndexAsync(Guid materialId, bool force, CancellationToken ct)
    {
        await indexLock.Gate.WaitAsync(ct);
        try { await IndexCoreAsync(materialId, force, ct); }
        finally { indexLock.Gate.Release(); }
    }
    public async Task ExtractVisionAsync(Guid materialId, CancellationToken ct)
    {
        if (!await indexLock.Gate.WaitAsync(0, ct)) throw new AssistantException("ReindexRunning", "Індексація вже виконується.", 409);
        try { await IndexCoreAsync(materialId, true, ct, true); }
        finally { indexLock.Gate.Release(); }
    }
    private async Task IndexCoreAsync(Guid id, bool force, CancellationToken ct, bool allowVision = false)
    {
        db.ChangeTracker.Clear();
        var settings = await store.GetSettingsAsync(ct);
        if (!settings.Enabled || !settings.RagEnabled) return;
        var document = await db.Documents.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (document is null) return;
        var state = await db.Set<RagIndexState>().SingleOrDefaultAsync(x => x.MaterialId == id, ct);
        if (state is null) db.Add(state = new RagIndexState { MaterialId = id });
        var fingerprint = RagChunking.Hash(JsonSerializer.Serialize(new { document.Title, document.Description, document.Grade,
            document.Topic, document.StoredFileName, state.ApprovedText, settings.EmbeddingModel, settings.ChunkCharacters, settings.ChunkOverlapCharacters }));
        if (!force && state.Fingerprint == fingerprint && state.Status == "Indexed") return;
        var approvedText = state.ApprovedText;
        state.Status = "Pending";
        await db.SaveChangesAsync(ct);
        var audit = new AssistantRequest { Query = "Індексація матеріалу: " + document.Title, Intent = "Index", ActorHash = "admin-index" };
        var indexSettings = JsonSerializer.Deserialize<AssistantOptions>(JsonSerializer.Serialize(settings))!;
        indexSettings.MaxInputTokens = Math.Max(settings.MaxDocumentCharacters * 4 + 10000, 400000);
        var context = new AssistantContext(new AssistantQuery(audit.Query), indexSettings, audit.Id);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
        var token = timeout.Token;
        try
        {
            var sourceFingerprint = RagChunking.Hash($"native-v2:{document.StoredFileName}:{document.FileSize}");
            string? text = approvedText;
            if (text is null)
            {
                if (state.SourceFingerprint != sourceFingerprint || state.ExtractedText is null)
                {
                    var native = await ExtractAsync(document, settings.MaxDocumentCharacters, token);
                    state.ExtractedText = native.Text;
                    state.SourceFingerprint = sourceFingerprint;
                    state.ExtractionMethod = native.Method;
                    state.ExtractionStatus = native.Sufficient ? "Extracted" : "NeedsText";
                    state.ExtractedAt = DateTimeOffset.UtcNow;
                    state.ExtractionError = null;
                    if (!await SourceStillCurrentAsync(document, approvedText, token)) { audit.Status = "Superseded"; return; }
                    await db.SaveChangesAsync(token);
                }
                if (allowVision && state.ExtractionStatus is "NeedsText" or "Failed")
                {
                    var inputs = await VisionInputsAsync(document, token);
                    if (inputs.Count > 0)
                    {
                        var result = await paid.ExtractAsync(context, inputs, token);
                        if (result.Text.Length > settings.MaxDocumentCharacters) throw new IOException("Vision text exceeds character limit");
                        if (!await SourceStillCurrentAsync(document, approvedText, token)) { audit.Status = "Superseded"; return; }
                        state.ExtractedText = result.Text.Trim();
                        state.ExtractionMethod = "Vision/OCR";
                        state.ExtractionStatus = "NeedsReview";
                        state.ExtractedAt = DateTimeOffset.UtcNow;
                        state.ExtractionError = null;
                    }
                    else state.ExtractionError = "UnsupportedOrOverLimit";
                }
                text = state.ExtractedText;
                if (state.ExtractionStatus != "Extracted")
                {
                    state.Status = state.ExtractionStatus == "NeedsReview" ? "NeedsReview" : "NeedsText";
                    await db.SaveChangesAsync(token);
                    audit.Status = state.Status;
                    return;
                }
            }
            if (approvedText is not null)
            {
                if (state.ExtractionMethod.Length == 0) state.ExtractionMethod = "Teacher Approved";
                state.ExtractionStatus = "Approved";
            }
            if (string.IsNullOrWhiteSpace(text)) throw new IOException("Empty approved/extracted text");
            if (text.Length > settings.MaxDocumentCharacters) throw new IOException("Approved text exceeds document character limit");
            var prefix = $"{document.Title}\n{document.Topic}\nКлас: {document.Grade?.ToString() ?? "Загальні матеріали"}\n{document.Description}\n";
            var content = prefix + text;
            var existing = await db.Set<RagChunk>().Where(x => x.MaterialId == id).ToArrayAsync(token);
            var oldByHash = existing.Where(x => x.EmbeddingModel == settings.EmbeddingModel).GroupBy(x => x.ContentHash).ToDictionary(x => x.Key, x => x.First());
            var chunks = new List<RagChunk>();
            foreach (var chunk in RagChunking.Split(content, settings.ChunkCharacters, settings.ChunkOverlapCharacters))
            {
                var embeddingInput = prefix + chunk;
                var hash = RagChunking.Hash(embeddingInput);
                var vector = oldByHash.TryGetValue(hash, out var old) ? old.Embedding : await paid.EmbedAsync(context, embeddingInput, token);
                chunks.Add(new RagChunk { MaterialId = id, Content = chunk, ContentHash = hash, ChunkIndex = chunks.Count,
                    Embedding = vector, EmbeddingModel = settings.EmbeddingModel, UpdatedAt = DateTimeOffset.UtcNow });
            }
            // Lock briefly only for committing index data; provider calls occur before this transaction.
            await using var tx = await db.Database.BeginTransactionAsync(token);
            var current = await db.Documents.FromSqlInterpolated($"SELECT * FROM documents WHERE id = {id} FOR UPDATE").AsNoTracking().SingleOrDefaultAsync(token);
            var currentState = await db.Set<RagIndexState>().AsNoTracking().SingleOrDefaultAsync(x => x.MaterialId == id, token);
            if (current is null || current.UpdatedAt != document.UpdatedAt || currentState?.ApprovedText != approvedText)
            {
                await tx.RollbackAsync(token);
                audit.Status = "Superseded";
                return;
            }
            await db.Set<RagChunk>().Where(x => x.MaterialId == id).ExecuteDeleteAsync(token);
            db.AddRange(chunks);
            state.Fingerprint = fingerprint; state.Status = "Indexed"; state.IndexedAt = DateTimeOffset.UtcNow;
            state.FullReindex = force;
            await db.SaveChangesAsync(token);
            await tx.CommitAsync(token);
            audit.Status = "Succeeded"; audit.RetrievedChunks = chunks.Count;
        }
        catch (Exception ex)
        {
            audit.Status = ex is AssistantException safe ? safe.Category : "IndexFailed";
            logger.LogWarning(ex, "RAG indexing failed for {MaterialId}", id);
            db.ChangeTracker.Clear();
            using var failureTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await db.Set<RagIndexState>().Where(x => x.MaterialId == id && x.ApprovedText == approvedText)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "Failed")
                .SetProperty(x => x.ExtractionError, audit.Status), failureTimeout.Token);
            if (ct.IsCancellationRequested || ex is AssistantException { Category: "DailyBudget" or "Disabled" }) throw;
        }
        finally
        {
            audit.ExecutionsJson = JsonSerializer.Serialize(context.Executions.Select(x => x.AgentName == "Embedding" ? x with { AgentName = "IndexEmbedding" } : x));
            audit.InputTokens = context.Executions.Sum(x => x.InputTokens);
            audit.CostUsd = context.Executions.Sum(x => x.CostUsd);
            audit.OutputTokens = context.Executions.Sum(x => x.OutputTokens);
            audit.DurationMs = context.Executions.Sum(x => x.DurationMs);
            using var auditTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            try { await store.SaveRequestAsync(audit, auditTimeout.Token); }
            catch (Exception ex) { logger.LogError(ex, "Index audit persistence failed for {MaterialId}", id); }
        }
    }
    private async Task<bool> SourceStillCurrentAsync(Document document, string? approved, CancellationToken ct) =>
        await db.Documents.AnyAsync(x => x.Id == document.Id && x.StoredFileName == document.StoredFileName, ct) &&
        await db.Set<RagIndexState>().AsNoTracking().AnyAsync(x => x.MaterialId == document.Id && x.ApprovedText == approved, ct);
    private sealed record NativeExtraction(string Text, string Method, bool Sufficient);
    private static bool SufficientText(string text) => text.Count(char.IsLetterOrDigit) >= 40 && !text.Contains('\uFFFD');
    private async Task<NativeExtraction> ExtractAsync(Document document, int maximum, CancellationToken ct)
    {
        await using var stream = await files.TryOpenReadAsync(document.StoredFileName, ct) ?? throw new IOException("Material file unavailable");
        if (document.FileSize > 30 * 1024 * 1024) throw new IOException("Material exceeds extraction size limit");
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, ct); buffer.Position = 0;
        var text = new StringBuilder();
        var extension = Path.GetExtension(document.OriginalFileName).ToLowerInvariant();
        var sufficient = true;
        if (extension == ".pdf")
        {
            using var pdf = PdfDocument.Open(buffer);
            foreach (var page in pdf.GetPages())
            {
                ct.ThrowIfCancellationRequested();
                var pageText = ContentOrderTextExtractor.GetText(page);
                sufficient &= SufficientText(pageText);
                text.AppendLine(pageText);
                if (text.Length > maximum) throw new IOException("Extracted document exceeds character limit");
            }
        }
        else if (extension is ".docx" or ".pptx")
        {
            using var zip = new ZipArchive(buffer, ZipArchiveMode.Read);
            foreach (var entry in zip.Entries.Where(x => x.FullName == "word/document.xml" ||
                (x.FullName.StartsWith("ppt/slides/slide", StringComparison.Ordinal) && x.FullName.EndsWith(".xml", StringComparison.Ordinal))).OrderBy(x => x.FullName))
            {
                ct.ThrowIfCancellationRequested();
                using var reader = XmlReader.Create(entry.Open(), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 2000000 });
                var xml = XDocument.Load(reader);
                foreach (var paragraph in xml.Descendants().Where(x => x.Name.LocalName == "p"))
                    text.AppendLine(string.Concat(paragraph.Descendants().Where(x => x.Name.LocalName is "t" or "oMath").Select(x => x.Value)));
                if (text.Length > maximum) throw new IOException("Extracted document exceeds character limit");
            }
        }
        var method = extension switch { ".pdf" => "Native PDF", ".docx" => "DOCX", ".pptx" => "PPTX", _ => "Unsupported" };
        return new(text.ToString(), method, sufficient && SufficientText(text.ToString()));
    }
    private async Task<IReadOnlyList<VisionInput>> VisionInputsAsync(Document document, CancellationToken ct)
    {
        // Hard limits bound request size and reservation. Never silently truncate a document.
        if (document.FileSize > 10 * 1024 * 1024) return [];
        await using var stream = await files.TryOpenReadAsync(document.StoredFileName, ct) ?? throw new IOException("Material file unavailable");
        using var buffer = new MemoryStream();
        var block = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(block, ct)) > 0)
        {
            if (buffer.Length + read > 10 * 1024 * 1024) return [];
            await buffer.WriteAsync(block.AsMemory(0, read), ct);
        }
        var bytes = buffer.ToArray();
        var extension = Path.GetExtension(document.OriginalFileName).ToLowerInvariant();
        if (extension == ".pdf")
        {
            using var pdf = PdfDocument.Open(bytes);
            if (pdf.NumberOfPages is < 1 or > 5) return [];
            var textUpperTokens = pdf.GetPages().Sum(page => Encoding.UTF8.GetByteCount(ContentOrderTextExtractor.GetText(page)));
            return [new(bytes, "application/pdf", document.OriginalFileName, pdf.NumberOfPages, textUpperTokens)];
        }
        var mime = extension switch { ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".webp" => "image/webp", _ => "" };
        if (mime.Length > 0) return [new(bytes, mime, document.OriginalFileName, 1)];
        // Office vision inspects embedded images only; the native path handles textual content.
        if (extension is not (".docx" or ".pptx")) return [];
        buffer.Position = 0;
        using var zip = new ZipArchive(buffer, ZipArchiveMode.Read);
        var images = zip.Entries.Where(x => (x.FullName.StartsWith("word/media/", StringComparison.Ordinal) || x.FullName.StartsWith("ppt/media/", StringComparison.Ordinal)) &&
            Path.GetExtension(x.FullName).ToLowerInvariant() is ".png" or ".jpg" or ".jpeg" or ".webp").OrderBy(x => x.FullName).ToArray();
        if (images.Length is < 1 or > 5 || images.Sum(x => x.Length) > 10 * 1024 * 1024) return [];
        var inputs = new List<VisionInput>();
        foreach (var image in images)
        {
            using var imageBuffer = new MemoryStream();
            await using var imageStream = image.Open();
            await imageStream.CopyToAsync(imageBuffer, ct);
            var imageMime = Path.GetExtension(image.FullName).ToLowerInvariant() switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
            inputs.Add(new(imageBuffer.ToArray(), imageMime, image.Name, 1));
        }
        return inputs;
    }
}
