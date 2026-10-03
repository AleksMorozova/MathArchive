using MathArchive.Domain.Assistant;
using MathArchive.Domain.Documents;
using Microsoft.EntityFrameworkCore;

namespace MathArchive.Infrastructure.Assistant;

public static class AssistantModel
{
    public static void Configure(ModelBuilder b)
    {
        var chunk = b.Entity<RagChunk>();
        chunk.ToTable("rag_chunks"); chunk.HasKey(x => x.Id);
        chunk.Property(x => x.Content).HasMaxLength(4000);
        chunk.Property(x => x.EmbeddingModel).HasMaxLength(100);
        chunk.Property(x => x.ContentHash).HasMaxLength(64);
        chunk.HasOne<Document>().WithMany().HasForeignKey(x => x.MaterialId).OnDelete(DeleteBehavior.Cascade);
        chunk.HasIndex(x => new { x.MaterialId, x.ChunkIndex }).IsUnique();
        chunk.HasIndex(x => x.EmbeddingModel);
        var state = b.Entity<RagIndexState>();
        state.ToTable("rag_index_states"); state.HasKey(x => x.MaterialId);
        state.HasOne<Document>().WithMany().HasForeignKey(x => x.MaterialId).OnDelete(DeleteBehavior.Cascade);
        state.Property(x => x.Fingerprint).HasMaxLength(64); state.Property(x => x.Status).HasMaxLength(64);
        state.Property(x => x.SourceFingerprint).HasMaxLength(64);
        state.Property(x => x.ExtractionMethod).HasMaxLength(32);
        state.Property(x => x.ExtractionStatus).HasMaxLength(32);
        state.Property(x => x.ExtractionError).HasMaxLength(128);
        var request = b.Entity<AssistantRequest>();
        request.ToTable("assistant_requests"); request.HasKey(x => x.Id);
        request.Property(x => x.ActorHash).HasMaxLength(64);
        request.Property(x => x.Query).HasMaxLength(8000);
        request.Property(x => x.Intent).HasMaxLength(32); request.Property(x => x.Status).HasMaxLength(64);
        request.Property(x => x.Topic).HasMaxLength(150);
        request.Property(x => x.SourcesJson).HasColumnType("jsonb");
        request.Property(x => x.ExecutionsJson).HasColumnType("jsonb");
        request.Property(x => x.CostUsd).HasPrecision(18, 8);
        request.HasIndex(x => x.CreatedAt); request.HasIndex(x => new { x.Status, x.CreatedAt });
        var setting = b.Entity<AssistantSetting>(); setting.ToTable("assistant_settings"); setting.HasKey(x => x.Id);
        setting.Property(x => x.Id).ValueGeneratedNever(); setting.Property(x => x.Json).HasColumnType("jsonb");
        var spend = b.Entity<AiDailySpend>(); spend.ToTable("ai_daily_spend"); spend.HasKey(x => x.Day);
        spend.Property(x => x.CommittedUsd).HasPrecision(18, 8);
    }
}
