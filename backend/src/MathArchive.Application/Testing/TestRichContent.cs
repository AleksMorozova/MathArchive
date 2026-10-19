using MathArchive.Domain.Testing;
namespace MathArchive.Application.Testing;

public static class TestRichContent
{
    public const int MaximumBlocks = 40;
    public static IEnumerable<Guid> ImageIds(TestDefinition d) => d.Questions.SelectMany(q =>
        (q.Content ?? []).Concat(q.Options.SelectMany(o => o.Content ?? [])))
        .Where(b => b.Kind == TestContentKind.Image && b.ImageId.HasValue).Select(b => b.ImageId!.Value).Distinct();
    public static bool Valid(List<TestContentBlock>? blocks)
    {
        if (blocks is null) return true; // Existing plain-text definitions and snapshots stay compatible.
        return blocks.Count is > 0 and <= MaximumBlocks && blocks.All(b => b is not null && Enum.IsDefined(b.Kind) && Enum.IsDefined(b.Alignment) &&
            b.Description?.Length is not > 500 && (b.Kind == TestContentKind.Image
                ? b.ImageId.HasValue && b.ImageId != Guid.Empty && string.IsNullOrEmpty(b.Text)
                : b.ImageId is null && !string.IsNullOrWhiteSpace(b.Text) && b.Text.Length <= (b.Kind == TestContentKind.Text ? 4000 : 1000)));
    }
    public static bool HasContent(string? text, List<TestContentBlock>? blocks) => blocks is { Count: > 0 } || !string.IsNullOrWhiteSpace(text);
    public static string PlainText(string text, List<TestContentBlock>? blocks, int maxLength)
    {
        if (blocks is null) return text;
        var summary = string.Join(" ", blocks.Select(b => b.Kind == TestContentKind.Image ? (string.IsNullOrWhiteSpace(b.Description) ? "Зображення" : b.Description) : b.Text));
        return summary[..Math.Min(maxLength, summary.Length)];
    }
}
