using System.Text;
using System.Text.RegularExpressions;
using AngleSharp.Html.Parser;
using FluentValidation;
using FluentValidation.Results;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;

namespace MathArchive.Application.Documents;

public static class TrainerHtml
{
    public const int MaximumSize = 1024 * 1024;

    // This checks the standalone file contract, not JavaScript safety. Isolation is enforced on delivery.
    public static async Task<MemoryStream?> ValidateAsync(DocumentType type, UploadedFile file, CancellationToken ct, int maximumSize = MaximumSize)
    {
        var html = Path.GetExtension(file.FileName).Equals(".html", StringComparison.OrdinalIgnoreCase);
        if (html != (type == DocumentType.InteractiveTrainer))
            throw Invalid("HTML-файл дозволено лише для інтерактивного тренажера.");
        if (!html) return null;
        if (file.FileName.IndexOfAny(['/', '\\', ':', '%']) >= 0 || file.FileName.Contains(".."))
            throw Invalid("Назва HTML-файлу не повинна містити шлях.");
        if (file.Length <= 0 || file.Length > maximumSize) throw Invalid("HTML-файл перевищує дозволений розмір.");
        var buffer = new MemoryStream();
        try
        {
            var block = new byte[8192];
            int read;
            while ((read = await file.Stream.ReadAsync(block, ct)) != 0)
            {
                if (buffer.Length + read > maximumSize) throw Invalid("HTML-файл перевищує дозволений розмір.");
                await buffer.WriteAsync(block.AsMemory(0, read), ct);
            }
            string text;
            try { text = new UTF8Encoding(false, true).GetString(buffer.ToArray()); }
            catch (DecoderFallbackException) { throw Invalid("Збережіть HTML-файл у кодуванні UTF-8."); }
            if (text.Contains('\0') || !text.Contains("<html", StringComparison.OrdinalIgnoreCase) ||
                !text.Contains("</html>", StringComparison.OrdinalIgnoreCase))
                throw Invalid("Завантажте повний HTML-документ у кодуванні UTF-8.");
            Inspect(text);
            buffer.Position = 0;
            return buffer;
        }
        catch { buffer.Dispose(); throw; }
    }

    private static ValidationException Invalid(string message) => new([new ValidationFailure("File", message)]);

    private static void Inspect(string text)
    {
        // Parsing only: no browsing context, resource loader, or JavaScript engine is enabled.
        using var document = new HtmlParser().ParseDocument(text);
        foreach (var element in document.All)
        {
            var tag = element.LocalName.ToLowerInvariant();
            if (new[] { "iframe", "frame", "frameset", "object", "embed", "applet", "base", "link", "form", "template", "foreignobject", "use", "animate", "set", "audio", "video", "source", "track" }.Contains(tag) ||
                (tag == "meta" && element.HasAttribute("http-equiv")))
                throw Invalid("Тренажер містить непідтримувані елементи: " + tag + ".");
            foreach (var attribute in element.Attributes)
            {
                var name = attribute.LocalName.ToLowerInvariant();
                var value = attribute.Value.Trim();
                if (new[] { "srcdoc", "srcset", "action", "formaction", "ping", "download", "target", "manifest", "background", "poster" }.Contains(name))
                    throw Invalid("Тренажер містить непідтримуваний атрибут: " + name + ".");
                if (name is "src" or "href")
                {
                    var localAnchor = tag == "a" && name == "href" && value.StartsWith('#');
                    var embeddedImage = tag == "img" && name == "src" && Regex.IsMatch(value, @"^data:image/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$", RegexOptions.IgnoreCase);
                    if (!localAnchor && !embeddedImage) throw Invalid("Зовнішні ресурси та посилання у тренажері не підтримуються.");
                }
                if (name == "style") InspectCss(value);
            }
            if (tag == "script" && element.GetAttribute("type") is { } scriptType && scriptType != "text/javascript" && scriptType != "application/javascript")
                throw Invalid("Підтримуються лише звичайні вбудовані JavaScript-сценарії.");
            if (tag == "style") InspectCss(element.TextContent);
        }
    }

    private static void InspectCss(string css)
    {
        var normalized = Regex.Replace(css, @"/\*.*?\*/", "", RegexOptions.Singleline);
        if (normalized.Contains('\\') || Regex.IsMatch(normalized, @"@import|url\s*\(", RegexOptions.IgnoreCase))
            throw Invalid("CSS тренажера не повинен завантажувати зовнішні ресурси або містити escape-послідовності.");
    }
}
