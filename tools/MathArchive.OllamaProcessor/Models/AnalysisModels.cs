namespace MathArchive.OllamaProcessor.Models;

public enum AnalysisSectionType
{
    Definition,
    FormulaGroup,
    Rule,
    Algorithm,
    Example,
    Table,
    Graph,
    NumberLine,
    Geometry,
    Text,
    ImportantNote
}

public enum AnalysisWarningType
{
    FormulaUncertain,
    TextUncertain,
    GraphUncertain,
    TableUncertain,
    GradeUncertain,
    TranslationUncertain
}

public enum AnalysisVisualKind
{
    FunctionGraph,
    NumberLine,
    Geometry
}

public sealed record MathArchiveImageAnalysis(
    string Title,
    string SourceLanguage,
    int? SuggestedGrade,
    string SuggestedTopic,
    IReadOnlyList<AnalysisSection> Sections,
    IReadOnlyList<AnalysisWarning> Warnings);

public sealed record AnalysisSection(
    string Id,
    AnalysisSectionType Type,
    string Title,
    string? Text,
    IReadOnlyList<string> Formulas,
    AnalysisTable? Table,
    AnalysisVisual? Visual);

public sealed record AnalysisTable(
    IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> Rows);

public sealed record AnalysisVisual(
    AnalysisVisualKind Kind,
    IReadOnlyList<string> Functions,
    IReadOnlyList<AnalysisPoint> ImportantPoints,
    decimal? Min,
    decimal? Max,
    IReadOnlyList<NumberLinePoint> Points,
    IReadOnlyList<string> Labels,
    IReadOnlyList<string> Relationships);

public sealed record AnalysisPoint(decimal X, decimal Y);
public sealed record NumberLinePoint(string Label, decimal Value);
public sealed record AnalysisWarning(AnalysisWarningType Type, string? SectionId, string Message);

public sealed record OllamaStatus(
    bool Connected,
    bool ModelInstalled,
    string Model,
    string Message,
    string? InstallCommand);

public sealed record AnalysisResponse(
    MathArchiveImageAnalysis Analysis,
    string Model,
    long ProcessingTimeMilliseconds,
    string? RawResponse);
