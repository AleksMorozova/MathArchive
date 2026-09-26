using System.Globalization;
using System.Text;

namespace MathArchive.Application.Documents;

internal static class DownloadFileName
{
    private const int MaximumTitleLength = 100;
    private static readonly HashSet<char> InvalidCharacters = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    public static string Create(string title, string originalFileName, DateTimeOffset timestamp)
    {
        var safeTitle = SanitizeTitle(title);
        var extension = SanitizeExtension(Path.GetExtension(originalFileName));
        return $"{safeTitle}_{timestamp.UtcDateTime.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture)}{extension}";
    }

    private static string SanitizeTitle(string title)
    {
        var builder = new StringBuilder(Math.Min(title.Length, MaximumTitleLength));
        var separatorPending = false;

        foreach (var character in title.Normalize(NormalizationForm.FormC))
        {
            if (char.IsWhiteSpace(character) || char.IsControl(character) || InvalidCharacters.Contains(character))
            {
                separatorPending = builder.Length > 0;
                continue;
            }

            if (separatorPending && builder[^1] != '-') builder.Append('-');
            separatorPending = false;
            builder.Append(character);
            if (builder.Length >= MaximumTitleLength) break;
        }

        var result = builder.ToString().Trim('-', '.', '_');
        return string.IsNullOrWhiteSpace(result) ? "material" : result;
    }

    private static string SanitizeExtension(string extension)
    {
        if (string.IsNullOrEmpty(extension) || extension.Length > 16 ||
            extension.Skip(1).Any(character => !char.IsLetterOrDigit(character)))
        {
            return string.Empty;
        }

        return extension;
    }
}
