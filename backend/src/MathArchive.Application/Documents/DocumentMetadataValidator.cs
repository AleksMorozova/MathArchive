using FluentValidation;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed class DocumentMetadataValidator : AbstractValidator<DocumentMetadata>
{
    public DocumentMetadataValidator()
    {
        RuleFor(x => x.TrainerGrades).Must(x => x is { Length: > 0 and <= 7 } && x.All(g => g is >= 5 and <= 11) && x.Distinct().Count() == x.Length)
            .When(x => x.DocumentType == DocumentType.InteractiveTrainer)
            .WithMessage("Оберіть один або кілька класів від 5 до 11.");
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Grade).InclusiveBetween(5, 11).When(x => x.Grade.HasValue);
        RuleFor(x => x.Topic).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DocumentType).Must(Enum.IsDefined).WithMessage("Document type must be valid.");
    }
}
