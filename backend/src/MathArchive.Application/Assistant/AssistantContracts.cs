using MathArchive.Domain.Assistant;

namespace MathArchive.Application.Assistant;

public sealed class AssistantOptions
{
    public bool Enabled { get; set; } // Public student availability; does not gate admin indexing.
    public bool RagEnabled { get; set; } = true; // Indexing and retrieval; off preserves stored corpus.
    public bool TutorEnabled { get; set; } = true;
    public bool ExerciseEnabled { get; set; } = true;
    public bool VerifierEnabled { get; set; } = true;
    public bool GeneralKnowledgeFallback { get; set; }
    public bool LlmRouterEnabled { get; set; }
    public string TutorModel { get; set; } = "";
    public string ExerciseModel { get; set; } = "";
    public string VerifierModel { get; set; } = "";
    public string RouterModel { get; set; } = "";
    public string EmbeddingModel { get; set; } = "text-embedding-3-small";
    public string VisionModel { get; set; } = "";
    public int TopK { get; set; } = 4;
    public double MinimumRelevance { get; set; } = 0.35;
    public int ChunkCharacters { get; set; } = 2800;
    public int ChunkOverlapCharacters { get; set; } = 300;
    public int MaxDocumentCharacters { get; set; } = 150000;
    public int MaxPromptLength { get; set; } = 2000;
    public int MaxInputTokens { get; set; } = 100000;
    public int MaxOutputTokens { get; set; } = 1200;
    public int MaxAgentCalls { get; set; } = 8;
    public int MaxLlmCalls { get; set; } = 6;
    public int MaxRetries { get; set; } = 1;
    public int TimeoutSeconds { get; set; } = 60;
    public decimal MaxRequestCostUsd { get; set; } = 0.05m;
    public decimal DailyBudgetUsd { get; set; } = 1m;
    // Shared school Wi-Fi can legitimately send 30 requests at once.
    public int RequestsPerIdentityPerMinute { get; set; } = 40;
    public int GlobalRequestsPerMinute { get; set; } = 120;
    public int MaxConcurrentRequests { get; set; } = 30;
    public int RetentionDays { get; set; } = 30;

    public bool IsValid() => TopK is >= 1 and <= 10 && MinimumRelevance is >= 0 and <= 1 &&
        ChunkCharacters is >= 1000 and <= 4000 && ChunkOverlapCharacters >= 0 && ChunkOverlapCharacters < ChunkCharacters / 2 &&
        MaxDocumentCharacters is >= 4000 and <= 500000 && MaxPromptLength is >= 100 and <= 8000 &&
        MaxInputTokens is >= 1000 and <= 100000 && MaxOutputTokens is >= 100 and <= 4000 &&
        MaxAgentCalls is >= 1 and <= 12 && MaxLlmCalls is >= 1 and <= 10 && MaxRetries is >= 0 and <= 2 &&
        TimeoutSeconds is >= 5 and <= 120 && MaxRequestCostUsd is > 0 and <= 1 && DailyBudgetUsd is >= 0 and <= 100 &&
        RequestsPerIdentityPerMinute is >= 1 and <= 120 && GlobalRequestsPerMinute is >= 30 and <= 600 &&
        MaxConcurrentRequests is >= 1 and <= 60 && RetentionDays is >= 1 and <= 365 &&
        new[] { TutorModel, ExerciseModel, VerifierModel, RouterModel, EmbeddingModel, VisionModel }.All(x => x is not null && x.Length <= 100) &&
        !string.IsNullOrWhiteSpace(EmbeddingModel);
}

public enum AssistantIntent { Search, Explain, GenerateExercises, Solve, CheckSolution, Mixed, Unknown }
public sealed record AssistantQuery(string Question, int? Grade = null, string? Topic = null, Guid? MaterialId = null);
public sealed record AssistantSource(Guid MaterialId, string Title, int? Grade, string Topic, string Url);
public sealed record RetrievedChunk(Guid Id, string Content, double Relevance, AssistantSource Source);
public sealed record AgentExecution(string AgentName, DateTimeOffset StartedAt, long DurationMs, bool Success,
    string Model, int InputTokens, int OutputTokens, decimal CostUsd, bool IsParallel = false, string? ErrorCategory = null);
public sealed record AssistantResult(Guid RequestId, string Answer, IReadOnlyList<AssistantSource> Sources, bool GeneralKnowledge);
public sealed record ProviderResult(string Text, int InputTokens, int OutputTokens);
public sealed record EmbeddingResult(float[] Vector, int InputTokens);
public sealed record AgentResult(string Output, bool Success = true);
public sealed class AssistantException(string category, string message, int status = 503) : Exception(message)
{
    public string Category { get; } = category;
    public int Status { get; } = status;
}

public interface IAssistantStore
{
    Task<AssistantOptions> GetSettingsAsync(CancellationToken ct);
    Task SaveSettingsAsync(AssistantOptions settings, CancellationToken ct);
    Task<bool> ReserveAsync(DateOnly day, decimal amount, decimal limit, CancellationToken ct);
    Task SettleAsync(DateOnly day, decimal reserved, decimal actual, CancellationToken ct);
    Task<decimal> DailySpendAsync(DateOnly day, CancellationToken ct);
    Task SaveRequestAsync(AssistantRequest request, CancellationToken ct);
    Task<IReadOnlyList<AssistantRequest>> RequestsAsync(DateTimeOffset from, DateTimeOffset to, int page, CancellationToken ct);
    Task<AssistantRequest?> RequestAsync(Guid id, CancellationToken ct);
    Task<AssistantStatistics> StatisticsAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken ct);
}
public sealed record AgentStatistics(string AgentName, int Calls, int Failures, long InputTokens, long OutputTokens, decimal CostUsd, double AverageDurationMs);
public sealed record AssistantStatistics(int Requests, int Succeeded, int Failed, int RateLimited, int BudgetRejected,
    long InputTokens, long OutputTokens, decimal CostUsd, double AverageDurationMs, int LlmCalls, int RagSearches,
    int ActiveUsers, int Retries, int RetrievedChunks, IReadOnlyList<AgentStatistics> Agents, int PeakConcurrency = 0, IReadOnlyList<UsageBreakdown>? Intents = null, IReadOnlyList<UsageBreakdown>? Topics = null, IReadOnlyList<UsageBreakdown>? HoursUtc = null);
public sealed record UsageBreakdown(string Label, int Requests);
public interface IAssistantProvider
{
    Task<ProviderResult> GenerateAsync(string model, string instructions, string input, int maxOutputTokens, CancellationToken ct);
}
public interface IEmbeddingService
{
    Task<EmbeddingResult> EmbedAsync(string model, string text, CancellationToken ct);
}
public sealed record VisionInput(byte[] Content, string ContentType, string FileName, int Units, int TextUpperTokens = 0);
public interface IRagVisionProvider
{
    Task<ProviderResult> ExtractAsync(string model, string instructions, IReadOnlyList<VisionInput> inputs, int maxOutputTokens, CancellationToken ct);
}
public interface IRagSearchService
{
    Task<IReadOnlyList<RetrievedChunk>> SearchAsync(float[] vector, string model, AssistantQuery query, int topK, double minimumRelevance, CancellationToken ct);
}
public interface IRagIndexer
{
    Task IndexAsync(Guid materialId, bool force, CancellationToken ct);
    Task ReindexAsync(CancellationToken ct, bool allowVision = true);
    Task ExtractVisionAsync(Guid materialId, CancellationToken ct);
    Task ScheduleMissingAsync(Guid? materialId, CancellationToken ct);
}
public interface IAgent
{
    string Name { get; }
    Task<AgentResult> ExecuteAsync(AssistantContext context, CancellationToken ct);
}
