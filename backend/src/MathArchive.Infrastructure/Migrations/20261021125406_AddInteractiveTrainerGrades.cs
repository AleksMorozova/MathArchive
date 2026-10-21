using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInteractiveTrainerGrades : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int[]>(
                name: "trainer_grades",
                table: "documents",
                type: "integer[]",
                nullable: false,
                defaultValueSql: "ARRAY[]::integer[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "trainer_grades",
                table: "documents");
        }
    }
}
