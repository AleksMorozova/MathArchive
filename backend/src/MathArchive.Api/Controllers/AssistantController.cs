using System.Security.Cryptography;
using System.Text;
using MathArchive.Application.Assistant;
using MathArchive.Domain.Assistant;
using MathArchive.Infrastructure.Auth;
using MathArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MathArchive.Api.Controllers;

[ApiController]
[Route("api/assistant")]
public sealed class AssistantController(AssistantOrchestrator orchestrator, IAssistantStore store, IOptions<JwtOptions> jwt, ILogger<AssistantController> logger) : ControllerBase
{
    [HttpGet("status")]
    public async Task<object> Status(CancellationToken ct)
    {
        var settings = await store.GetSettingsAsync(ct);
        return new { settings.Enabled, settings.MaxPromptLength };
    }
    [HttpPost("query")]
    [RequestSizeLimit(32768)]
    public async Task<AssistantResult> Query(AssistantQuery query, CancellationToken ct)
    {
        var actor = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ??
            (User.Identity?.IsAuthenticated == true ? User.Identity.Name : null) ??
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        // Daily pseudonym; never persist or expose a raw address. JWT secret remains server-side.
        var key = Encoding.UTF8.GetBytes(jwt.Value.SigningKey);
        var hash = Convert.ToHexString(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{DateTime.UtcNow:yyyy-MM-dd}:{actor}")));
        using var scope = logger.BeginScope(new Dictionary<string, object> { ["HttpTraceId"] = HttpContext.TraceIdentifier });
        return await orchestrator.QueryAsync(query, hash, ct);
    }
}

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/assistant")]
public sealed class AdminAssistantController(IAssistantStore store, IRagIndexer indexer, MathArchiveDbContext db) : ControllerBase
{
    [HttpGet("settings")]
    public Task<AssistantOptions> Settings(CancellationToken ct) => store.GetSettingsAsync(ct);
    [HttpPut("settings")]
    public async Task<IActionResult> Settings(AssistantOptions settings, CancellationToken ct)
    {
        await store.SaveSettingsAsync(settings, ct);
        return NoContent();
    }
    [HttpGet("daily-budget")]
    public async Task<object> Daily(CancellationToken ct)
    {
        var settings = await store.GetSettingsAsync(ct);
        var spend = await store.DailySpendAsync(DateOnly.FromDateTime(DateTime.UtcNow), ct);
        return new { budgetUsd = settings.DailyBudgetUsd, estimatedCommittedUsd = spend,
            remainingUsd = Math.Max(0, settings.DailyBudgetUsd - spend), exhausted = spend >= settings.DailyBudgetUsd,
            percentConsumed = settings.DailyBudgetUsd > 0 ? Math.Min(100, spend / settings.DailyBudgetUsd * 100) : 100,
            dayBoundary = "UTC" };
    }
    [HttpGet("statistics")]
    public Task<AssistantStatistics> Statistics(DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        ValidateRange(from, to);
        return store.StatisticsAsync(from.ToUniversalTime(), to.ToUniversalTime(), ct);
    }
    [HttpGet("requests")]
    public async Task<object> Requests(DateTimeOffset from, DateTimeOffset to, int page = 1, CancellationToken ct = default)
    {
        ValidateRange(from, to);
        var rows = await store.RequestsAsync(from.ToUniversalTime(), to.ToUniversalTime(), page, ct);
        return rows.Select(x => new { x.Id, x.CreatedAt, queryPreview = x.Query.Length > 120 ? x.Query[..120] : x.Query,
            x.Grade, x.Intent, x.Status, x.InputTokens, x.OutputTokens, x.CostUsd, x.DurationMs });
    }
    [HttpGet("requests/{id:guid}")]
    public async Task<IActionResult> RequestDetails(Guid id, CancellationToken ct)
    {
        var row = await store.RequestAsync(id, ct);
        return row is null ? NotFound(new ProblemDetails { Status = 404, Title = "Запит не знайдено" }) : Ok(row);
    }
    [HttpGet("rag/status")]
    public async Task<object> RagStatus(CancellationToken ct)
    {
        var states = db.Set<RagIndexState>();
        var rows = await (from d in db.Documents.AsNoTracking()
                          join s in states.AsNoTracking() on d.Id equals s.MaterialId into joined
                          from s in joined.DefaultIfEmpty()
                          orderby d.Title
                          select new { materialId = d.Id, d.Title, d.OriginalFileName, d.FileSize,
                              status = s == null ? "Pending" : s.Status,
                              extractionMethod = s == null ? "" : s.ExtractionMethod,
                              extractionStatus = s == null ? "Pending" : s.ExtractionStatus,
                              extractedAt = s == null ? null : s.ExtractedAt,
                              extractionError = s == null ? null : s.ExtractionError,
                              approved = s != null && s.ApprovedText != null }).ToArrayAsync(ct);
        var materials = rows.Select(x => new { x.materialId, x.Title, x.status, extractionMethod = x.approved ? "Teacher Approved" : x.extractionMethod, x.extractionStatus, x.extractedAt, x.extractionError,
            fileType = Path.GetExtension(x.OriginalFileName).ToLowerInvariant(),
            visionEligible = !x.approved && x.extractionStatus is not ("Extracted" or "NeedsReview" or "Approved") &&
                x.status is "NeedsText" or "Failed" && x.FileSize <= 10 * 1024 * 1024 &&
                Path.GetExtension(x.OriginalFileName).ToLowerInvariant() is ".pdf" or ".png" or ".jpg" or ".jpeg" or ".webp" or ".docx" or ".pptx" }).ToArray();
        var distribution = materials.GroupBy(x => x.fileType).Select(g => new { fileType = g.Key, total = g.Count(),
            nativeExtracted = g.Count(x => x.extractionStatus == "Extracted"), indexed = g.Count(x => x.status == "Indexed"),
            needsText = g.Count(x => x.status == "NeedsText"), needsReview = g.Count(x => x.status == "NeedsReview"),
            failed = g.Count(x => x.status == "Failed"), pending = g.Count(x => x.status == "Pending"), visionCandidates = g.Count(x => x.visionEligible) }).ToArray();
        var pending = materials.Where(x => x.status != "Indexed").ToArray();
        var embedding = await db.AiUsageRecords.Where(x => x.Operation == "IndexEmbedding").GroupBy(x => 1)
            .Select(g => new { calls = g.Count(), tokens = g.Sum(x => (long)(x.InputTokens ?? 0)), costUsd = g.Sum(x => x.EstimatedCostUsd ?? 0) }).SingleOrDefaultAsync(ct);
        return new { indexedMaterials = await states.CountAsync(x => x.Status == "Indexed", ct),
            totalChunks = await db.Set<RagChunk>().CountAsync(ct), failedMaterials = await states.CountAsync(x => x.Status == "Failed", ct),
            lastIndexingTime = await states.MaxAsync(x => x.IndexedAt, ct),
            lastFullReindex = await db.Set<AssistantSetting>().Select(x => x.LastFullReindex).SingleOrDefaultAsync(ct), embedding, pending,
            totalMaterials = materials.Length, needsTextMaterials = materials.Count(x => x.status == "NeedsText"),
            needsReviewMaterials = materials.Count(x => x.status == "NeedsReview"), pendingMaterials = materials.Count(x => x.status == "Pending"),
            visionCandidates = materials.Count(x => x.visionEligible), distribution, materials };
    }
    [HttpPost("rag/reindex")]
    public async Task<IActionResult> Reindex(CancellationToken ct)
    {
        await indexer.ReindexAsync(ct);
        return NoContent();
    }
    [HttpPost("rag/vision")]
    public async Task<IActionResult> Vision(CancellationToken ct)
    {
        await indexer.ReindexAsync(ct, allowVision: true);
        return NoContent();
    }
    [HttpPost("rag/materials/{id:guid}/vision")]
    public async Task<IActionResult> Vision(Guid id, CancellationToken ct)
    {
        if (!await db.Documents.AnyAsync(x => x.Id == id, ct)) return NotFound();
        await indexer.ExtractVisionAsync(id, ct);
        return NoContent();
    }
    [HttpGet("rag/materials/{id:guid}/text")]
    public async Task<IActionResult> Text(Guid id, CancellationToken ct)
    {
        if (!await db.Documents.AnyAsync(x => x.Id == id, ct)) return NotFound();
        var state = await db.Set<RagIndexState>().AsNoTracking().SingleOrDefaultAsync(x => x.MaterialId == id, ct);
        return Ok(new { text = state?.ApprovedText ?? state?.ExtractedText ?? "", state?.ApprovedText, state?.ExtractedText,
            extractionMethod = state?.ApprovedText is not null ? "Teacher Approved" : state?.ExtractionMethod,
            originalExtractionMethod = state?.ExtractionMethod, state?.ExtractionStatus, state?.ExtractedAt, state?.ExtractionError });
    }
    public sealed record ApprovedText(string Text);
    [HttpPut("rag/materials/{id:guid}/text")]
    public async Task<IActionResult> Text(Guid id, ApprovedText input, CancellationToken ct)
    {
        var settings = await store.GetSettingsAsync(ct);
        if (string.IsNullOrWhiteSpace(input.Text) || input.Text.Length > settings.MaxDocumentCharacters)
            throw new AssistantException("Validation", "Уведи текст у межах ліміту документа.", 400);
        if (!await db.Documents.AnyAsync(x => x.Id == id, ct)) return NotFound();
        var state = await db.Set<RagIndexState>().FindAsync([id], ct);
        if (state is null) db.Add(state = new RagIndexState { MaterialId = id });
        state.ApprovedText = input.Text.Trim(); state.Status = "Pending";
        if (state.ExtractionMethod.Length == 0) state.ExtractionMethod = "Teacher Approved";
        state.ExtractionStatus = "Approved"; state.ExtractionError = null;
        await db.SaveChangesAsync(ct);
        await indexer.IndexAsync(id, false, ct);
        return NoContent();
    }
    private static void ValidateRange(DateTimeOffset from, DateTimeOffset to)
    {
        if (to <= from || to - from > TimeSpan.FromDays(366))
            throw new AssistantException("Validation", "Укажи коректний період до одного року.", 400);
    }
}
