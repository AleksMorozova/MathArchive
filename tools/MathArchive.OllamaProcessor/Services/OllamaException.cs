namespace MathArchive.OllamaProcessor.Services;

public enum OllamaErrorKind
{
    Unavailable,
    ModelMissing,
    Timeout,
    Cancelled,
    InvalidResponse
}

public sealed class OllamaException(string message, OllamaErrorKind kind, Exception? innerException = null)
    : Exception(message, innerException)
{
    public OllamaErrorKind Kind { get; } = kind;
}
