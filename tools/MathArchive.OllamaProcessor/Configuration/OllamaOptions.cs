namespace MathArchive.OllamaProcessor.Configuration;

public sealed class OllamaOptions
{
    public const string SectionName = "Ollama";

    public string BaseUrl { get; set; } = "http://localhost:11434";
    public string VisionModel { get; set; } = "qwen3-vl:8b-instruct";
    public int TimeoutSeconds { get; set; } = 1200;
    public long MaximumImageBytes { get; set; } = 10 * 1024 * 1024;
    public int ContextWindow { get; set; } = 4096;
    public int MaximumOutputTokens { get; set; } = 1536;
    public string KeepAlive { get; set; } = "10m";
}
