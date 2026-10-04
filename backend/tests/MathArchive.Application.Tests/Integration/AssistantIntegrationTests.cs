using MathArchive.Application;
using MathArchive.Application.Assistant;
using MathArchive.Domain.Assistant;
using MathArchive.Domain.Documents;
using MathArchive.Infrastructure;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class AssistantIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        await using var db = Context();
        await db.Set<AssistantRequest>().ExecuteDeleteAsync();
        await db.Set<AssistantSetting>().ExecuteDeleteAsync();
        await db.Set<AiDailySpend>().ExecuteDeleteAsync();
    }
    public Task DisposeAsync() => Task.CompletedTask;
    private MathArchiveDbContext Context() => new(new DbContextOptionsBuilder<MathArchiveDbContext>().UseNpgsql(fixture.ConnectionString).Options);
    private ServiceProvider Services()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
            ["ConnectionStrings:DefaultConnection"] = fixture.ConnectionString,
            ["OpenAI:Model"] = "test", ["Pricing:test:InputPerMillionTokensUsd"] = "0.1", ["Pricing:test:OutputPerMillionTokensUsd"] = "0.5",
            ["Pricing:text-embedding-3-small:InputPerMillionTokensUsd"] = "0.02", ["Pricing:text-embedding-3-small:OutputPerMillionTokensUsd"] = "0"
        }).Build();
        var services = new ServiceCollection().AddLogging().AddApplication().AddInfrastructure(config);
        var fake = new AssistantTests.FakeProvider();
        services.AddSingleton<IAssistantProvider>(fake); services.AddSingleton<IEmbeddingService>(fake);
        return services.BuildServiceProvider();
    }
    private static Document Material(int? grade, string title = "Похідна") => new(title, "Опис", grade, "Похідна", DocumentType.Test,
        "test.pdf", "test.pdf", "application/pdf", 100, DateTimeOffset.UtcNow);

    [Fact]
    public async Task Public_status_is_minimal_and_setting_toggles_preserve_the_stored_corpus()
    {
        Guid id, chunkId;
        await using (var db = Context())
        {
            var document = Material(10); id = document.Id;
            var chunk = new RagChunk { MaterialId = id, Content = "Похідна x² — 2x", EmbeddingModel = "text-embedding-3-small", Embedding = [1, 0], ContentHash = "existing-hash" };
            chunkId = chunk.Id;
            db.Add(document); db.Add(chunk);
            db.Add(new RagIndexState { MaterialId = id, Status = "Indexed", ExtractedText = "Похідна x² — 2x", ExtractionStatus = "Extracted" });
            await db.SaveChangesAsync();
        }
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var anonymous = fixture.CreateClient();
        foreach (var settings in new[] { new AssistantOptions { Enabled = false, RagEnabled = true },
            new AssistantOptions { Enabled = true, RagEnabled = false }, new AssistantOptions { Enabled = false, RagEnabled = false } })
        {
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync("/api/admin/assistant/settings", settings)).StatusCode);
            using var status = JsonDocument.Parse(await anonymous.GetStringAsync("/api/assistant/status"));
            Assert.Equal(settings.Enabled, status.RootElement.GetProperty("enabled").GetBoolean());
            Assert.Equal(new[] { "enabled", "maxPromptLength" }, status.RootElement.EnumerateObject().Select(x => x.Name).OrderBy(x => x).ToArray());
            await using var db = Context();
            var state = await db.Set<RagIndexState>().SingleAsync();
            Assert.Equal("Indexed", state.Status); Assert.Equal("Похідна x² — 2x", state.ExtractedText);
            Assert.Equal(chunkId, (await db.Set<RagChunk>().SingleAsync()).Id);
            if (!settings.Enabled)
                Assert.Equal(HttpStatusCode.ServiceUnavailable, (await anonymous.PostAsJsonAsync("/api/assistant/query", new AssistantQuery("Поясни похідну"))).StatusCode);
            Assert.Equal(0, await db.AiUsageRecords.CountAsync());
        }
    }
    [Fact]
    public async Task RAG_controls_remain_AdminOnly_with_public_assistant_disabled()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync();
        await admin.PutAsJsonAsync("/api/admin/assistant/settings", new AssistantOptions { Enabled = false, RagEnabled = true });
        using var anonymous = fixture.CreateClient(); using var forbidden = fixture.CreateForbiddenClient();
        foreach (var path in new[] { "rag/pending", "rag/reindex", "rag/vision", $"rag/materials/{Guid.NewGuid()}/retry", $"rag/materials/{Guid.NewGuid()}/vision" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/admin/assistant/" + path, null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await forbidden.PostAsync("/api/admin/assistant/" + path, null)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/assistant/rag/status")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/assistant/rag/status")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await forbidden.GetAsync("/api/admin/assistant/rag/status")).StatusCode);
    }

    [Fact]
    public async Task Admin_endpoints_enforce_existing_policy_and_disabled_query_never_calls_provider()
    {
        using var anon = fixture.CreateClient();
        using var forbidden = fixture.CreateForbiddenClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/assistant/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await forbidden.GetAsync("/api/admin/assistant/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await anon.PostAsJsonAsync("/api/assistant/query", new AssistantQuery("Поясни тему"))).StatusCode);
        using var admin = await fixture.CreateAuthorizedClientAsync();
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/assistant/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/assistant/settings", new AssistantOptions { TopK = 0 })).StatusCode);
    }
    [Fact]
    public async Task Concurrent_daily_reservations_cannot_exceed_budget_and_survive_store_recreation()
    {
        using var services = Services(); var store = services.GetRequiredService<IAssistantStore>();
        var day = DateOnly.FromDateTime(DateTime.UtcNow);
        var reservations = await Task.WhenAll(Enumerable.Range(0, 30).Select(_ => store.ReserveAsync(day, 0.04m, 1m, default)));
        Assert.Equal(25, reservations.Count(x => x)); Assert.Equal(1m, await store.DailySpendAsync(day, default));
        using var second = Services(); Assert.False(await second.GetRequiredService<IAssistantStore>().ReserveAsync(day, 0.01m, 1m, default));
        await store.SettleAsync(day, 0.04m, 0.01m, default);
        Assert.Equal(0.97m, await store.DailySpendAsync(day, default));
    }
    [Fact]
    public async Task Retrieval_filters_grade_topic_material_and_excludes_low_relevance_or_pending_chunks()
    {
        var a = Material(10); var b = Material(5); var general = Material(null); var irrelevant = Material(10); var stale = Material(10);
        await using (var db = Context())
        {
            db.AddRange(a,b,general,irrelevant,stale);
            foreach (var d in new[] { a,b,general,irrelevant,stale })
            {
                db.Add(new RagIndexState { MaterialId = d.Id, Status = d == stale ? "Pending" : "Indexed" });
                db.Add(new RagChunk { MaterialId = d.Id, Content = d.Title, EmbeddingModel = "embed", Embedding = d == irrelevant ? [0,1] : [1,0] });
            }
            await db.SaveChangesAsync();
        }
        await using var searchDb = Context(); var search = new MathArchive.Infrastructure.Assistant.RagSearchService(searchDb);
        var hits = await search.SearchAsync([1,0], "embed", new("query", 10, "Похідна"), 10, 0.5, default);
        Assert.Equal(2, hits.Count); Assert.Contains(hits, x => x.Source.MaterialId == a.Id); Assert.Contains(hits, x => x.Source.Grade is null);
        Assert.Single(await search.SearchAsync([1,0], "embed", new("query", 10, "Похідна", a.Id), 10, 0.5, default));
        Assert.Empty(await search.SearchAsync([1,0], "another-model", new("query"), 10, 0.5, default));
    }
    [Fact]
    public async Task Incremental_index_reuses_embeddings_refreshes_metadata_and_deletion_cascades()
    {
        using var services = Services();
        var store = services.GetRequiredService<IAssistantStore>(); await store.SaveSettingsAsync(new() { Enabled = true }, default);
        var d = Material(10);
        await using (var db = Context()) { db.Add(d); db.Add(new RagIndexState { MaterialId = d.Id, ApprovedText = "Похідна x² дорівнює 2x." }); await db.SaveChangesAsync(); }
        using (var scope = services.CreateScope()) await scope.ServiceProvider.GetRequiredService<IRagIndexer>().IndexAsync(d.Id, false, default);
        var fake = (AssistantTests.FakeProvider)services.GetRequiredService<IEmbeddingService>(); var calls = fake.EmbeddingCalls;
        Assert.Equal(1, calls);
        using (var scope = services.CreateScope()) await scope.ServiceProvider.GetRequiredService<IRagIndexer>().IndexAsync(d.Id, true, default);
                Assert.Equal(calls, fake.EmbeddingCalls);
        using (var scope = services.CreateScope()) await scope.ServiceProvider.GetRequiredService<IRagIndexer>().ReindexAsync(default);
        await using (var db = Context()) Assert.NotNull((await db.Set<AssistantSetting>().SingleAsync()).LastFullReindex);
        Assert.Equal(calls, fake.EmbeddingCalls);
        await using (var db = Context())
        {
            var repo = new DocumentRepository(db); var tracked = (await repo.GetByIdAsync(d.Id, true, default))!;
            tracked.UpdateMetadata("Нова похідна", tracked.Description, 11, tracked.Topic, tracked.DocumentType, DateTimeOffset.UtcNow);
            await repo.SaveChangesAsync(default);
            Assert.Equal("Pending", (await db.Set<RagIndexState>().FindAsync(d.Id))!.Status);
        }
        using (var scope = services.CreateScope()) await scope.ServiceProvider.GetRequiredService<IRagIndexer>().IndexAsync(d.Id, false, default);
        Assert.Equal(calls + 1, fake.EmbeddingCalls);
        await using (var db = Context())
        {
            Assert.Contains("Нова похідна", (await db.Set<RagChunk>().SingleAsync()).Content);
            var doc = await db.Documents.SingleAsync(); db.Remove(doc); await db.SaveChangesAsync();
            Assert.Empty(await db.Set<RagChunk>().ToArrayAsync()); Assert.Empty(await db.Set<RagIndexState>().ToArrayAsync());
        }
    }
    [Fact]
    public async Task Statistics_uses_exclusive_end_date_and_aggregates_agents_and_costs()
    {
        using var services = Services(); var store = services.GetRequiredService<IAssistantStore>();
        var start = new DateTimeOffset(2026,10,3,0,0,0,TimeSpan.Zero); var end = start.AddDays(1);
        var executions = JsonSerializer.Serialize(new[] { new AgentExecution("TutorAgent", start, 100, true, "test", 100, 50, 0.000035m), new AgentExecution("SearchAgent", start, 20, true, "", 0,0,0) });
        await store.SaveRequestAsync(new() { CreatedAt = start, Query = "q", ActorHash = "actor", Status = "Succeeded", InputTokens = 100, OutputTokens = 50, CostUsd = 0.000035m, DurationMs = 120, ExecutionsJson = executions }, default);
        await store.SaveRequestAsync(new() { CreatedAt = end, Query = "excluded", Status = "Failed", CostUsd = 99 }, default);
        var stats = await store.StatisticsAsync(start, end, default);
        Assert.Equal(1, stats.Requests); Assert.Equal(1, stats.LlmCalls); Assert.Equal(1, stats.RagSearches); Assert.Equal(0.000035m, stats.CostUsd);
        Assert.Equal(100, stats.InputTokens); Assert.Equal(50, stats.OutputTokens); Assert.Equal(2, stats.Agents.Count); Assert.Equal(1, stats.PeakConcurrency); Assert.Single(stats.Intents!);
    }
}
