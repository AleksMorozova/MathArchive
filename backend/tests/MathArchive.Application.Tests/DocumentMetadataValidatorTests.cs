using MathArchive.Application.Documents;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Tests;

public sealed class DocumentMetadataValidatorTests
{
    private readonly DocumentMetadataValidator validator = new();

    [Fact]
    public void Valid_metadata_passes()
    {
        var result = validator.Validate(new DocumentMetadata("Формули", null, 7, "Алгебра", DocumentType.Formula));

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Rejects_invalid_grade()
    {
        var result = validator.Validate(new DocumentMetadata("Формули", null, 12, "Алгебра", DocumentType.Formula));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, x => x.PropertyName == nameof(DocumentMetadata.Grade));
    }

    [Fact]
    public void Rejects_long_title()
    {
        var result = validator.Validate(new DocumentMetadata(new string('A', 201), null, 7, "Алгебра", DocumentType.Formula));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, x => x.PropertyName == nameof(DocumentMetadata.Title));
    }
}
