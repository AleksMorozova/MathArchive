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
        [FromQuery] string? topic,
        [FromQuery] DocumentType? documentType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        CancellationToken cancellationToken = default)
    {
        return documentService.SearchAsync(
            new DocumentQueryParameters(search, grade, topic, documentType, page, pageSize),
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
        return document is null ? NotFound() : Ok(document);
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var download = await documentService.PrepareDownloadAsync(id, cancellationToken);
        return download is null
            ? NotFound()
            : File(download.Stream, download.ContentType, download.FileName);
    }
}
