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
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        CancellationToken cancellationToken = default)
    {
        return documentService.SearchAsync(
            new DocumentQueryParameters(search, grade, generalOnly, topic, documentType, page, pageSize),
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
        var document = await documentService.GetByIdAsync(id, cancellationToken);
        return document is null ? MaterialNotFound() : Ok(document);
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var download = await documentService.PrepareDownloadAsync(id, cancellationToken);
        return download is null
            ? MaterialNotFound()
            : File(download.Stream, download.ContentType, download.FileName);
    }

    [HttpGet("{id:guid}/preview")]
    public async Task<IActionResult> Preview(Guid id, CancellationToken cancellationToken)
    {
        var preview = await documentService.PreparePreviewAsync(id, cancellationToken);
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
