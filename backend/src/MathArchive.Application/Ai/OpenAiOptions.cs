namespace MathArchive.Application.Ai;

public sealed class OpenAiOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public int AnalysisTimeoutSeconds { get; set; } = 60;
    public int MaximumPagesToAnalyze { get; set; } = 3;
    public decimal MonthlyWarningLimitUsd { get; set; } = 5m;
    public bool BlockRequestsWhenLimitReached { get; set; }
    public int TelemetryRetentionDays { get; set; } = 365;
    public Dictionary<string, OpenAiModelPricing> Pricing { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class OpenAiModelPricing
{
    public decimal InputPerMillionTokensUsd { get; set; }
    public decimal OutputPerMillionTokensUsd { get; set; }
}
