using System.Security.Claims;
using MathArchive.Application.Testing;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
namespace MathArchive.Api.Auth;

public static class StudentAuthentication
{
    public const string Scheme = "StudentSession";
    public static Guid StudentId(this ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static IServiceCollection AddStudentAuthentication(this IServiceCollection services, IConfiguration configuration, bool development)
    {
        var root = configuration["FileStorage:RootPath"] ?? "storage/documents";
        services.AddDataProtection().SetApplicationName("MathArchive")
            .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(root, ".session-keys")));
        services.AddAuthentication().AddCookie(Scheme, o => {
            o.Cookie.Name = development ? "matharchive.student" : "__Host-matharchive.student";
            o.Cookie.HttpOnly = true; o.Cookie.IsEssential = true; o.Cookie.Path = "/";
            o.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            o.Cookie.SameSite = development ? SameSiteMode.Lax : SameSiteMode.None;
            o.ExpireTimeSpan = TimeSpan.FromDays(7); o.SlidingExpiration = false;
            o.Events = new CookieAuthenticationEvents {
                OnRedirectToLogin = c => Results.Problem(statusCode: 401, detail: "Увійдіть для тестування.").ExecuteAsync(c.HttpContext),
                OnRedirectToAccessDenied = c => Results.Problem(statusCode: 403, detail: "Доступ заборонено.").ExecuteAsync(c.HttpContext),
                OnValidatePrincipal = async c => {
                    if (!Guid.TryParse(c.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) { c.RejectPrincipal(); return; }
                    var account = await c.HttpContext.RequestServices.GetRequiredService<IStudentAccounts>().FindAsync(id, c.HttpContext.RequestAborted);
                    if (account?.Profile.IsActive != true || c.Principal?.FindFirstValue("session-version") != account.SessionVersion.ToString()) {
                        c.RejectPrincipal(); await c.HttpContext.SignOutAsync(Scheme);
                    }
                }
            };
        });
        return services;
    }
    public static Task SignInStudentAsync(this HttpContext context, StudentIdentity identity) =>
        context.SignInAsync(Scheme, new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, identity.Profile.Id.ToString()),
            new Claim(ClaimTypes.Role, "Student"), new Claim("session-version", identity.SessionVersion.ToString())
        ], Scheme)), new AuthenticationProperties { IsPersistent = true, AllowRefresh = false });
}
