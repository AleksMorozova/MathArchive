using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AttemptRecoveryAndInteractions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CurrentQuestionId",
                table: "test_attempts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "InteractionSequence",
                table: "test_attempts",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "InteractionsJson",
                table: "test_attempts",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<int>(
                name: "ProgressRevision",
                table: "test_attempts",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CurrentQuestionId",
                table: "test_attempts");

            migrationBuilder.DropColumn(
                name: "InteractionSequence",
                table: "test_attempts");

            migrationBuilder.DropColumn(
                name: "InteractionsJson",
                table: "test_attempts");

            migrationBuilder.DropColumn(
                name: "ProgressRevision",
                table: "test_attempts");
        }
    }
}
