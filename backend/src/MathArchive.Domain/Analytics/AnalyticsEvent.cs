namespace MathArchive.Domain.Analytics;

public enum AnalyticsEventType
{
    SiteVisit = 1,
    DocumentPreview = 2,
    DocumentDownload = 3
}

public sealed class AnalyticsEvent
{
    private AnalyticsEvent() { }

    public AnalyticsEvent(Guid sessionId, AnalyticsEventType eventType, Guid? documentId, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        SessionId = sessionId;
        EventType = eventType;
        DocumentId = documentId;
        CreatedAt = createdAt.ToUniversalTime();
    }

    public Guid Id { get; private set; }
    public Guid SessionId { get; private set; }
    public AnalyticsEventType EventType { get; private set; }
    public Guid? DocumentId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}
