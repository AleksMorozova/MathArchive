using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAssistantRag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ai_daily_spend",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    CommittedUsd = table.Column<decimal>(type: "numeric(18,8)", precision: 18, scale: 8, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_daily_spend", x => x.Day);
                });

            migrationBuilder.CreateTable(
                name: "assistant_requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ActorHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Query = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                    Grade = table.Column<int>(type: "integer", nullable: true),
                    Topic = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Intent = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Answer = table.Column<string>(type: "text", nullable: false),
                    SourcesJson = table.Column<string>(type: "jsonb", nullable: false),
                    ExecutionsJson = table.Column<string>(type: "jsonb", nullable: false),
                    DurationMs = table.Column<long>(type: "bigint", nullable: false),
                    InputTokens = table.Column<int>(type: "integer", nullable: false),
                    OutputTokens = table.Column<int>(type: "integer", nullable: false),
                    CostUsd = table.Column<decimal>(type: "numeric(18,8)", precision: 18, scale: 8, nullable: false),
                    Retries = table.Column<int>(type: "integer", nullable: false),
                    RetrievedChunks = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assistant_requests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "assistant_settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    Json = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assistant_settings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "rag_chunks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MaterialId = table.Column<Guid>(type: "uuid", nullable: false),
                    Content = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    ChunkIndex = table.Column<int>(type: "integer", nullable: false),
                    Embedding = table.Column<float[]>(type: "real[]", nullable: false),
                    EmbeddingModel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rag_chunks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_rag_chunks_documents_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rag_index_states",
                columns: table => new
                {
                    MaterialId = table.Column<Guid>(type: "uuid", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ApprovedText = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IndexedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FullReindex = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rag_index_states", x => x.MaterialId);
                    table.ForeignKey(
                        name: "FK_rag_index_states_documents_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assistant_requests_CreatedAt",
                table: "assistant_requests",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_assistant_requests_Status_CreatedAt",
                table: "assistant_requests",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_rag_chunks_EmbeddingModel",
                table: "rag_chunks",
                column: "EmbeddingModel");

            migrationBuilder.CreateIndex(
                name: "IX_rag_chunks_MaterialId_ChunkIndex",
                table: "rag_chunks",
                columns: new[] { "MaterialId", "ChunkIndex" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_daily_spend");

            migrationBuilder.DropTable(
                name: "assistant_requests");

            migrationBuilder.DropTable(
                name: "assistant_settings");

            migrationBuilder.DropTable(
                name: "rag_chunks");

            migrationBuilder.DropTable(
                name: "rag_index_states");
        }
    }
}
