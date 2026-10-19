using System.Text;
using MathArchive.Application.Files;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Testing;
using SkiaSharp;
namespace MathArchive.Application.Tests;

public sealed class TestImageProcessorTests
{
    public static byte[] Picture(SKEncodedImageFormat format, int width = 8, int height = 6)
    {
        using var bitmap = new SKBitmap(width, height); bitmap.Erase(SKColors.Navy);
        using var image = SKImage.FromBitmap(bitmap); using var data = image.Encode(format, 100);
        return data.ToArray();
    }
    [Theory] [InlineData(".png", "image/png", SKEncodedImageFormat.Png)] [InlineData(".jpg", "image/jpeg", SKEncodedImageFormat.Jpeg)] [InlineData(".webp", "image/webp", SKEncodedImageFormat.Webp)]
    public async Task Decodes_and_reencodes_supported_formats(string extension, string mime, SKEncodedImageFormat format)
    {
        var original = Picture(format).Concat(Encoding.UTF8.GetBytes("UNTRUSTED_APPENDED_PAYLOAD")).ToArray();
        using var stream = new MemoryStream(original); var result = await new TestImageProcessor().ProcessAsync(stream, "../../diagram" + extension, mime, default);
        Assert.Equal(mime, result.ContentType); Assert.Equal(8, result.Width); Assert.Equal(6, result.Height);
        Assert.DoesNotContain("UNTRUSTED_APPENDED_PAYLOAD", Encoding.UTF8.GetString(result.Bytes));
        using var decoded = SKBitmap.Decode(result.Bytes); Assert.Equal(8, decoded.Width);
    }
    [Theory] [InlineData("diagram.svg", "image/svg+xml")] [InlineData("diagram.png", "image/jpeg")] [InlineData("diagram.webp", "image/webp")]
    public async Task Rejects_unsupported_mismatched_or_spoofed_images(string name, string mime)
    { using var stream = new MemoryStream(Encoding.UTF8.GetBytes("<svg onload='alert(1)'></svg>")); await Assert.ThrowsAsync<TestingException>(() => new TestImageProcessor().ProcessAsync(stream, name, mime, default)); }
    [Fact] public async Task Rejects_truncated_png_and_excessive_dimensions()
    {
        var png = Picture(SKEncodedImageFormat.Png);
        using var truncated = new MemoryStream(png[..35]); await Assert.ThrowsAsync<TestingException>(() => new TestImageProcessor().ProcessAsync(truncated, "x.png", "image/png", default));
        using var wide = new MemoryStream(Picture(SKEncodedImageFormat.Png, 6001, 1)); await Assert.ThrowsAsync<TestingException>(() => new TestImageProcessor().ProcessAsync(wide, "x.png", "image/png", default));
    }
    [Theory] [InlineData("-3")] [InlineData("0,5")] [InlineData("1/2")] [InlineData("√2")] [InlineData("x=5")]
    public void Mathematical_text_answers_remain_explicit_and_deterministic(string answer)
    {
        var q = new TestQuestion(Guid.NewGuid(), "Розв’яжіть", QuestionType.Text, 1, null, [], [answer], [new(TestContentKind.BlockMath, "x^2=2")]);
        Assert.True(TestingService.IsCorrect(q, new(q.Id, [], " " + answer.ToUpperInvariant() + " ")));
        Assert.False(TestingService.IsCorrect(q with { AcceptedAnswers = ["інше"] }, new(q.Id, [], answer)));
    }
    [Fact] public void Rich_validation_bounds_blocks_and_preserves_legacy_snapshots()
    {
        var q = new TestQuestion(Guid.NewGuid(), "Питання", QuestionType.Text, 1, null, [], ["4"]);
        var d = new TestDefinition("Тест", null, 5, null, new(), [q]); var validator = new TestDefinitionValidator();
        Assert.True(validator.Validate(d).IsValid);
        Assert.False(validator.Validate(d with { Questions = [q with { Content = [new(TestContentKind.Image, ImageId: Guid.Empty)] }] }).IsValid);
        Assert.False(validator.Validate(d with { Questions = [q with { Content = Enumerable.Repeat(new TestContentBlock(TestContentKind.Text, "текст"), 41).ToList() }] }).IsValid);
        var legacy = TestingService.Serialize(d).Replace(",\"Content\":null", "");
        Assert.Null(TestingService.Definition(legacy).Questions[0].Content);
    }
}
