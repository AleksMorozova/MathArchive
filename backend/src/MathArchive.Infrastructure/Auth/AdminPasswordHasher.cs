using System.Security.Cryptography;

namespace MathArchive.Infrastructure.Auth;

public sealed class AdminPasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int Iterations = 100_000;

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"PBKDF2-SHA256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    public bool Verify(string password, string passwordHash)
    {
        var parts = passwordHash.Split('$');
        if (parts is not ["PBKDF2-SHA256", var iterationsText, var saltText, var keyText])
        {
            return false;
        }

        if (!int.TryParse(iterationsText, out var iterations))
        {
            return false;
        }

        var salt = Convert.FromBase64String(saltText);
        var expectedKey = Convert.FromBase64String(keyText);
        var actualKey = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expectedKey.Length);

        return CryptographicOperations.FixedTimeEquals(actualKey, expectedKey);
    }
}
