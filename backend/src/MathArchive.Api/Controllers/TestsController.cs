using MathArchive.Api.Auth;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace MathArchive.Api.Controllers;

[ApiController, Route("api/tests")]
public sealed class TestsController(TestingService service, StudentTestingService students) : ControllerBase
{
    [HttpGet, AllowAnonymous] public Task<List<PublicTestSummary>> List([FromQuery] int? grade, CancellationToken ct) => service.ListPublicAsync(grade, ct);
    [HttpGet("{id:guid}"), AllowAnonymous] public Task<PublicTestInfo> Get(Guid id, CancellationToken ct) => service.GetPublicAsync(id, ct);
    [HttpPost("{id:guid}/attempts"), Authorize(Policy = "StudentOnly"), EnableRateLimiting("TestStart"), RequestSizeLimit(2048)]
    public Task<AttemptCredentials> Start(Guid id, CancellationToken ct) => students.StartAsync(id, User.StudentId(), ct);
}
[ApiController, Authorize(Policy = "StudentOnly"), Route("api/test-attempts"), EnableRateLimiting("TestAttempt")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class TestAttemptsController(TestingService service) : ControllerBase
{

    [HttpGet("{id:guid}")] public Task<AttemptView> Get(Guid id, CancellationToken ct) => service.AttemptAsync(id, null, null, false, ct, User.StudentId());
    [HttpPut("{id:guid}/answers"), RequestSizeLimit(8192)] public Task<AttemptView> Save(Guid id, AnswerInput request, CancellationToken ct) => service.AttemptAsync(id, null, request, false, ct, User.StudentId());
    [HttpPut("{id:guid}/progress"), RequestSizeLimit(1024)] public Task<AttemptView> Progress(Guid id, ProgressInput request, CancellationToken ct) => service.ProgressAsync(id, User.StudentId(), request, ct);
    [HttpPost("{id:guid}/submit")] public Task<AttemptView> Submit(Guid id, CancellationToken ct) => service.AttemptAsync(id, null, null, true, ct, User.StudentId());
}
[ApiController, Authorize(Policy = "AdminOnly"), Route("api/admin/tests")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminTestsController(TestingService service, StudentTestingService students) : ControllerBase
{
    [HttpGet] public Task<List<TestSummary>> List([FromQuery] int? grade, CancellationToken ct) => service.ListAsync(true, grade, ct);
    [HttpGet("{id:guid}")] public Task<AdminTest> Get(Guid id, CancellationToken ct) => service.GetAdminAsync(id, ct);
    [HttpPost, RequestSizeLimit(1048576)] public Task<AdminTest> Create(TestDefinition request, CancellationToken ct, [FromQuery] bool publish = false) => service.SaveAsync(null, request, ct, publish);
    [HttpPut("{id:guid}"), RequestSizeLimit(1048576)] public Task<AdminTest> Update(Guid id, TestDefinition request, CancellationToken ct, [FromQuery] bool publish = false) => service.SaveAsync(id, request, ct, publish);
    [HttpDelete("{id:guid}")] public async Task<IActionResult> Delete(Guid id, CancellationToken ct) { await service.DeleteAsync(id, ct); return NoContent(); }
    [HttpPost("{id:guid}/publish")] public async Task<IActionResult> Publish(Guid id, [FromQuery] TestStatus status, CancellationToken ct) { await service.SetStatusAsync(id, status, ct); return NoContent(); }
    [HttpPost("{id:guid}/duplicate")] public Task<AdminTest> Duplicate(Guid id, CancellationToken ct) => service.DuplicateAsync(id, ct);
    [HttpGet("statistics")] public Task<TestingOverview> Statistics([FromQuery] AttemptFilter filter, CancellationToken ct) => service.OverviewAsync(filter, ct);
    [HttpGet("student-statistics")] public Task<StudentTestingStatistics> StudentStatistics([FromQuery] AttemptFilter filter, CancellationToken ct) => students.StatisticsAsync(filter, ct);
    [HttpGet("attempts")] public Task<MathArchive.Application.Common.PagedResult<AttemptRow>> Attempts([FromQuery] AttemptFilter filter, CancellationToken ct) => service.AttemptsAsync(filter, ct);
    [HttpGet("attempts/{id:guid}")] public Task<object> Attempt(Guid id, CancellationToken ct) => service.AdminAttemptAsync(id, ct);
    [HttpDelete("attempts/{id:guid}/interactions")] public async Task<IActionResult> ClearInteractions(Guid id, CancellationToken ct) { await service.ClearInteractionsAsync(id, ct); return NoContent(); }
    [HttpGet("{id:guid}/question-statistics")] public Task<List<QuestionStatistics>> Questions(Guid id, [FromQuery] AttemptFilter filter, CancellationToken ct) => service.QuestionsAsync(id, filter, ct);
}

