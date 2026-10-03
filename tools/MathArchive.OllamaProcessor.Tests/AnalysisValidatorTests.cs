using MathArchive.OllamaProcessor.Models;
using MathArchive.OllamaProcessor.Services;

namespace MathArchive.OllamaProcessor.Tests;

public sealed class AnalysisValidatorTests
{
    private readonly AnalysisValidator _validator = new();

    [Fact]
    public void Validate_AcceptsFormulaAndWarning()
    {
        var analysis = CreateAnalysis(
            new AnalysisSection("1", AnalysisSectionType.FormulaGroup, "Тотожність", null,
                [@"\sin^2 \alpha + \cos^2 \alpha = 1"], null, null),
            [new AnalysisWarning(AnalysisWarningType.FormulaUncertain, "1", "Перевірте індекс вручну.")]);

        _validator.Validate(analysis);

        Assert.Equal(@"\sin^2 \alpha + \cos^2 \alpha = 1", analysis.Sections[0].Formulas[0]);
    }

    [Fact]
    public void Validate_RejectsEmptyAnalysis()
    {
        var exception = Assert.Throws<AnalysisValidationException>(() => _validator.Validate(null));
        Assert.Contains("порожній", exception.Errors[0]);
    }

    [Fact]
    public void Validate_RejectsMalformedFormulaSection()
    {
        var analysis = CreateAnalysis(
            new AnalysisSection("1", AnalysisSectionType.FormulaGroup, "Формули", null, [], null, null));

        var exception = Assert.Throws<AnalysisValidationException>(() => _validator.Validate(analysis));

        Assert.Contains(exception.Errors, error => error.Contains("не містить формул"));
    }

    [Fact]
    public void Validate_RejectsTableRowsWithWrongWidth()
    {
        var table = new AnalysisTable(["x", "y"], [["1"]]);
        var analysis = CreateAnalysis(
            new AnalysisSection("1", AnalysisSectionType.Table, "Таблиця", null, [], table, null));

        var exception = Assert.Throws<AnalysisValidationException>(() => _validator.Validate(analysis));

        Assert.Contains(exception.Errors, error => error.Contains("кількість клітинок"));
    }

    [Fact]
    public void Validate_RejectsGraphWithoutFunction()
    {
        var visual = new AnalysisVisual(AnalysisVisualKind.FunctionGraph, [], [], null, null, [], [], []);
        var analysis = CreateAnalysis(
            new AnalysisSection("1", AnalysisSectionType.Graph, "Графік", null, [], null, visual));

        var exception = Assert.Throws<AnalysisValidationException>(() => _validator.Validate(analysis));

        Assert.Contains(exception.Errors, error => error.Contains("коректної функції"));
    }

    private static MathArchiveImageAnalysis CreateAnalysis(
        AnalysisSection section,
        IReadOnlyList<AnalysisWarning>? warnings = null) =>
        new("Тригонометрія", "uk", 10, "Тригонометрія", [section], warnings ?? []);
}
