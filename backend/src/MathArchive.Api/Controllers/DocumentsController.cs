using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Domain.Documents;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[Route("api/documents")]
public sealed class DocumentsController(DocumentService documentService) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<DocumentDto>> GetDocuments(
        [FromQuery] string? search,
        [FromQuery] int? grade,
        [FromQuery] bool generalOnly,
        [FromQuery] string? topic,
        [FromQuery] DocumentType? documentType,
        [FromQuery] DateOnly? createdFrom,
        [FromQuery] DateOnly? createdTo,
        [FromQuery] DocumentSortOrder sort = DocumentSortOrder.Default,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        CancellationToken cancellationToken = default)
    {
        return documentService.SearchAsync(
            new DocumentQueryParameters(search, grade, generalOnly, topic, documentType, createdFrom, createdTo, sort, page, pageSize, User.IsInRole("Admin")),
            cancellationToken);
    }

    [HttpGet("topics")]
    public Task<IReadOnlyList<string>> GetTopics(CancellationToken cancellationToken)
    {
        return documentService.GetTopicsAsync(cancellationToken);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DocumentDto>> GetDocument(Guid id, CancellationToken cancellationToken)
    {
        var document = await documentService.GetByIdAsync(id, cancellationToken, User.IsInRole("Admin"));
        return document is null ? MaterialNotFound() : Ok(document);
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var download = await documentService.PrepareDownloadAsync(id, cancellationToken, User.IsInRole("Admin"));
        if (download?.ContentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true)
        {
            Response.Headers.ContentSecurityPolicy = "sandbox; default-src 'none'";
            Response.Headers.XContentTypeOptions = "nosniff";
        }
        return download is null
            ? MaterialNotFound()
            : File(download.Stream, download.ContentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) ? "application/octet-stream" : download.ContentType, download.FileName);
    }

    [HttpGet("{id:guid}/preview")]
    public async Task<IActionResult> Preview(Guid id, CancellationToken cancellationToken)
    {
        var document = await documentService.GetByIdAsync(id, cancellationToken);
        if (document?.DocumentType == DocumentType.InteractiveTrainer)
            return Problem(statusCode: 400, detail: "Відкрийте тренажер через ізольовану сторінку.");
        var preview = await documentService.PreparePreviewAsync(id, cancellationToken, User.IsInRole("Admin"));
        if (preview?.ContentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true)
        {
            await preview.Stream.DisposeAsync();
            return Problem(statusCode: 400, detail: "Відкрийте тренажер через ізольовану сторінку.");
        }
        return preview is null
            ? MaterialNotFound()
            : File(preview.Stream, preview.ContentType);
    }

    private ObjectResult MaterialNotFound()
    {
        return Problem(
            title: "Material not found",
            detail: "The requested material was not found.",
            statusCode: StatusCodes.Status404NotFound);
    }
}
