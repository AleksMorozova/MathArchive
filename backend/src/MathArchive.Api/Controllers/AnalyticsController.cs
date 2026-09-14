using MathArchive.Application.Analytics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/analytics/events")]
public sealed class AnalyticsController(AnalyticsService service) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(1024)]
    public async Task<IActionResult> Record(RecordAnalyticsEvent request, CancellationToken cancellationToken)
    {
        if (User.IsInRole("Admin"))
        {
            return NoContent();
        }

        await service.RecordAsync(request, cancellationToken);
        return NoContent();
    }
}
