using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAiUsageTelemetry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ai_usage_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    operation = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    input_tokens = table.Column<int>(type: "integer", nullable: true),
                    output_tokens = table.Column<int>(type: "integer", nullable: true),
                    total_tokens = table.Column<int>(type: "integer", nullable: true),
                    duration_ms = table.Column<long>(type: "bigint", nullable: false),
                    http_status_code = table.Column<int>(type: "integer", nullable: true),
                    request_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    error_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    estimated_cost_usd = table.Column<decimal>(type: "numeric(18,8)", precision: 18, scale: 8, nullable: true),
                    admin_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_usage_records", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_ai_usage_records_started_at",
                table: "ai_usage_records",
                column: "started_at");

            migrationBuilder.CreateIndex(
                name: "ix_ai_usage_records_status_started_at",
                table: "ai_usage_records",
                columns: new[] { "status", "started_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_usage_records");
        }
    }
}
