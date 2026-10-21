using System.Text;
using FluentValidation;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Tests;

public sealed class TrainerHtmlTests
{
    [Theory]
    [InlineData("../test.html")]
    [InlineData("..\\test.html")]
    [InlineData("C:test.html")]
    [InlineData("%2e%2e%2ftest.html")]
    public async Task PathNames_AreRejected(string name)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("<html></html>"));
        await Assert.ThrowsAsync<ValidationException>(() => TrainerHtml.ValidateAsync(DocumentType.InteractiveTrainer, new(stream, name, "text/html", stream.Length), default));
    }

    [Theory]
    [InlineData("<script src='https://example.org/a.js'></script>")]
    [InlineData("<link rel='stylesheet' href='//example.org/a.css'>")]
    [InlineData("<img src='&#104;ttps://example.org/pixel'>")]
    [InlineData("<iframe srcdoc='hello'></iframe>")]
    [InlineData("<form action='https://example.org'></form>")]
    [InlineData("<meta http-equiv='refresh' content='0;url=https://example.org'>")]
    [InlineData("<a href='javascript:alert(1)'>Go</a>")]
    [InlineData("<style>body{background:url(https://example.org)}</style>")]
    [InlineData("<style>@import 'https://example.org/a.css';</style>")]
    [InlineData("<style>@im\\70ort 'https://example.org';</style>")]
    public async Task UnsupportedDependencies_AreRejected(string fragment)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("<html><body>" + fragment + "</body></html>"));
        await Assert.ThrowsAsync<ValidationException>(() => TrainerHtml.ValidateAsync(DocumentType.InteractiveTrainer, new(stream, "test.html", "text/html", stream.Length), default));
    }

    [Fact]
    public async Task ConfiguredLimit_AlsoBoundsActualStreamBytes()
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("<html><body>Oversize</body></html>"));
        await Assert.ThrowsAsync<ValidationException>(() => TrainerHtml.ValidateAsync(DocumentType.InteractiveTrainer, new(stream, "test.html", "text/html", 1), default, 16));
    }
    [Fact]
    public void TrainerGrades_RequireDistinctValidAssignments()
    {
        var validator = new DocumentMetadataValidator();
        foreach (var grades in new int[][] { [], [5, 5], [4], [12] })
            Assert.False(validator.Validate(new DocumentMetadata("Title", null, null, "Topic", DocumentType.InteractiveTrainer, grades)).IsValid);
        Assert.True(validator.Validate(new DocumentMetadata("Title", null, null, "Topic", DocumentType.InteractiveTrainer, [5, 11])).IsValid);
        Assert.True(validator.Validate(new DocumentMetadata("Title", null, null, "Topic", DocumentType.Formula)).IsValid);
    }

    [Fact]
    public async Task Validation_PreservesHtmlAndJavaScriptExactly()
    {
        const string html = "<!DOCTYPE html><html><body><script>let result = 2 + 3;</script></body></html>";
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(html));
        using var validated = await TrainerHtml.ValidateAsync(DocumentType.InteractiveTrainer, new UploadedFile(stream, "test.html", "text/html", stream.Length), default);
        Assert.Equal(html, Encoding.UTF8.GetString(validated!.ToArray()));
        Assert.Equal(0, validated.Position);
    }

    [Fact]
    public async Task OversizedAndInvalidUtf8Files_AreRejected()
    {
        using var stream = new MemoryStream([0xff, 0xfe, 0x00]);
        await Assert.ThrowsAsync<ValidationException>(() => TrainerHtml.ValidateAsync(DocumentType.InteractiveTrainer,
            new UploadedFile(stream, "test.html", "text/html", stream.Length), default));
        await Assert.ThrowsAsync<ValidationException>(() => TrainerHtml.ValidateAsync(DocumentType.InteractiveTrainer,
            new UploadedFile(stream, "test.html", "text/html", TrainerHtml.MaximumSize + 1), default));
    }
}
