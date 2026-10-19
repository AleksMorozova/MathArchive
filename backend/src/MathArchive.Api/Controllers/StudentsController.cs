using MathArchive.Api.Auth;
using MathArchive.Application.Testing;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace MathArchive.Api.Controllers;

[ApiController, Route("api/students"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class StudentsController(IStudentAccounts accounts, StudentTestingService testing, TestingService attempts) : ControllerBase
{
    [HttpPost("register"), AllowAnonymous, EnableRateLimiting("StudentLogin"), RequestSizeLimit(4096)]
    public async Task<StudentProfile> Register(StudentRegistration input, CancellationToken ct)
    { var result = await accounts.RegisterAsync(input, ct); await HttpContext.SignInStudentAsync(result); return result.Profile; }
    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("StudentLogin"), RequestSizeLimit(4096)]
    public async Task<StudentProfile> Login(StudentLogin input, CancellationToken ct)
    { var result = await accounts.LoginAsync(input, ct); await HttpContext.SignInStudentAsync(result); return result.Profile; }
    [HttpPost("logout"), Authorize(Policy = "StudentOnly")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await accounts.RevokeSessionsAsync(User.StudentId(), ct);
        await HttpContext.SignOutAsync(StudentAuthentication.Scheme); return NoContent();
    }
    [HttpGet("me"), Authorize(Policy = "StudentOnly")]
    public async Task<StudentProfile> Me(CancellationToken ct) => (await accounts.FindAsync(User.StudentId(), ct))!.Profile;
    [HttpGet("me/attempts"), Authorize(Policy = "StudentOnly")]
    public Task<List<StudentHistoryRow>> History(CancellationToken ct) => testing.HistoryAsync(User.StudentId(), ct);
    [HttpGet("me/attempts/{id:guid}"), Authorize(Policy = "StudentOnly")]
    public Task<AttemptView> Attempt(Guid id, CancellationToken ct) => attempts.AttemptAsync(id, null, null, false, ct, User.StudentId());
    [HttpGet("me/tests/{id:guid}/access"), Authorize(Policy = "StudentOnly")]
    public Task<StudentTestAccess> Access(Guid id, CancellationToken ct) => testing.AccessAsync(id, User.StudentId(), ct);
}
[ApiController, Route("api/admin/students"), Authorize(Policy = "AdminOnly"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminStudentsController(IStudentAccounts accounts, StudentTestingService testing, TestingService attempts) : ControllerBase
{
    public sealed record PinReset(string Pin);
    public sealed record ActiveInput(bool IsActive);
    [HttpGet] public Task<MathArchive.Application.Common.PagedResult<StudentProfile>> List([FromQuery] StudentFilter filter, CancellationToken ct) => accounts.ListAsync(filter, ct);
    [HttpGet("{id:guid}")] public Task<StudentSummary> Get(Guid id, CancellationToken ct) => testing.SummaryAsync(id, ct);
    [HttpGet("{id:guid}/attempts")] public Task<MathArchive.Application.Common.PagedResult<AttemptRow>> Attempts(Guid id, [FromQuery] AttemptFilter filter, CancellationToken ct) => attempts.AttemptsAsync(filter with { StudentId = id }, ct);
    [HttpPut("{id:guid}/pin"), RequestSizeLimit(1024)] public async Task<IActionResult> Reset(Guid id, PinReset input, CancellationToken ct) { await accounts.ResetPinAsync(id, input.Pin, ct); return NoContent(); }
    [HttpPut("{id:guid}/active")] public async Task<IActionResult> Active(Guid id, ActiveInput input, CancellationToken ct) { await accounts.SetActiveAsync(id, input.IsActive, ct); return NoContent(); }
}
