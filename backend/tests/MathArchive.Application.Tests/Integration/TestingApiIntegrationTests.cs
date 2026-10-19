using System.Net;
using System.Net.Http.Json;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Auth;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class TestingApiIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private MathArchiveDbContext Context() => new(new DbContextOptionsBuilder<MathArchiveDbContext>().UseNpgsql(fixture.ConnectionString).Options);
    private Task<HttpResponseMessage> Post(HttpClient c, string path, object value) => c.PostAsync(path, JsonContent.Create(value, options: fixture.JsonOptions));
    private async Task<(AdminTest Test, TestQuestion Q)> Create(HttpClient admin, TestSettings? settings = null, bool publish = true)
    {
        var q = new TestQuestion(Guid.NewGuid(), "2 + 2?", QuestionType.SingleChoice, 3, "Пояснення", [new(Guid.NewGuid(), "4", true), new(Guid.NewGuid(), "5", false)], []);
        var response = await Post(admin, "/api/admin/tests?publish=" + publish.ToString().ToLowerInvariant(), new TestDefinition("Алгебра", null, 5, null, settings ?? new(), [q]));
        response.EnsureSuccessStatusCode(); return ((await response.Content.ReadFromJsonAsync<AdminTest>(fixture.JsonOptions))!, q);
    }
    private async Task<AttemptCredentials> Start(HttpClient student, Guid id)
    {
        var response = await student.PostAsync($"/api/tests/{id}/attempts", null);
        response.EnsureSuccessStatusCode(); return (await response.Content.ReadFromJsonAsync<AttemptCredentials>(fixture.JsonOptions))!;
    }
    private async Task<AttemptView> Submit(HttpClient student, Guid id)
    {
        var response = await student.PostAsync($"/api/test-attempts/{id}/submit", null);
        response.EnsureSuccessStatusCode(); return (await response.Content.ReadFromJsonAsync<AttemptView>(fixture.JsonOptions))!;
    }
    [Fact] public async Task Public_materials_and_catalog_remain_public_but_attempts_require_student_login()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var anon = fixture.CreateClient();
        var (test, _) = await Create(admin);
        (await anon.GetAsync("/api/documents")).EnsureSuccessStatusCode();
        var json = await anon.GetStringAsync($"/api/tests/{test.Id}");
        Assert.DoesNotContain("questions", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("acceptedAnswers", json);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsync($"/api/tests/{test.Id}/attempts", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync($"/api/test-attempts/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/students/me/attempts")).StatusCode);
        var (draft, _) = await Create(admin, publish: false);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/tests/{draft.Id}")).StatusCode);
    }
    [Fact] public async Task Registration_hashes_pin_sets_secure_cookie_and_duplicate_identity_requires_login()
    {
        using var student = fixture.CreateStudentBrowser();
        var input = new StudentRegistration("Олена", "Тестова", 5, "Matematyka29", "Matematyka29");
        var response = await Post(student, "/api/students/register", input); response.EnsureSuccessStatusCode();
        var cookie = response.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase); Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=none", cookie, StringComparison.OrdinalIgnoreCase);
        var json = await response.Content.ReadAsStringAsync(); Assert.DoesNotContain("Matematyka29", json); Assert.DoesNotContain("passwordHash", json);
        (await student.GetAsync("/api/students/me")).EnsureSuccessStatusCode();
        using var duplicate = fixture.CreateStudentBrowser();
        Assert.Equal(HttpStatusCode.Conflict, (await Post(duplicate, "/api/students/register", input with { FirstName = " олена " })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await duplicate.GetAsync("/api/students/me")).StatusCode);
        await using var db = Context(); var row = await db.Set<Student>().SingleAsync();
        Assert.Contains("$600000$", row.PasswordHash); Assert.True(new AdminPasswordHasher().Verify(input.Pin, row.PasswordHash!));
    }
    [Fact] public async Task Login_validates_pin_and_lockout_is_account_based()
    {
        using var registered = await fixture.CreateStudentClientAsync("Іван");
        using var browser = fixture.CreateStudentBrowser();
        var login = new StudentLogin("Іван", "Тестова", 5, "incorrect");
        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Post(browser, "/api/students/login", login)).StatusCode);
        using var otherIp = fixture.CreateStudentBrowser();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(otherIp, "/api/students/login", login with { Pin = "Matematyka29" })).StatusCode);
        await using (var db = Context()) { var s = await db.Set<Student>().SingleAsync(); s.LockedUntil = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync(); }
        (await Post(otherIp, "/api/students/login", login with { Pin = "Matematyka29" })).EnsureSuccessStatusCode();
        (await otherIp.GetAsync("/api/students/me")).EnsureSuccessStatusCode();
    }
    [Fact] public async Task Csrf_and_pin_policy_are_enforced()
    {
        using var browser = fixture.CreateStudentBrowser();
        var valid = new StudentRegistration("Олена", "Тестова", 5, "Matematyka29", "Matematyka29");
        browser.DefaultRequestHeaders.Remove("X-Student-Request");
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(browser, "/api/students/register", valid)).StatusCode);
        browser.DefaultRequestHeaders.Add("X-Student-Request", "1"); browser.DefaultRequestHeaders.Remove("Origin"); browser.DefaultRequestHeaders.Add("Origin", "https://untrusted.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(browser, "/api/students/register", valid)).StatusCode);
        browser.DefaultRequestHeaders.Remove("Origin"); browser.DefaultRequestHeaders.Add("Origin", "https://example.com");
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(browser, "/api/students/register", valid with { Pin = "123", ConfirmPin = "123" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(browser, "/api/students/register", valid with { ConfirmPin = "different" })).StatusCode);
    }
    [Fact] public async Task Students_only_see_own_history_and_cannot_claim_legacy_attempts()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var a = await fixture.CreateStudentClientAsync(); using var b = await fixture.CreateStudentClientAsync();
        var (test, _) = await Create(admin); var started = await Start(a, test.Id);
        await Submit(a, started.Id);
        var own = await a.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions); Assert.Single(own!);
        Assert.Empty((await b.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions))!);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/students/me/attempts/{started.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.PostAsync($"/api/test-attempts/{started.Id}/submit", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.PutAsync($"/api/test-attempts/{started.Id}/answers", JsonContent.Create(new AnswerInput(Guid.NewGuid(), [], null), options: fixture.JsonOptions))).StatusCode);
        await using var db = Context(); var legacy = await db.Set<TestAttempt>().SingleAsync();
        legacy.StudentId = null; legacy.TokenHash = TestingService.Hash("legacy-secret"); await db.SaveChangesAsync();
        a.DefaultRequestHeaders.Add("X-Attempt-Token", "legacy-secret");
        Assert.Empty((await a.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions))!);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/api/test-attempts/{legacy.Id}")).StatusCode);
    }
    [Theory, InlineData(true), InlineData(false)] public async Task Concurrent_starts_resume_one_active_attempt_and_refresh_never_creates_another(bool allowRepeats)
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync();
        var (test, _) = await Create(admin, new(AllowRepeats: allowRepeats));
        var responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => student.PostAsync($"/api/tests/{test.Id}/attempts", null)));
        var ids = new List<Guid>();
        foreach (var r in responses) { r.EnsureSuccessStatusCode(); ids.Add((await r.Content.ReadFromJsonAsync<AttemptCredentials>(fixture.JsonOptions))!.Id); }
        Assert.Single(ids.Distinct()); Assert.Equal(ids[0], (await Start(student, test.Id)).Id);
        var access = await student.GetFromJsonAsync<StudentTestAccess>($"/api/students/me/tests/{test.Id}/access", fixture.JsonOptions); Assert.Equal(ids[0], access!.ResumeAttemptId);
        await using var db = Context(); Assert.Single(await db.Set<TestAttempt>().ToListAsync());
    }
    [Fact] public async Task No_retakes_rejects_completed_attempt_even_with_forged_identity_and_preserves_result()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync();
        var (test, _) = await Create(admin, new(AnswerVisibility.Never, ShowScore: false, AllowRepeats: false));
        var c = await Start(student, test.Id); var result = await Submit(student, c.Id);
        Assert.Empty(result.Review); Assert.Null(result.Percentage); Assert.Null(result.CorrectCount);
        var repeat = await Post(student, $"/api/tests/{test.Id}/attempts", new { studentId = Guid.NewGuid(), firstName = "Інший", participantToken = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.Conflict, repeat.StatusCode);
        var access = await student.GetFromJsonAsync<StudentTestAccess>($"/api/students/me/tests/{test.Id}/access", fixture.JsonOptions);
        Assert.False(access!.CanStart); Assert.Equal(c.Id, access.PreviousAttemptId);
        var history = Assert.Single((await student.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions))!);
        Assert.Null(history.EarnedPoints); Assert.Null(history.Percentage); Assert.Null(history.Passed);
    }
    [Fact] public async Task Retakes_preserve_all_snapshots_and_statistics_count_students_separately()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync();
        var (test, q) = await Create(admin); var first = await Start(student, test.Id);
        var firstResult = await Submit(student, first.Id); Assert.Equal(0, firstResult.EarnedPoints);
        var second = await Start(student, test.Id); Assert.NotEqual(first.Id, second.Id);
        (await student.PutAsync($"/api/test-attempts/{second.Id}/answers", JsonContent.Create(new AnswerInput(q.Id, [q.Options[0].Id], null), options: fixture.JsonOptions))).EnsureSuccessStatusCode();
        await Submit(student, second.Id);
        var history = await student.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions);
        Assert.Equal(new[] { 1, 2 }, history!.OrderBy(a => a.AttemptNumber).Select(a => a.AttemptNumber)); Assert.Equal(0, history!.Single(a => a.Id == first.Id).EarnedPoints);
        var stats = await admin.GetFromJsonAsync<StudentTestingStatistics>("/api/admin/tests/student-statistics", fixture.JsonOptions);
        Assert.Equal(1, stats!.UniqueStudents); Assert.Equal(2, stats.CompletedAttempts); Assert.Equal(50, stats.AveragePercentage);
        var perf = Assert.Single(stats.Performance); Assert.Equal(0, perf.FirstPercentage); Assert.Equal(100, perf.LatestPercentage); Assert.Equal(100, perf.BestPercentage); Assert.Equal(2, perf.Attempts);
        var filtered = await admin.GetFromJsonAsync<StudentTestingStatistics>($"/api/admin/tests/student-statistics?studentId={Guid.NewGuid()}", fixture.JsonOptions); Assert.Equal(0, filtered!.CompletedAttempts);
        var questions = await admin.GetFromJsonAsync<List<QuestionStatistics>>($"/api/admin/tests/{test.Id}/question-statistics", fixture.JsonOptions); Assert.Equal(1, Assert.Single(questions!).Correct);
    }
    [Fact] public async Task Archive_blocks_new_starts_but_preserves_resume_history_and_statistics()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync(); using var another = await fixture.CreateStudentClientAsync();
        var (test, _) = await Create(admin); var c = await Start(student, test.Id);
        (await admin.PostAsync($"/api/admin/tests/{test.Id}/publish?status=Archived", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await another.PostAsync($"/api/tests/{test.Id}/attempts", null)).StatusCode);
        (await student.GetAsync($"/api/test-attempts/{c.Id}")).EnsureSuccessStatusCode();
        await Submit(student, c.Id);
        Assert.Single((await student.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions))!);
        var stats = await admin.GetFromJsonAsync<TestingOverview>("/api/admin/tests/statistics", fixture.JsonOptions); Assert.Equal(1, stats!.CompletedAttempts);
    }
    [Fact] public async Task Delete_is_permanent_only_without_attempts_and_never_cascades_history()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync();
        var (empty, _) = await Create(admin); (await admin.DeleteAsync($"/api/admin/tests/{empty.Id}")).EnsureSuccessStatusCode();
        await using var db = Context(); Assert.False(await db.Set<StudentTest>().AnyAsync(t => t.Id == empty.Id));
        var (test, _) = await Create(admin); var c = await Start(student, test.Id); await Submit(student, c.Id);
        (await admin.DeleteAsync($"/api/admin/tests/{test.Id}")).EnsureSuccessStatusCode();
        var row = await db.Set<StudentTest>().SingleAsync(t => t.Id == test.Id); Assert.True(row.IsDeleted); Assert.NotNull(row.DeletedAt);
        (await student.GetAsync($"/api/students/me/attempts/{c.Id}")).EnsureSuccessStatusCode();
        (await admin.GetAsync($"/api/admin/tests/attempts/{c.Id}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/tests/{test.Id}")).StatusCode);
        Assert.Single(await db.Set<TestAttempt>().ToListAsync());
    }
    [Fact] public async Task Administrator_management_revokes_sessions_on_pin_reset_disable_and_logout()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync("Петро");
        var me = (await student.GetFromJsonAsync<StudentProfile>("/api/students/me", fixture.JsonOptions))!;
        using var anonymous = fixture.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/students")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await student.GetAsync("/api/admin/students")).StatusCode);
        var list = await admin.GetFromJsonAsync<MathArchive.Application.Common.PagedResult<StudentProfile>>("/api/admin/students?search=Петро&grade=5", fixture.JsonOptions); Assert.Single(list!.Items);
        (await admin.PutAsJsonAsync($"/api/admin/students/{me.Id}/pin", new { pin = "NewMatem29" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await student.GetAsync("/api/students/me")).StatusCode);
        var login = new StudentLogin("Петро", "Тестова", 5, "Matematyka29");
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(student, "/api/students/login", login)).StatusCode);
        (await Post(student, "/api/students/login", login with { Pin = "NewMatem29" })).EnsureSuccessStatusCode();
        (await admin.PutAsJsonAsync($"/api/admin/students/{me.Id}/active", new { isActive = false })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await student.GetAsync("/api/students/me")).StatusCode);
        (await admin.PutAsJsonAsync($"/api/admin/students/{me.Id}/active", new { isActive = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await student.GetAsync("/api/students/me")).StatusCode);
        var authenticated = await Post(student, "/api/students/login", login with { Pin = "NewMatem29" }); authenticated.EnsureSuccessStatusCode();
        var cookie = authenticated.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        (await student.PostAsync("/api/students/logout", null)).EnsureSuccessStatusCode();
        using var replay = fixture.CreateStudentBrowser(); replay.DefaultRequestHeaders.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/students/me")).StatusCode);
    }
    [Fact] public async Task Expired_attempts_are_graded_for_reports_without_student_return()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var student = await fixture.CreateStudentClientAsync();
        var (t, _) = await Create(admin, new(TimeLimitMinutes: 1)); await Start(student, t.Id);
        await using (var db = Context()) { var a = await db.Set<TestAttempt>().SingleAsync(); a.Deadline = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync(); }
        var report = await admin.GetFromJsonAsync<TestingOverview>("/api/admin/tests/statistics", fixture.JsonOptions); Assert.Equal(1, report!.CompletedAttempts);
        await using var check = Context(); Assert.Equal(AttemptStatus.Expired, (await check.Set<TestAttempt>().SingleAsync()).Status);
    }
    [Fact] public async Task Attempt_rate_limit_is_independent_for_students_sharing_an_ip()
    {
        using var admin = await fixture.CreateAuthorizedClientAsync(); using var first = await fixture.CreateStudentClientAsync(); using var second = await fixture.CreateStudentClientAsync();
        var (t, _) = await Create(admin); var a = await Start(first, t.Id); var b = await Start(second, t.Id);
        for (var i = 0; i < 180; i++) { using var response = await first.GetAsync($"/api/test-attempts/{a.Id}"); response.EnsureSuccessStatusCode(); }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await first.PostAsync($"/api/test-attempts/{a.Id}/submit", null)).StatusCode);
        (await second.PostAsync($"/api/test-attempts/{b.Id}/submit", null)).EnsureSuccessStatusCode();
    }
    [Fact] public async Task Login_endpoint_limits_requests_per_ip()
    {
        using var browser = fixture.CreateStudentBrowser();
        var invalid = new StudentLogin("", "", 5, "invalid");
        for (var i = 0; i < 60; i++) Assert.Equal(HttpStatusCode.BadRequest, (await Post(browser, "/api/students/login", invalid)).StatusCode);
        var response = await Post(browser, "/api/students/login", invalid);
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
    }}



