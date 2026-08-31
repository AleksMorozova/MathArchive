using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MathArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameDocumentViewToDocumentDownload : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE analytics_events SET event_type = 'DocumentDownload' WHERE event_type = 'DocumentView';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE analytics_events SET event_type = 'DocumentView' WHERE event_type = 'DocumentDownload';");
        }
    }
}
