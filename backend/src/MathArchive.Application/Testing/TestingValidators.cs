using FluentValidation;
using MathArchive.Domain.Testing;
namespace MathArchive.Application.Testing;

public sealed class TestDefinitionValidator : AbstractValidator<TestDefinition>
{
    public TestDefinitionValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Введіть назву тесту.").MaximumLength(200).WithMessage("Введіть назву до 200 символів.");
        RuleFor(x => x.Description).MaximumLength(2000).WithMessage("Опис: до 2000 символів.");
        RuleFor(x => x.Grade).InclusiveBetween(5, 11).WithMessage("Оберіть клас від 5 до 11.");
        RuleFor(x => x.Settings).NotNull().WithMessage("Вкажіть налаштування тесту.");
        RuleFor(x => x.Questions).NotNull().WithMessage("Вкажіть список питань.").Must(x => x is { Count: <= 100 }).WithMessage("Дозволено до 100 питань.");
        RuleFor(x => x).Custom((d, c) =>
        {
            void Error(string message) => c.AddFailure("definition", message);
            if (d.Settings is { } s)
            {
                if (!Enum.IsDefined(s.AnswerVisibility) || s.TimeLimitMinutes is < 1 or > 480 || s.PassingPercentage is < 0 or > 100)
                    Error("Перевірте налаштування тесту.");
                if (s.AvailableFrom >= s.AvailableTo) Error("Кінець доступності має бути пізніше початку.");
            }
            if (d.Questions is null) return;
            if (d.Questions.Any(q => q is null)) { Error("Некоректне питання."); return; }
            if (d.Questions.Select(q => q.Id).Distinct().Count() != d.Questions.Count) Error("Ідентифікатори питань мають бути різними.");
            foreach (var q in d.Questions)
            {
                if (q.Id == Guid.Empty || !TestRichContent.HasContent(q.Text, q.Content) || q.Text?.Length > 4000 || !TestRichContent.Valid(q.Content) || q.Explanation?.Length > 4000 ||
                    !Enum.IsDefined(q.Type) || q.Points is <= 0 or > 1000 || decimal.Round(q.Points, 2) != q.Points)
                    Error("Перевірте текст, тип і бали питання (0,01–1000).");
                if (q.Options is null || q.AcceptedAnswers is null) { Error("Некоректні відповіді."); continue; }
                if (q.Options.Any(o => o is null)) { Error("Некоректний варіант відповіді."); continue; }
                if (q.Options.Count > 20 || q.Options.Any(o => o is null || o.Id == Guid.Empty || !TestRichContent.HasContent(o.Text, o.Content) || o.Text?.Length > 1000 || !TestRichContent.Valid(o.Content)) ||
                    q.Options.Select(o => o?.Id).Distinct().Count() != q.Options.Count) Error("Дозволено до 20 різних варіантів, до 1000 символів кожен.");
                if (q.AcceptedAnswers.Count > 20 || q.AcceptedAnswers.Any(a => string.IsNullOrWhiteSpace(a) || a.Length > 1000)) Error("Дозволено до 20 текстових відповідей, до 1000 символів кожна.");
                if (q.Type == QuestionType.Text)
                {
                    if (q.AcceptedAnswers.Count == 0 || q.Options.Count != 0) Error("Для текстового питання вкажіть прийнятні відповіді без варіантів вибору.");
                }
                else if (q.Options.Count < 2 || q.AcceptedAnswers.Count != 0 ||
                    (q.Type == QuestionType.SingleChoice ? q.Options.Count(o => o.IsCorrect) != 1 : q.Options.Count(o => o.IsCorrect) < 2))
                    Error("Потрібні щонайменше два варіанти та правильні відповіді відповідно до типу питання.");
            }
        });
    }
}
public sealed class StartAttemptValidator : AbstractValidator<StartAttempt>
{
    public StartAttemptValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Введіть ім’я.").MaximumLength(100).WithMessage("Введіть ім’я до 100 символів.");
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Введіть прізвище.").MaximumLength(100).WithMessage("Введіть прізвище до 100 символів.");
        RuleFor(x => x.Grade).InclusiveBetween(5, 11).WithMessage("Оберіть клас від 5 до 11.");
        RuleFor(x => x.ParticipantToken).Must(x => Guid.TryParse(x, out var id) && id != Guid.Empty).WithMessage("Невірний ідентифікатор браузера.");
    }
}
