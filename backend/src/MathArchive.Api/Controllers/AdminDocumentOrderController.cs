using MathArchive.Api.Contracts.Documents;
using MathArchive.Application.Documents;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/classes/{grade:int}/documents/order")]
public sealed class AdminDocumentOrderController(DocumentService documentService) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<DocumentDto>> Get(int grade, CancellationToken cancellationToken)
    {
        return documentService.GetOrderForGradeAsync(grade, cancellationToken);
    }

    [HttpPut]
    public Task<IReadOnlyList<DocumentDto>> Update(
        int grade,
        UpdateDocumentOrderRequest request,
        CancellationToken cancellationToken)
    {
        return documentService.ReorderForGradeAsync(grade, request.DocumentIds, cancellationToken);
    }
}
