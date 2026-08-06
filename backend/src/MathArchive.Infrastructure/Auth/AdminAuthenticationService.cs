using Microsoft.Extensions.Options;

namespace MathArchive.Infrastructure.Auth;

public sealed class AdminAuthenticationService(
    IOptions<AdminOptions> options,
    AdminPasswordHasher passwordHasher,
    JwtTokenService jwtTokenService)
{
    public string? Login(string username, string password)
    {
        var adminOptions = options.Value;
        if (!string.Equals(username, adminOptions.Username, StringComparison.Ordinal))
        {
            return null;
        }

        return passwordHasher.Verify(password, adminOptions.PasswordHash)
            ? jwtTokenService.CreateAdminToken(username)
            : null;
    }
}
