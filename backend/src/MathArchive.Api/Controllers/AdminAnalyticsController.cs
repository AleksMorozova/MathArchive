using MathArchive.Application.Analytics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/analytics")]
public sealed class AdminAnalyticsController(AnalyticsService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AnalyticsReport>> Get([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, CancellationToken cancellationToken) =>
        Ok(await service.GetReportAsync(from, to, cancellationToken));
}
