using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudentGoogleAuthentication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_students_NormalizedFirstName_NormalizedLastName_Grade",
                table: "students");

            migrationBuilder.AlterColumn<string>(
                name: "PasswordHash",
                table: "students",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(500)",
                oldMaxLength: 500);

            migrationBuilder.CreateTable(
                name: "student_authentication_identities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Subject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_student_authentication_identities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_student_authentication_identities_students_StudentId",
                        column: x => x.StudentId,
                        principalTable: "students",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_students_NormalizedFirstName_NormalizedLastName_Grade",
                table: "students",
                columns: new[] { "NormalizedFirstName", "NormalizedLastName", "Grade" },
                unique: true,
                filter: "\"PasswordHash\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_student_authentication_identities_Provider_Subject",
                table: "student_authentication_identities",
                columns: new[] { "Provider", "Subject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_student_authentication_identities_StudentId_Provider",
                table: "student_authentication_identities",
                columns: new[] { "StudentId", "Provider" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "student_authentication_identities");

            migrationBuilder.DropIndex(
                name: "IX_students_NormalizedFirstName_NormalizedLastName_Grade",
                table: "students");

            migrationBuilder.AlterColumn<string>(
                name: "PasswordHash",
                table: "students",
                type: "character varying(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(500)",
                oldMaxLength: 500,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_students_NormalizedFirstName_NormalizedLastName_Grade",
                table: "students",
                columns: new[] { "NormalizedFirstName", "NormalizedLastName", "Grade" },
                unique: true);
        }
    }
}
