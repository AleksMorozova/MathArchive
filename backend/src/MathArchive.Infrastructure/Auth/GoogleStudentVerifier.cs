using System.Security.Cryptography;
using System.Text;
using Google.Apis.Auth;
using MathArchive.Application.Testing;
namespace MathArchive.Infrastructure.Auth;

public sealed class GoogleStudentVerifier : IGoogleStudentVerifier
{
    public async Task<VerifiedGoogleStudent> VerifyAsync(string credential, string clientId, string nonce, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(credential) || credential.Length > 16000) throw Invalid();
        try
        {
            var payload = await GoogleJsonWebSignature.ValidateAsync(credential,
                new GoogleJsonWebSignature.ValidationSettings { Audience = [clientId] }).WaitAsync(ct);
            if (string.IsNullOrEmpty(payload.Subject) || string.IsNullOrEmpty(payload.Nonce) ||
                !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(payload.Nonce), Encoding.UTF8.GetBytes(nonce))) throw Invalid();
            return new(payload.Subject, payload.GivenName, payload.FamilyName);
        }
        catch (InvalidJwtException) { throw Invalid(); }
        catch (HttpRequestException) { throw new TestingException(503, "Google тимчасово недоступний. Спробуйте ще раз або увійдіть з PIN-кодом."); }
    }
    private static TestingException Invalid() => new(401, "Не вдалося підтвердити вхід через Google. Спробуйте ще раз.");
}
