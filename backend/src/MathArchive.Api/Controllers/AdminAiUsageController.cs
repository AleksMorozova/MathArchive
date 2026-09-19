using MathArchive.Application.Ai;
using MathArchive.Application.Common;
using MathArchive.Domain.AiUsage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/ai-usage")]
public sealed class AdminAiUsageController(AiUsageService service) : ControllerBase
{
    [HttpGet("summary")]
    public Task<AiUsageSummary> Summary(CancellationToken cancellationToken) => service.GetSummaryAsync(cancellationToken);

    [HttpPost("recalculate-costs")]
    public Task<AiCostRecalculationResult> RecalculateCosts(CancellationToken cancellationToken) =>
        service.RecalculateMissingCostsAsync(cancellationToken);

    [HttpGet("history")]
    public Task<PagedResult<AiUsageItem>> History([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] AiRequestStatus? status, [FromQuery] string? model, [FromQuery] string? operation,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default) =>
        service.GetHistoryAsync(new AiUsageQuery(from, to, status, model, operation, page, pageSize), cancellationToken);
}
