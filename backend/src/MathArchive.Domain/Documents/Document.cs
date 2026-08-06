namespace MathArchive.Domain.Documents;

public sealed class Document
{
    private Document()
    {
    }

    public Document(
        string title,
        string? description,
        int grade,
        string topic,
        DocumentType documentType,
        string originalFileName,
        string storedFileName,
        string contentType,
        long fileSize,
        DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        Title = title.Trim();
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        Grade = grade;
        Topic = topic.Trim();
        DocumentType = documentType;
        OriginalFileName = originalFileName;
        StoredFileName = storedFileName;
        ContentType = contentType;
        FileSize = fileSize;
        CreatedAt = createdAt;
        UpdatedAt = createdAt;
    }

    public Guid Id { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public int Grade { get; private set; }
    public string Topic { get; private set; } = string.Empty;
    public DocumentType DocumentType { get; private set; }
    public string OriginalFileName { get; private set; } = string.Empty;
    public string StoredFileName { get; private set; } = string.Empty;
    public string ContentType { get; private set; } = string.Empty;
    public long FileSize { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public int DownloadCount { get; private set; }

    public void UpdateMetadata(string title, string? description, int grade, string topic, DocumentType documentType, DateTimeOffset updatedAt)
    {
        Title = title.Trim();
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        Grade = grade;
        Topic = topic.Trim();
        DocumentType = documentType;
        UpdatedAt = updatedAt;
    }

    public void ReplaceFile(string originalFileName, string storedFileName, string contentType, long fileSize, DateTimeOffset updatedAt)
    {
        OriginalFileName = originalFileName;
        StoredFileName = storedFileName;
        ContentType = contentType;
        FileSize = fileSize;
        UpdatedAt = updatedAt;
    }

    public void IncrementDownloadCount()
    {
        DownloadCount++;
    }
}
