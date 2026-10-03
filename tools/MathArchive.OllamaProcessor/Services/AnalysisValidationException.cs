namespace MathArchive.OllamaProcessor.Services;

public sealed class AnalysisValidationException(IReadOnlyList<string> errors)
    : Exception("Ollama returned structured data that did not pass validation.")
{
    public IReadOnlyList<string> Errors { get; } = errors;
}
