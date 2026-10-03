using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CacheRagExtraction : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ExtractedAt",
                table: "rag_index_states",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExtractedText",
                table: "rag_index_states",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExtractionError",
                table: "rag_index_states",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExtractionMethod",
                table: "rag_index_states",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ExtractionStatus",
                table: "rag_index_states",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SourceFingerprint",
                table: "rag_index_states",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExtractedAt",
                table: "rag_index_states");

            migrationBuilder.DropColumn(
                name: "ExtractedText",
                table: "rag_index_states");

            migrationBuilder.DropColumn(
                name: "ExtractionError",
                table: "rag_index_states");

            migrationBuilder.DropColumn(
                name: "ExtractionMethod",
                table: "rag_index_states");

            migrationBuilder.DropColumn(
                name: "ExtractionStatus",
                table: "rag_index_states");

            migrationBuilder.DropColumn(
                name: "SourceFingerprint",
                table: "rag_index_states");
        }
    }
}
