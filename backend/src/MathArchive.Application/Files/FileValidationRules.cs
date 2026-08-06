namespace MathArchive.Application.Files;

public static class FileValidationRules
{
    public const long MaximumFileSize = 20 * 1024 * 1024;

    public static readonly IReadOnlyDictionary<string, string[]> AllowedContentTypesByExtension =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            [".pdf"] = ["application/pdf"],
            [".doc"] = ["application/msword"],
            [".docx"] = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
            [".xls"] = ["application/vnd.ms-excel"],
            [".xlsx"] = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
            [".png"] = ["image/png"],
            [".jpg"] = ["image/jpeg"],
            [".jpeg"] = ["image/jpeg"]
        };

    public static bool IsAllowedExtension(string fileName)
    {
        var extension = Path.GetExtension(fileName);
        return !string.IsNullOrWhiteSpace(extension) && AllowedContentTypesByExtension.ContainsKey(extension);
    }

    public static bool IsAllowedContentType(string fileName, string contentType)
    {
        var extension = Path.GetExtension(fileName);
        return !string.IsNullOrWhiteSpace(extension)
            && AllowedContentTypesByExtension.TryGetValue(extension, out var allowedContentTypes)
            && allowedContentTypes.Contains(contentType, StringComparer.OrdinalIgnoreCase);
    }
}
