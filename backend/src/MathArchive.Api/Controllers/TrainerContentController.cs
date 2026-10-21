using MathArchive.Application.Documents;
using MathArchive.Domain.Documents;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
public sealed class TrainerContentController(DocumentService documents, IConfiguration configuration, TrainerResponsePolicy responsePolicy) : ControllerBase
{
    [HttpGet("api/documents/trainer-limits")]
    public IActionResult Limits([FromServices] Microsoft.Extensions.Options.IOptions<TrainerOptions> options) => Ok(new { maximumFileSize = options.Value.MaximumFileSize });

    [HttpGet("api/documents/{id:guid}/trainer")]
    public async Task<IActionResult> Launch(Guid id, CancellationToken ct)
    {
        var document = await documents.GetByIdAsync(id, ct);
        if (document?.DocumentType != DocumentType.InteractiveTrainer) return NotFound();
        var origin = configuration["Trainers:ContentOrigin"]?.TrimEnd('/');
        if (string.IsNullOrWhiteSpace(origin) || new Uri(origin).Host.Equals(Request.Host.Host, StringComparison.OrdinalIgnoreCase))
            return Problem(statusCode: 503, title: "TrainerHostingNotConfigured",
                detail: "Тренажер тимчасово недоступний. Адміністратор має завершити налаштування окремої адреси для тренажерів.");
        return Ok(new { url = $"{origin}/api/trainer-content/{id}" });
    }

    [HttpGet("api/trainer-content/{id:guid}")]
    public async Task<IActionResult> Content(Guid id, [FromServices] Microsoft.Extensions.Options.IOptions<TrainerOptions> options, CancellationToken ct)
    {
        var origin = configuration["Trainers:ContentOrigin"];
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
            !uri.Authority.Equals(Request.Host.Value, StringComparison.OrdinalIgnoreCase) || uri.Scheme != Request.Scheme)
            return NotFound();
        var document = await documents.GetByIdAsync(id, ct);
        if (document?.DocumentType != DocumentType.InteractiveTrainer) return NotFound();
        var file = await documents.PreparePreviewAsync(id, ct);
        if (file is null) return NotFound();
        await using var original = file.Stream;
        // Recheck older uploads too; changing validation must not leave a legacy bypass.
        var validated = await TrainerHtml.ValidateAsync(DocumentType.InteractiveTrainer,
            new(file.Stream, file.FileName, file.ContentType, document.FileSize), ct, options.Value.MaximumFileSize);
        responsePolicy.Apply(Response);
        return File(validated!, "text/html; charset=utf-8");
    }
}
