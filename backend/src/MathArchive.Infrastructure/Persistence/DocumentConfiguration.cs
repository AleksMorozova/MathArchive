using MathArchive.Domain.Documents;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MathArchive.Infrastructure.Persistence;

public sealed class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> builder)
    {
        builder.ToTable("documents");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.Title).HasColumnName("title").HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasColumnName("description").HasMaxLength(2000);
        builder.Property(x => x.Grade).HasColumnName("grade");
        builder.Property(x => x.Topic).HasColumnName("topic").HasMaxLength(150).IsRequired();
        builder.Property(x => x.DocumentType).HasColumnName("document_type").HasConversion<string>().HasMaxLength(60).IsRequired();
        builder.Property(x => x.OriginalFileName).HasColumnName("original_file_name").HasMaxLength(260).IsRequired();
        builder.Property(x => x.StoredFileName).HasColumnName("stored_file_name").HasMaxLength(260).IsRequired();
        builder.Property(x => x.ContentType).HasColumnName("content_type").HasMaxLength(160).IsRequired();
        builder.Property(x => x.FileSize).HasColumnName("file_size").IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        builder.Property(x => x.DownloadCount).HasColumnName("download_count").IsRequired();

        builder.HasIndex(x => x.Grade).HasDatabaseName("ix_documents_grade");
        builder.HasIndex(x => x.DocumentType).HasDatabaseName("ix_documents_document_type");
        builder.HasIndex(x => x.CreatedAt).HasDatabaseName("ix_documents_created_at");
        builder.HasIndex(x => x.Title).HasDatabaseName("ix_documents_title");
        builder.HasIndex(x => x.Topic).HasDatabaseName("ix_documents_topic");
    }
}
