using System.Security.Claims;
using MathArchive.Application.Ai;
using MathArchive.Application.Files;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace MathArchive.Api.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/image-poster")]
public sealed class AdminImagePosterController(IImagePosterService imagePosterService) : ControllerBase
{
    [HttpPost("transform")]
    [EnableRateLimiting("AiAnalysis")]
    [RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<IActionResult> Transform(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null)
        {
            ModelState.AddModelError("file", "Image is required.");
            return ValidationProblem(ModelState);
        }

        await using var stream = file.OpenReadStream();
        var poster = await imagePosterService.TransformAsync(
            new UploadedFile(stream, file.FileName, file.ContentType, file.Length),
            User.FindFirstValue(ClaimTypes.Name), cancellationToken);
        return File(poster.Content, poster.ContentType, poster.FileName);
    }
}
