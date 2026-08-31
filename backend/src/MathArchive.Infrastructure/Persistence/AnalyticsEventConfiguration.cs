using MathArchive.Domain.Analytics;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MathArchive.Infrastructure.Persistence;

public sealed class AnalyticsEventConfiguration : IEntityTypeConfiguration<AnalyticsEvent>
{
    public void Configure(EntityTypeBuilder<AnalyticsEvent> builder)
    {
        builder.ToTable("analytics_events");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.SessionId).HasColumnName("session_id");
        builder.Property(x => x.EventType).HasColumnName("event_type").HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.DocumentId).HasColumnName("document_id");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.HasIndex(x => new { x.CreatedAt, x.EventType }).HasDatabaseName("ix_analytics_events_created_at_event_type");
        builder.HasIndex(x => x.DocumentId).HasDatabaseName("ix_analytics_events_document_id");
        // No FK: deleting a material must not delete historical totals or block document deletion.
        // SessionId is not queried; an index would only add storage/write overhead.
    }
}
