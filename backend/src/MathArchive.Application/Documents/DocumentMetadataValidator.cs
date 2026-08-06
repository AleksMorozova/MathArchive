using FluentValidation;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public sealed class DocumentMetadataValidator : AbstractValidator<DocumentMetadata>
{
    public DocumentMetadataValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Grade).InclusiveBetween(1, 11);
        RuleFor(x => x.Topic).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DocumentType).Must(Enum.IsDefined).WithMessage("Document type must be valid.");
    }
}
