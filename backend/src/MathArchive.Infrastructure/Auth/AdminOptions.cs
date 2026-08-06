namespace MathArchive.Infrastructure.Auth;

public sealed class AdminOptions
{
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
}
