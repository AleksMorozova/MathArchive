using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StudentAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AttemptNumber",
                table: "test_attempts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "StudentId",
                table: "test_attempts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                table: "student_tests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql("UPDATE student_tests SET \"DeletedAt\" = \"UpdatedAt\" WHERE \"IsDeleted\" AND \"DeletedAt\" IS NULL");

            migrationBuilder.CreateTable(
                name: "students",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedFirstName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NormalizedLastName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Grade = table.Column<int>(type: "integer", nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    SessionVersion = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastLoginAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    FailedLogins = table.Column<int>(type: "integer", nullable: false),
                    LockedUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_students", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_test_attempts_StudentId_TestId",
                table: "test_attempts",
                columns: new[] { "StudentId", "TestId" },
                unique: true,
                filter: "\"StudentId\" IS NOT NULL AND \"Status\" = 'InProgress'");

            migrationBuilder.CreateIndex(
                name: "IX_test_attempts_StudentId_TestId_AttemptNumber",
                table: "test_attempts",
                columns: new[] { "StudentId", "TestId", "AttemptNumber" },
                unique: true,
                filter: "\"StudentId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_students_Grade",
                table: "students",
                column: "Grade");

            migrationBuilder.CreateIndex(
                name: "IX_students_NormalizedFirstName_NormalizedLastName_Grade",
                table: "students",
                columns: new[] { "NormalizedFirstName", "NormalizedLastName", "Grade" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_test_attempts_students_StudentId",
                table: "test_attempts",
                column: "StudentId",
                principalTable: "students",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_test_attempts_students_StudentId",
                table: "test_attempts");

            migrationBuilder.DropTable(
                name: "students");

            migrationBuilder.DropIndex(
                name: "IX_test_attempts_StudentId_TestId",
                table: "test_attempts");

            migrationBuilder.DropIndex(
                name: "IX_test_attempts_StudentId_TestId_AttemptNumber",
                table: "test_attempts");

            migrationBuilder.DropColumn(
                name: "AttemptNumber",
                table: "test_attempts");

            migrationBuilder.DropColumn(
                name: "StudentId",
                table: "test_attempts");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "student_tests");
        }
    }
}

