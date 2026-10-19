using MathArchive.Api.Auth;
using MathArchive.Application.Files;
using MathArchive.Application.Testing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace MathArchive.Api.Controllers;

[ApiController, Authorize(Policy = "AdminOnly"), Route("api/admin/test-images")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminTestImagesController(TestImageService service) : ControllerBase
{
    [HttpPost, RequestSizeLimit(TestImageService.MaximumBytes + 65536)]
    public async Task<TestImageDto> Upload(IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await service.UploadAsync(new UploadedFile(stream, file.FileName, file.ContentType, file.Length), ct);
    }
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var image = await service.OpenAsync(id, null, null, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(image.Stream, image.ContentType);
    }
}
[ApiController, Authorize(Policy = "StudentOnly"), Route("api/test-attempts/{attemptId:guid}/images")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AttemptTestImagesController(TestImageService service) : ControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid attemptId, Guid id, CancellationToken ct)
    {
        var image = await service.OpenAsync(id, attemptId, null, ct, User.StudentId());
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(image.Stream, image.ContentType);
    }
}

