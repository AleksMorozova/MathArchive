using FluentValidation;

namespace MathArchive.Application.Files;

public sealed class UploadedFileValidator : AbstractValidator<UploadedFile>
{
    public UploadedFileValidator()
    {
        RuleFor(x => x.Length).GreaterThan(0).LessThanOrEqualTo(FileValidationRules.MaximumFileSize);
        RuleFor(x => x.FileName).NotEmpty().Must(FileValidationRules.IsAllowedExtension).WithMessage("File extension is not supported.");
        RuleFor(x => x).Must(x => FileValidationRules.IsAllowedContentType(x.FileName, x.ContentType)).WithMessage("File content type is not supported.");
    }
}
