namespace MathArchive.Domain.Assistant;

public sealed class RagChunk
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MaterialId { get; set; }
    public string Content { get; set; } = "";
    public int ChunkIndex { get; set; }
    public float[] Embedding { get; set; } = [];
    public string EmbeddingModel { get; set; } = "";
    public string ContentHash { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class AssistantSetting
{
    public int Id { get; set; } = 1;
    public string Json { get; set; } = "{}";
    public DateTimeOffset? LastFullReindex { get; set; }
}

public sealed class AssistantRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string ActorHash { get; set; } = "";
    public string Query { get; set; } = "";
    public int? Grade { get; set; }
    public string? Topic { get; set; }
    public string Intent { get; set; } = "Unknown";
    public string Status { get; set; } = "Started";
    public string Answer { get; set; } = "";
    public string SourcesJson { get; set; } = "[]";
    public string ExecutionsJson { get; set; } = "[]";
    public long DurationMs { get; set; }
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public decimal CostUsd { get; set; }
    public int Retries { get; set; }
    public int RetrievedChunks { get; set; }
}

// Reserved spend survives restarts. Unknown provider outcomes retain their reservation.
public sealed class AiDailySpend
{
    public DateOnly Day { get; set; }
    public decimal CommittedUsd { get; set; }
}

public sealed class RagIndexState
{
    public Guid MaterialId { get; set; }
    public string Fingerprint { get; set; } = "";
    public string? ApprovedText { get; set; }
    public string? ExtractedText { get; set; }
    public string SourceFingerprint { get; set; } = "";
    public string ExtractionMethod { get; set; } = "";
    public string ExtractionStatus { get; set; } = "Pending";
    public DateTimeOffset? ExtractedAt { get; set; }
    public string? ExtractionError { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTimeOffset? IndexedAt { get; set; }
    public bool FullReindex { get; set; }
}
