using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations;

public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "documents",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                grade = table.Column<int>(type: "integer", nullable: false),
                topic = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                document_type = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                original_file_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                stored_file_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                content_type = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                file_size = table.Column<long>(type: "bigint", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                download_count = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_documents", x => x.id);
            });

        migrationBuilder.CreateIndex(name: "ix_documents_created_at", table: "documents", column: "created_at");
        migrationBuilder.CreateIndex(name: "ix_documents_document_type", table: "documents", column: "document_type");
        migrationBuilder.CreateIndex(name: "ix_documents_grade", table: "documents", column: "grade");
        migrationBuilder.CreateIndex(name: "ix_documents_title", table: "documents", column: "title");
        migrationBuilder.CreateIndex(name: "ix_documents_topic", table: "documents", column: "topic");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "documents");
    }
}
