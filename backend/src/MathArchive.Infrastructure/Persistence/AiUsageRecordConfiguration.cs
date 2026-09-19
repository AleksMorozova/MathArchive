using MathArchive.Domain.AiUsage;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MathArchive.Infrastructure.Persistence;

public sealed class AiUsageRecordConfiguration : IEntityTypeConfiguration<AiUsageRecord>
{
    public void Configure(EntityTypeBuilder<AiUsageRecord> builder)
    {
        builder.ToTable("ai_usage_records");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.StartedAt).HasColumnName("started_at");
        builder.Property(x => x.Operation).HasColumnName("operation").HasMaxLength(64);
        builder.Property(x => x.Model).HasColumnName("model").HasMaxLength(100);
        builder.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.InputTokens).HasColumnName("input_tokens");
        builder.Property(x => x.OutputTokens).HasColumnName("output_tokens");
        builder.Property(x => x.TotalTokens).HasColumnName("total_tokens");
        builder.Property(x => x.DurationMilliseconds).HasColumnName("duration_ms");
        builder.Property(x => x.HttpStatusCode).HasColumnName("http_status_code");
        builder.Property(x => x.RequestId).HasColumnName("request_id").HasMaxLength(100);
        builder.Property(x => x.ErrorType).HasColumnName("error_type").HasMaxLength(100);
        builder.Property(x => x.EstimatedCostUsd).HasColumnName("estimated_cost_usd").HasPrecision(18, 8);
        builder.Property(x => x.AdminId).HasColumnName("admin_id").HasMaxLength(200);
        builder.HasIndex(x => x.StartedAt).HasDatabaseName("ix_ai_usage_records_started_at");
        builder.HasIndex(x => new { x.Status, x.StartedAt }).HasDatabaseName("ix_ai_usage_records_status_started_at");
    }
}
