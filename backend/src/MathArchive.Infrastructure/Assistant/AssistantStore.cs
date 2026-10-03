using System.Text.Json;
using MathArchive.Application.Ai;
using MathArchive.Application.Assistant;
using MathArchive.Domain.Assistant;
using MathArchive.Domain.AiUsage;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace MathArchive.Infrastructure.Assistant;

// A fresh DbContext per operation allows independent agents to execute safely in parallel.
public sealed class AssistantStore(IServiceScopeFactory scopes, IOptions<AssistantOptions> defaults) : IAssistantStore
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    public async Task<AssistantOptions> GetSettingsAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        var row = await db.Set<AssistantSetting>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == 1, ct);
        return row is null ? defaults.Value : JsonSerializer.Deserialize<AssistantOptions>(row.Json, Json)!;
    }
    public async Task SaveSettingsAsync(AssistantOptions settings, CancellationToken ct)
    {
        if (!settings.IsValid()) throw new AssistantException("Validation", "Перевір налаштування та межі лімітів.", 400);
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        var row = await db.Set<AssistantSetting>().SingleOrDefaultAsync(x => x.Id == 1, ct);
        if (row is null) db.Add(row = new AssistantSetting());
        row.Json = JsonSerializer.Serialize(settings);
        await db.SaveChangesAsync(ct);
    }
    public async Task<bool> ReserveAsync(DateOnly day, decimal amount, decimal limit, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO ai_daily_spend (\"Day\", \"CommittedUsd\") VALUES ({day}, 0) ON CONFLICT DO NOTHING", ct);
        return await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ai_daily_spend SET \"CommittedUsd\" = \"CommittedUsd\" + {amount} WHERE \"Day\" = {day} AND \"CommittedUsd\" + {amount} <= {limit}", ct) == 1;
    }
    public async Task SettleAsync(DateOnly day, decimal reserved, decimal actual, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ai_daily_spend SET \"CommittedUsd\" = GREATEST(0, \"CommittedUsd\" - {reserved} + {actual}) WHERE \"Day\" = {day}", ct);
    }
    public async Task<decimal> DailySpendAsync(DateOnly day, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        return await db.Set<AiDailySpend>().Where(x => x.Day == day).Select(x => x.CommittedUsd).SingleOrDefaultAsync(ct);
    }
    public async Task SaveRequestAsync(AssistantRequest request, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        var row = await db.Set<AssistantRequest>().SingleOrDefaultAsync(x => x.Id == request.Id, ct);
        var recordUsage = request.Status != "Started" && (row is null || row.Status == "Started");
        if (row is null) db.Add(request);
        else db.Entry(row).CurrentValues.SetValues(request);
        if (recordUsage)
            foreach (var execution in JsonSerializer.Deserialize<AgentExecution[]>(request.ExecutionsJson) ?? [])
                if (!string.IsNullOrEmpty(execution.Model))
                    db.AiUsageRecords.Add(new AiUsageRecord(execution.StartedAt, execution.AgentName, execution.Model,
                        execution.Success ? AiRequestStatus.Succeeded : AiRequestStatus.Failed, execution.DurationMs,
                        execution.InputTokens, execution.OutputTokens, execution.InputTokens + execution.OutputTokens,
                        null, request.Id.ToString(), execution.ErrorCategory, execution.CostUsd, null));
        await db.SaveChangesAsync(ct);
    }
    public async Task<IReadOnlyList<AssistantRequest>> RequestsAsync(DateTimeOffset from, DateTimeOffset to, int page, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        return await db.Set<AssistantRequest>().AsNoTracking().Where(x => x.CreatedAt >= from && x.CreatedAt < to && x.Intent != "Index")
            .OrderByDescending(x => x.CreatedAt).Skip((Math.Clamp(page, 1, 10000) - 1) * 20).Take(20).ToArrayAsync(ct);
    }
    public async Task<AssistantRequest?> RequestAsync(Guid id, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>().Set<AssistantRequest>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
    }
    public async Task<AssistantStatistics> StatisticsAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        var rows = db.Set<AssistantRequest>().Where(x => x.CreatedAt >= from && x.CreatedAt < to && x.Intent != "Index");
        var total = await rows.GroupBy(x => 1).Select(g => new
        {
            Requests = g.Count(), Succeeded = g.Count(x => x.Status == "Succeeded"), Failed = g.Count(x => x.Status != "Succeeded" && x.Status != "Started"),
            RateLimited = g.Count(x => x.Status == "RateLimited"), BudgetRejected = g.Count(x => x.Status == "DailyBudget" || x.Status == "RequestBudget"),
            Input = g.Sum(x => (long)x.InputTokens), Output = g.Sum(x => (long)x.OutputTokens), Cost = g.Sum(x => x.CostUsd),
            Duration = g.Average(x => (double)x.DurationMs), Users = g.Select(x => x.ActorHash).Distinct().Count(),
            Retries = g.Sum(x => x.Retries), Chunks = g.Sum(x => x.RetrievedChunks)
        }).SingleOrDefaultAsync(ct);
        var agents = await db.Database.SqlQuery<AgentStatistics>($"""
            SELECT e->>'AgentName' AS "AgentName", COUNT(*)::integer AS "Calls",
              COUNT(*) FILTER (WHERE (e->>'Success')::boolean = false)::integer AS "Failures",
              COALESCE(SUM((e->>'InputTokens')::bigint),0)::bigint AS "InputTokens",
              COALESCE(SUM((e->>'OutputTokens')::bigint),0)::bigint AS "OutputTokens",
              COALESCE(SUM((e->>'CostUsd')::numeric),0) AS "CostUsd",
              AVG((e->>'DurationMs')::double precision) AS "AverageDurationMs"
            FROM assistant_requests r CROSS JOIN LATERAL jsonb_array_elements(r."ExecutionsJson") e
            WHERE r."CreatedAt" >= {from} AND r."CreatedAt" < {to} AND r."Intent" <> 'Index' GROUP BY e->>'AgentName'
            """).ToArrayAsync(ct);
        var intents = await rows.GroupBy(x => x.Intent).Select(g => new { Label = g.Key, Requests = g.Count() }).OrderByDescending(x => x.Requests).Take(10).ToArrayAsync(ct);
        var topics = await rows.Where(x => x.Topic != null).GroupBy(x => x.Topic!).Select(g => new { Label = g.Key, Requests = g.Count() }).OrderByDescending(x => x.Requests).Take(10).ToArrayAsync(ct);
        var hours = await rows.GroupBy(x => x.CreatedAt.Hour).Select(g => new { Hour = g.Key, Requests = g.Count() }).OrderBy(x => x.Hour).ToArrayAsync(ct);
        var peak = await db.Database.SqlQuery<int>($"""
            SELECT COALESCE(MAX(n),0)::integer AS "Value" FROM (
              SELECT SUM(SUM(delta)) OVER (ORDER BY time) AS n FROM (
                SELECT "CreatedAt" AS time, 1 AS delta FROM assistant_requests WHERE "CreatedAt" >= {from} AND "CreatedAt" < {to} AND "Intent" <> 'Index' AND "DurationMs" > 0 AND "Status" NOT IN ('RateLimited','Disabled')
                UNION ALL
                SELECT "CreatedAt" + "DurationMs" * interval '1 millisecond' AS time, -1 AS delta FROM assistant_requests WHERE "CreatedAt" >= {from} AND "CreatedAt" < {to} AND "Intent" <> 'Index' AND "DurationMs" > 0 AND "Status" NOT IN ('RateLimited','Disabled')
              ) events GROUP BY time
            ) concurrent
            """).SingleAsync(ct);
        return new(total?.Requests ?? 0, total?.Succeeded ?? 0, total?.Failed ?? 0, total?.RateLimited ?? 0,
            total?.BudgetRejected ?? 0, total?.Input ?? 0, total?.Output ?? 0, total?.Cost ?? 0, total?.Duration ?? 0,
            agents.Where(x => x.AgentName != "SearchAgent" && x.AgentName != "Embedding" && x.AgentName != "IndexEmbedding").Sum(x => x.Calls),
            agents.Where(x => x.AgentName == "SearchAgent").Sum(x => x.Calls), total?.Users ?? 0, total?.Retries ?? 0, total?.Chunks ?? 0, agents, peak, intents.Select(x => new UsageBreakdown(x.Label, x.Requests)).ToArray(), topics.Select(x => new UsageBreakdown(x.Label, x.Requests)).ToArray(), hours.Select(x => new UsageBreakdown($"{x.Hour:00}:00 UTC", x.Requests)).ToArray());
    }
}

public sealed class RagSearchService(MathArchiveDbContext db) : IRagSearchService
{
    public async Task<IReadOnlyList<RetrievedChunk>> SearchAsync(float[] vector, string model, AssistantQuery query,
        int topK, double minimumRelevance, CancellationToken ct)
    {
        var grade = query.Grade;
        var topic = query.Topic;
        var material = query.MaterialId;
        var results = await db.Database.SqlQuery<RagSearchRow>($"""
            SELECT c."Id", c."Content", d.id AS "MaterialId", d.title AS "Title", d.grade AS "Grade", d.topic AS "Topic",
              scores.similarity AS "Relevance"
            FROM rag_chunks c JOIN documents d ON d.id = c."MaterialId"
            CROSS JOIN LATERAL (
              SELECT SUM(a::double precision * b::double precision) /
                NULLIF(SQRT(SUM(a::double precision*a::double precision))*SQRT(SUM(b::double precision*b::double precision)),0) AS similarity
              FROM unnest(c."Embedding", {vector}::real[]) AS v(a,b)
            ) scores
            WHERE c."EmbeddingModel" = {model} AND cardinality(c."Embedding") = {vector.Length}
              AND ({grade}::integer IS NULL OR d.grade = {grade} OR d.grade IS NULL)
              AND ({topic}::text IS NULL OR d.topic = {topic})
              AND ({material}::uuid IS NULL OR d.id = {material})
              AND scores.similarity >= {minimumRelevance}
              AND EXISTS (SELECT 1 FROM rag_index_states s WHERE s."MaterialId" = d.id AND s."Status" = 'Indexed')
            ORDER BY scores.similarity DESC, c."Id" LIMIT {topK}
            """).ToArrayAsync(ct);
        return results.Select(x => new RetrievedChunk(x.Id, x.Content, x.Relevance,
            new(x.MaterialId, x.Title, x.Grade, x.Topic, $"/materials/{x.MaterialId}"))).ToArray();
    }
    private sealed class RagSearchRow
    {
        public Guid Id { get; set; }
        public string Content { get; set; } = "";
        public Guid MaterialId { get; set; }
        public string Title { get; set; } = "";
        public int? Grade { get; set; }
        public string Topic { get; set; } = "";
        public double Relevance { get; set; }
    }
}
