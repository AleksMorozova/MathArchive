using System.Security.Claims;
using System.Security.Cryptography;
using MathArchive.Api.Auth;
using MathArchive.Application.Testing;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace MathArchive.Api.Controllers;

[ApiController, Route("api/students/google"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class StudentGoogleController(IStudentAccounts accounts, IGoogleStudentVerifier verifier,
    GoogleStudentFlowStore flows, IConfiguration configuration, IWebHostEnvironment environment) : ControllerBase
{
    public sealed record CredentialInput(string Credential);
    public sealed record GoogleResult(bool RequiresProfile, StudentProfile? Student);
    private string CookieName => environment.IsDevelopment() ? "matharchive.google-flow" : "__Host-matharchive.google-flow";
    private CookieOptions CookieOptions => new() { HttpOnly = true, IsEssential = true, Path = "/", Secure = !environment.IsDevelopment() || Request.IsHttps,
        SameSite = environment.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.None, MaxAge = TimeSpan.FromMinutes(10) };
    private string ClientId => configuration["StudentGoogle:ClientId"] is { Length: > 0 } id ? id :
        throw new TestingException(503, "Вхід через Google ще не налаштовано. Скористайтеся PIN-кодом.");
    [HttpGet("configuration"), AllowAnonymous]
    public object Configuration() => new { enabled = !string.IsNullOrWhiteSpace(configuration["StudentGoogle:ClientId"]) };
    [HttpPost("challenge"), AllowAnonymous, EnableRateLimiting("StudentLogin")]
    public object StartChallenge() => CreateChallenge(null, null);
    [HttpPost("link/challenge"), Authorize(Policy = "StudentOnly"), EnableRateLimiting("StudentLogin")]
    public object LinkChallenge() => CreateChallenge(User.StudentId(), Guid.Parse(User.FindFirstValue("session-version")!));
    private object CreateChallenge(Guid? studentId, Guid? version)
    {
        var clientId = ClientId;
        flows.Remove(Request.Cookies[CookieName]);
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        Response.Cookies.Append(CookieName, flows.Add(new(nonce, studentId, version)), CookieOptions);
        return new { clientId, nonce };
    }
    [HttpPost("authenticate"), AllowAnonymous, EnableRateLimiting("StudentLogin"), RequestSizeLimit(18000)]
    public async Task<GoogleResult> Authenticate(CredentialInput input, CancellationToken ct)
    {
        var flow = flows.Read(Request.Cookies[CookieName], true);
        Response.Cookies.Delete(CookieName, CookieOptions);
        if (flow is null || flow.Google is not null) throw Expired();
        // A link challenge is bound to the student session that requested it, including its version.
        if (flow.StudentId.HasValue) {
            var current = await HttpContext.AuthenticateAsync(StudentAuthentication.Scheme);
            if (!current.Succeeded || current.Principal!.StudentId() != flow.StudentId ||
                current.Principal.FindFirstValue("session-version") != flow.SessionVersion.ToString()) throw Expired();
        }
        var google = await verifier.VerifyAsync(input.Credential, ClientId, flow.Nonce, ct);
        StudentIdentity? identity;
        if (flow.StudentId.HasValue) identity = await accounts.LinkGoogleAsync(flow.StudentId.Value, flow.SessionVersion!.Value, google.Subject, ct);
        else identity = await accounts.GoogleLoginAsync(google.Subject, ct);
        if (identity is not null) {
            await HttpContext.SignInStudentAsync(identity);
            return new(false, identity.Profile);
        }
        Response.Cookies.Append(CookieName, flows.Add(new("", Google: google)), CookieOptions);
        return new(true, null);
    }
    [HttpGet("pending"), AllowAnonymous]
    public object Pending()
    {
        var google = flows.Read(Request.Cookies[CookieName], false)?.Google ?? throw Expired();
        return new { firstName = google.FirstName ?? "", lastName = google.LastName ?? "" };
    }
    [HttpPost("complete"), AllowAnonymous, EnableRateLimiting("StudentLogin"), RequestSizeLimit(2048)]
    public async Task<StudentProfile> Complete(GoogleStudentProfile input, CancellationToken ct)
    {
        var key = Request.Cookies[CookieName]; var google = flows.Read(key, false)?.Google ?? throw Expired();
        var identity = await accounts.RegisterGoogleAsync(google, input, ct);
        flows.Remove(key); Response.Cookies.Delete(CookieName, CookieOptions);
        await HttpContext.SignInStudentAsync(identity); return identity.Profile;
    }
    private static TestingException Expired() => new(401, "Підтвердження Google завершилося. Натисніть «Продовжити з Google» ще раз.");
}
