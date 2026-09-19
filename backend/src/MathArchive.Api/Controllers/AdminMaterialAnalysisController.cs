using System.Security.Claims;
using MathArchive.Api.Contracts.Ai;
using MathArchive.Application.Ai;
using MathArchive.Application.Files;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace MathArchive.Api.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/admin/materials")]
public sealed class AdminMaterialAnalysisController(IMaterialAnalysisService analysisService) : ControllerBase
{
    [HttpPost("analyze")]
    [EnableRateLimiting("AiAnalysis")]
    [RequestSizeLimit(FileValidationRules.MaximumFileSize + 1024 * 1024)]
    public async Task<ActionResult<MaterialAnalysisResult>> Analyze(
        [FromForm] MaterialAnalysisRequest request,
        CancellationToken cancellationToken)
    {
        if (request.File is null)
        {
            ModelState.AddModelError("file", "File is required.");
            return ValidationProblem(ModelState);
        }

        await using var stream = request.File.OpenReadStream();
        var result = await analysisService.AnalyzeAsync(
            new UploadedFile(stream, request.File.FileName, request.File.ContentType, request.File.Length),
            User.FindFirstValue(ClaimTypes.Name), cancellationToken);
        return Ok(result);
    }
}
