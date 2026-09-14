using MathArchive.Application.StorageAudit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/storage")]
public sealed class AdminStorageController(StorageAuditService storageAuditService) : ControllerBase
{
    [HttpGet("audit")]
    public async Task<ActionResult<StorageAuditReport>> Audit(CancellationToken cancellationToken)
    {
        return Ok(await storageAuditService.AuditAsync(cancellationToken));
    }

    [HttpPost("cleanup-orphans")]
    public async Task<ActionResult<StorageCleanupResult>> CleanupOrphans(
        [FromBody] CleanupOrphansRequest request,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(request.Confirmation, "DELETE ORPHANS", StringComparison.Ordinal))
        {
            ModelState.AddModelError(nameof(request.Confirmation), "Type DELETE ORPHANS to confirm cleanup.");
            return ValidationProblem(ModelState);
        }

        return Ok(await storageAuditService.DeleteOrphansAsync(cancellationToken));
    }
}

public sealed record CleanupOrphansRequest(string Confirmation);
