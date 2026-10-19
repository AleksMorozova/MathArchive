using System.Net;
using System.Net.Http.Json;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Auth;
using MathArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class StudentGoogleIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private sealed class Verifier : IGoogleStudentVerifier
    {
        public Task<VerifiedGoogleStudent> VerifyAsync(string credential, string clientId, string nonce, CancellationToken ct)
        {
            Assert.Equal("test-client.apps.googleusercontent.com", clientId);
            var parts = credential.Split(':');
            if (parts.Length != 2 || parts[1] != nonce) throw new TestingException(401, "Invalid Google proof");
            return Task.FromResult(new VerifiedGoogleStudent(parts[0], "Олена", "Тестова"));
        }
    }
    private HttpClient Browser(WebApplicationFactory<Program> factory)
    {
        var c = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        c.DefaultRequestHeaders.Add("X-Student-Request", "1"); c.DefaultRequestHeaders.Add("Origin", "https://example.com");
        c.DefaultRequestHeaders.Add("X-Forwarded-For", "2001:db8:" + Random.Shared.Next(1, 60000).ToString("x") + "::1");
        return c;
    }
    private sealed record Challenge(string ClientId, string Nonce);
    private sealed record Result(bool RequiresProfile, StudentProfile? Student);
    private async Task<string> Proof(HttpClient c, string subject, bool link = false)
    {
        var r = await c.PostAsync("/api/students/google/" + (link ? "link/challenge" : "challenge"), null); r.EnsureSuccessStatusCode();
        var challenge = (await r.Content.ReadFromJsonAsync<Challenge>())!;
        return subject + ":" + challenge.Nonce;
    }
    private Task<HttpResponseMessage> Authenticate(HttpClient c, string credential) => c.PostAsJsonAsync("/api/students/google/authenticate", new { credential });
    private async Task<StudentProfile> GoogleRegister(HttpClient c, string subject, string firstName = "Олена")
    {
        var r = await Authenticate(c, await Proof(c, subject)); r.EnsureSuccessStatusCode();
        Assert.True((await r.Content.ReadFromJsonAsync<Result>())!.RequiresProfile);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/students/me")).StatusCode);
        var done = await c.PostAsJsonAsync("/api/students/google/complete", new GoogleStudentProfile(firstName, "Тестова", 5)); done.EnsureSuccessStatusCode();
        return (await done.Content.ReadFromJsonAsync<StudentProfile>())!;
    }
    [Fact] public async Task Google_registration_and_subsequent_login_reuse_profile_without_name_merging_or_email()
    {
        using var factory = fixture.CreateGoogleFactory(new Verifier()); using var google = Browser(factory); using var pin = Browser(factory);
        var p = await pin.PostAsJsonAsync("/api/students/register", new StudentRegistration("Олена", "Тестова", 5, "Matematyka29", "Matematyka29")); p.EnsureSuccessStatusCode();
        var pinStudent = (await p.Content.ReadFromJsonAsync<StudentProfile>())!;
        var student = await GoogleRegister(google, "google-one"); Assert.NotEqual(pinStudent.Id, student.Id); Assert.Equal(new[] { "Google" }, student.AuthenticationMethods);
        await google.PostAsync("/api/students/logout", null);
        var login = await Authenticate(google, await Proof(google, "google-one")); login.EnsureSuccessStatusCode();
        var result = (await login.Content.ReadFromJsonAsync<Result>())!; Assert.False(result.RequiresProfile); Assert.Equal(student.Id, result.Student!.Id);
        (await google.GetAsync("/api/documents")).EnsureSuccessStatusCode();
        await using var db = new MathArchiveDbContext(new DbContextOptionsBuilder<MathArchiveDbContext>().UseNpgsql(fixture.ConnectionString).Options);
        Assert.Null((await db.Set<Student>().SingleAsync(s => s.Id == student.Id)).PasswordHash);
        Assert.Equal(2, await db.Set<Student>().CountAsync());
    }
    [Fact] public async Task Linking_preserves_history_PIN_access_and_retakes_and_prevents_other_students_access()
    {
        using var factory = fixture.CreateGoogleFactory(new Verifier()); using var pin = Browser(factory); using var other = Browser(factory); using var admin = await fixture.CreateAuthorizedClientAsync();
        var registered = await pin.PostAsJsonAsync("/api/students/register", new StudentRegistration("Петро", "Тестова", 5, "Matematyka29", "Matematyka29")); registered.EnsureSuccessStatusCode();
        var original = (await registered.Content.ReadFromJsonAsync<StudentProfile>())!;
        var q = new TestQuestion(Guid.NewGuid(), "2+2?", QuestionType.SingleChoice, 1, null, [new(Guid.NewGuid(), "4", true), new(Guid.NewGuid(), "5", false)], []);
        var created = await admin.PostAsync("/api/admin/tests?publish=true", JsonContent.Create(new TestDefinition("Тест", null, 5, null, new(AllowRepeats: false), [q]), options: fixture.JsonOptions)); created.EnsureSuccessStatusCode();
        var test = (await created.Content.ReadFromJsonAsync<AdminTest>(fixture.JsonOptions))!;
        var started = await pin.PostAsync($"/api/tests/{test.Id}/attempts", null); started.EnsureSuccessStatusCode(); var attempt = (await started.Content.ReadFromJsonAsync<AttemptCredentials>(fixture.JsonOptions))!;
        (await pin.PostAsync($"/api/test-attempts/{attempt.Id}/submit", null)).EnsureSuccessStatusCode();
        var linked = await Authenticate(pin, await Proof(pin, "google-linked", true)); linked.EnsureSuccessStatusCode();
        var linkedProfile = (await linked.Content.ReadFromJsonAsync<Result>())!.Student!; Assert.Equal(original.Id, linkedProfile.Id); Assert.Equal(new[] { "Google", "PIN" }, linkedProfile.AuthenticationMethods);
        await pin.PostAsync("/api/students/logout", null);
        var loggedIn = await Authenticate(pin, await Proof(pin, "google-linked")); loggedIn.EnsureSuccessStatusCode();
        Assert.Equal(original.Id, (await loggedIn.Content.ReadFromJsonAsync<Result>())!.Student!.Id);
        var history = await pin.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions); Assert.Equal(attempt.Id, Assert.Single(history!).Id);
        Assert.Equal(HttpStatusCode.Conflict, (await pin.PostAsync($"/api/tests/{test.Id}/attempts", null)).StatusCode);
        await GoogleRegister(other, "google-other", "Інший");
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/test-attempts/{attempt.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Authenticate(other, await Proof(other, "google-linked", true))).StatusCode);
        await pin.PostAsync("/api/students/logout", null);
        (await pin.PostAsJsonAsync("/api/students/login", new StudentLogin("Петро", "Тестова", 5, "Matematyka29"))).EnsureSuccessStatusCode();
        var summary = await admin.GetFromJsonAsync<StudentSummary>($"/api/admin/students/{original.Id}", fixture.JsonOptions); Assert.Equal(2, summary!.Student.AuthenticationMethods!.Count);
    }
    [Fact] public async Task Google_proof_is_bound_to_browser_nonce_and_is_single_use_and_link_requires_session()
    {
        using var factory = fixture.CreateGoogleFactory(new Verifier()); using var browser = Browser(factory); using var other = Browser(factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsync("/api/students/google/link/challenge", null)).StatusCode);
        var credential = await Proof(browser, "proof");
        Assert.Equal(HttpStatusCode.Unauthorized, (await Authenticate(other, credential)).StatusCode);
        (await Authenticate(browser, credential)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Authenticate(browser, credential)).StatusCode);
        await Proof(browser, "proof"); Assert.Equal(HttpStatusCode.Unauthorized, (await Authenticate(browser, "proof:wrong-nonce")).StatusCode);
        browser.DefaultRequestHeaders.Remove("X-Student-Request");
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.PostAsync("/api/students/google/challenge", null)).StatusCode);
    }
    [Fact] public async Task Admin_assisted_PIN_recovery_for_Google_accounts_preserves_id_and_disabling_blocks_both_methods()
    {
        using var factory = fixture.CreateGoogleFactory(new Verifier()); using var browser = Browser(factory); using var admin = await fixture.CreateAuthorizedClientAsync();
        var student = await GoogleRegister(browser, "recover");
        (await admin.PutAsJsonAsync($"/api/admin/students/{student.Id}/pin", new { pin = "Recovery29" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/students/me")).StatusCode);
        (await browser.PostAsJsonAsync("/api/students/login", new StudentLogin("Олена", "Тестова", 5, "Recovery29"))).EnsureSuccessStatusCode();
        Assert.Equal(student.Id, (await browser.GetFromJsonAsync<StudentProfile>("/api/students/me"))!.Id);
        var proof = await Proof(browser, "link-after-reset", true);
        (await admin.PutAsJsonAsync($"/api/admin/students/{student.Id}/pin", new { pin = "Recovery30" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Authenticate(browser, proof)).StatusCode);
        (await admin.PutAsJsonAsync($"/api/admin/students/{student.Id}/active", new { isActive = false })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Authenticate(browser, await Proof(browser, "recover"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsJsonAsync("/api/students/login", new StudentLogin("Олена", "Тестова", 5, "Recovery30"))).StatusCode);
    }
    [Fact] public async Task Real_Google_verifier_rejects_malformed_and_unsigned_credentials()
    {
        var verifier = new GoogleStudentVerifier();
        foreach (var token in new[] { "", "forged", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0." })
            await Assert.ThrowsAsync<TestingException>(() => verifier.VerifyAsync(token, "client", "nonce", CancellationToken.None));
    }
}
