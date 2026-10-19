using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;
using MathArchive.Application.Testing;
namespace MathArchive.Api.Auth;

// Only short-lived Google handshakes live here. Student accounts/history stay in PostgreSQL.
// MathArchive's deliberate single-instance model makes a bounded local cache sufficient.
public sealed class GoogleStudentFlowStore : IDisposable
{
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 10000 });
    private readonly object gate = new();
    public sealed record Flow(string Nonce, Guid? StudentId = null, Guid? SessionVersion = null, VerifiedGoogleStudent? Google = null);
    public string Add(Flow flow)
    {
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        cache.Set(id, flow, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10), Size = 1 });
        return id;
    }
    public Flow? Read(string? id, bool consume)
    {
        if (id is null || id.Length != 64) return null;
        lock (gate) {
            var flow = cache.Get<Flow>(id);
            if (consume) cache.Remove(id);
            return flow;
        }
    }
    public void Remove(string? id) { if (id is not null) cache.Remove(id); }
    public void Dispose() => cache.Dispose();
}
