using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentDisplayOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "display_order",
                table: "documents",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "ix_documents_grade_display_order",
                table: "documents",
                columns: new[] { "grade", "display_order" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_documents_grade_display_order",
                table: "documents");

            migrationBuilder.DropColumn(
                name: "display_order",
                table: "documents");
        }
    }
}
