using MathArchive.Infrastructure.Auth;

namespace MathArchive.Api.Tools;

public static class PasswordHashTool
{
    public static string HashPassword(string password)
    {
        return new AdminPasswordHasher().Hash(password);
    }
}
