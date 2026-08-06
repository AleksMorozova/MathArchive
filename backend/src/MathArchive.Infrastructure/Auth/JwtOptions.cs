namespace MathArchive.Infrastructure.Auth;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "MathArchive";
    public string Audience { get; set; } = "MathArchive";
    public string SigningKey { get; set; } = string.Empty;
    public int ExpiresMinutes { get; set; } = 120;
}
