using MathArchive.OllamaProcessor.Models;

namespace MathArchive.OllamaProcessor.Services;

public sealed class AnalysisValidator
{
    public void Validate(MathArchiveImageAnalysis? analysis)
    {
        var errors = new List<string>();
        if (analysis is null)
        {
            throw new AnalysisValidationException(["Результат аналізу порожній."]);
        }

        if (string.IsNullOrWhiteSpace(analysis.Title))
        {
            errors.Add("Назва відсутня.");
        }

        if (string.IsNullOrWhiteSpace(analysis.SourceLanguage))
        {
            errors.Add("Мова джерела відсутня.");
        }

        if (string.IsNullOrWhiteSpace(analysis.SuggestedTopic))
        {
            errors.Add("Рекомендована тема відсутня.");
        }

        if (analysis.SuggestedGrade is not null and (< 5 or > 11))
        {
            errors.Add("Рекомендований клас має бути від 5 до 11.");
        }

        if (analysis.Sections is null || analysis.Sections.Count == 0)
        {
            errors.Add("Не знайдено жодного навчального розділу.");
        }
        else
        {
            ValidateSections(analysis.Sections, errors);
        }

        ValidateWarnings(analysis.Warnings, analysis.Sections ?? [], errors);

        if (errors.Count > 0)
        {
            throw new AnalysisValidationException(errors);
        }
    }

    private static void ValidateSections(IReadOnlyList<AnalysisSection> sections, List<string> errors)
    {
        var knownIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var section in sections)
        {
            if (string.IsNullOrWhiteSpace(section.Id))
            {
                errors.Add("Розділ має порожній ідентифікатор.");
            }
            else if (!knownIds.Add(section.Id.Trim()))
            {
                errors.Add($"Ідентифікатор розділу '{section.Id}' повторюється.");
            }

            if (string.IsNullOrWhiteSpace(section.Title))
            {
                errors.Add($"Розділ '{section.Id}' не має назви.");
            }

            var formulas = section.Formulas ?? [];
            if (formulas.Any(string.IsNullOrWhiteSpace))
            {
                errors.Add($"Розділ '{section.Id}' містить порожню формулу.");
            }

            if (section.Type == AnalysisSectionType.FormulaGroup && formulas.Count == 0)
            {
                errors.Add($"Група формул '{section.Id}' не містить формул.");
            }

            if (section.Type == AnalysisSectionType.Table)
            {
                ValidateTable(section, errors);
            }

            if (section.Type is AnalysisSectionType.Graph or AnalysisSectionType.NumberLine or AnalysisSectionType.Geometry)
            {
                ValidateVisual(section, errors);
            }
        }
    }

    private static void ValidateTable(AnalysisSection section, List<string> errors)
    {
        if (section.Table is null || section.Table.Headers.Count == 0)
        {
            errors.Add($"Таблиця '{section.Id}' не має заголовків.");
            return;
        }

        if (section.Table.Headers.Any(string.IsNullOrWhiteSpace))
        {
            errors.Add($"Таблиця '{section.Id}' має порожній заголовок.");
        }

        if (section.Table.Rows.Any(row => row.Count != section.Table.Headers.Count))
        {
            errors.Add($"Рядки таблиці '{section.Id}' мають неправильну кількість клітинок.");
        }
    }

    private static void ValidateVisual(AnalysisSection section, List<string> errors)
    {
        if (section.Visual is null)
        {
            errors.Add($"Візуальний розділ '{section.Id}' не має структурованих даних.");
            return;
        }

        if (section.Type == AnalysisSectionType.Graph &&
            (section.Visual.Kind != AnalysisVisualKind.FunctionGraph || section.Visual.Functions.Count == 0 ||
             section.Visual.Functions.Any(string.IsNullOrWhiteSpace)))
        {
            errors.Add($"Графік '{section.Id}' не містить коректної функції.");
        }

        if (section.Type == AnalysisSectionType.NumberLine &&
            (section.Visual.Kind != AnalysisVisualKind.NumberLine || section.Visual.Min is null ||
             section.Visual.Max is null || section.Visual.Min >= section.Visual.Max))
        {
            errors.Add($"Числова пряма '{section.Id}' має некоректні межі.");
        }

        if (section.Type == AnalysisSectionType.Geometry && section.Visual.Kind != AnalysisVisualKind.Geometry)
        {
            errors.Add($"Геометричний розділ '{section.Id}' має неправильний тип візуальних даних.");
        }
    }

    private static void ValidateWarnings(
        IReadOnlyList<AnalysisWarning>? warnings,
        IReadOnlyList<AnalysisSection> sections,
        List<string> errors)
    {
        if (warnings is null)
        {
            errors.Add("Список попереджень відсутній.");
            return;
        }

        var sectionIds = sections.Select(section => section.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var warning in warnings)
        {
            if (string.IsNullOrWhiteSpace(warning.Message))
            {
                errors.Add("Попередження не має повідомлення.");
            }

            if (!string.IsNullOrWhiteSpace(warning.SectionId) && !sectionIds.Contains(warning.SectionId))
            {
                errors.Add($"Попередження посилається на невідомий розділ '{warning.SectionId}'.");
            }
        }
    }
}
