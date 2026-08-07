using MathArchive.Api.Contracts.Documents;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Domain.Documents;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/documents")]
public sealed class AdminDocumentsController(DocumentService documentService) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(FileValidationRules.MaximumFileSize + 1024 * 1024)]
    public async Task<ActionResult<DocumentDto>> Create([FromForm] DocumentFormRequest request, CancellationToken cancellationToken)
    {
        if (request.File is null)
        {
            ModelState.AddModelError("file", "File is required.");
            return ValidationProblem(ModelState);
        }

        var document = await documentService.CreateAsync(
            new CreateDocumentCommand(ToMetadata(request), ToUploadedFile(request.File)),
            cancellationToken);

        return CreatedAtAction(nameof(DocumentsController.GetDocument), "Documents", new { id = document.Id }, document);
    }

    [HttpPut("{id:guid}")]
    [RequestSizeLimit(FileValidationRules.MaximumFileSize + 1024 * 1024)]
    public async Task<ActionResult<DocumentDto>> Update(Guid id, [FromForm] DocumentFormRequest request, CancellationToken cancellationToken)
    {
        var document = await documentService.UpdateAsync(
            id,
            new UpdateDocumentCommand(ToMetadata(request), request.File is null ? null : ToUploadedFile(request.File)),
            cancellationToken);

        return document is null ? MaterialNotFound() : Ok(document);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await documentService.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : MaterialNotFound();
    }

    private static DocumentMetadata ToMetadata(DocumentFormRequest request)
    {
        return new DocumentMetadata(request.Title, request.Description, request.Grade, request.Topic, request.DocumentType);
    }

    private static UploadedFile ToUploadedFile(IFormFile file)
    {
        return new UploadedFile(file.OpenReadStream(), file.FileName, file.ContentType, file.Length);
    }

    private ObjectResult MaterialNotFound()
    {
        return Problem(
            title: "Material not found",
            detail: "The requested material was not found.",
            statusCode: StatusCodes.Status404NotFound);
    }
}
