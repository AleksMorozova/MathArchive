using MathArchive.Application.Files;

namespace MathArchive.Application.Tests;

public sealed class UploadedFileValidatorTests
{
    private readonly UploadedFileValidator validator = new();

    [Fact]
    public void Valid_pdf_passes()
    {
        using var stream = new MemoryStream([1, 2, 3]);

        var result = validator.Validate(new UploadedFile(stream, "material.pdf", "application/pdf", stream.Length));

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Rejects_unsupported_extension()
    {
        using var stream = new MemoryStream([1]);

        var result = validator.Validate(new UploadedFile(stream, "material.exe", "application/octet-stream", stream.Length));

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Rejects_oversized_file()
    {
        using var stream = new MemoryStream([1]);

        var result = validator.Validate(new UploadedFile(stream, "material.pdf", "application/pdf", FileValidationRules.MaximumFileSize + 1));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, x => x.PropertyName == nameof(UploadedFile.Length));
    }
}
