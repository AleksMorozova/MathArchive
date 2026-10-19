using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class AttemptIntegrityIntegrationTests(ApiIntegrationFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private MathArchiveDbContext Context() => new(new DbContextOptionsBuilder<MathArchiveDbContext>().UseNpgsql(fixture.ConnectionString).Options);
    private async Task<(HttpClient Admin, HttpClient Student, AdminTest Test, AttemptCredentials Attempt)> Setup(TestSettings? settings = null)
    {
        var admin = await fixture.CreateAuthorizedClientAsync(); var student = await fixture.CreateStudentClientAsync();
        var q = new TestQuestion(Guid.NewGuid(), "2+2?", QuestionType.SingleChoice, 2, "SECRET-EXPLANATION", [new(Guid.NewGuid(), "4", true), new(Guid.NewGuid(), "5", false)], []);
        var multi = new TestQuestion(Guid.NewGuid(), "Парні числа", QuestionType.MultipleChoice, 3, null, [new(Guid.NewGuid(), "2", true), new(Guid.NewGuid(), "4", true), new(Guid.NewGuid(), "3", false)], []);
        var text = new TestQuestion(Guid.NewGuid(), "Коротка відповідь", QuestionType.Text, 1, null, [], ["SECRET-ACCEPTED"]);
        var r = await admin.PostAsync("/api/admin/tests?publish=true", JsonContent.Create(new TestDefinition("Безпечний тест", null, 5, null, settings ?? new(TrackAnswerChanges: true), [q, multi, text]), options: fixture.JsonOptions)); r.EnsureSuccessStatusCode();
        var test = (await r.Content.ReadFromJsonAsync<AdminTest>(fixture.JsonOptions))!;
        var start = await student.PostAsync($"/api/tests/{test.Id}/attempts", null); start.EnsureSuccessStatusCode();
        return (admin, student, test, (await start.Content.ReadFromJsonAsync<AttemptCredentials>(fixture.JsonOptions))!);
    }
    private Task<HttpResponseMessage> Save(HttpClient student, Guid id, AnswerInput input) => student.PutAsync($"/api/test-attempts/{id}/answers", JsonContent.Create(input, options: fixture.JsonOptions));
    private async Task<AttemptView> View(HttpClient student, Guid id) => (await student.GetFromJsonAsync<AttemptView>($"/api/test-attempts/{id}", fixture.JsonOptions))!;
    [Theory]
    [InlineData(AnswerVisibility.Immediate, true)] [InlineData(AnswerVisibility.AfterCompletion, true)] [InlineData(AnswerVisibility.Never, true)]
    [InlineData(AnswerVisibility.Immediate, false)] [InlineData(AnswerVisibility.AfterCompletion, false)] [InlineData(AnswerVisibility.Never, false)]
    public async Task Student_DTOs_never_reveal_unpermitted_keys_or_equivalent_hidden_scores(AnswerVisibility visibility, bool score)
    {
        var (admin, student, test, c) = await Setup(new(visibility, ShowScore: score, TrackAnswerChanges: true)); using var a = admin; using var s = student;
        var catalog = await s.GetStringAsync("/api/tests"); var info = await s.GetStringAsync($"/api/tests/{test.Id}");
        Assert.DoesNotContain("isCorrect", catalog); Assert.DoesNotContain("SECRET", info);
        var active = await s.GetStringAsync($"/api/test-attempts/{c.Id}"); Assert.DoesNotContain("SECRET", active); Assert.DoesNotContain("isCorrect", active); Assert.DoesNotContain("interactions", active);
        var q = test.Definition.Questions[0];
        var save = await Save(s, c.Id, new(q.Id, [q.Options[0].Id], null)); save.EnsureSuccessStatusCode(); Assert.DoesNotContain("SECRET", await save.Content.ReadAsStringAsync());
        var confirmed = await Save(s, c.Id, new(q.Id, [q.Options[0].Id], null, true, 1, Guid.NewGuid())); confirmed.EnsureSuccessStatusCode();
        var v = (await confirmed.Content.ReadFromJsonAsync<AttemptView>(fixture.JsonOptions))!;
        Assert.Equal(visibility == AnswerVisibility.Immediate && score ? 1 : 0, v.Review.Count); Assert.Null(v.EarnedPoints);
        var result = await s.PostAsync($"/api/test-attempts/{c.Id}/submit", null); result.EnsureSuccessStatusCode(); v = (await result.Content.ReadFromJsonAsync<AttemptView>(fixture.JsonOptions))!;
        Assert.Equal(score && visibility != AnswerVisibility.Never ? 3 : 0, v.Review.Count);
        if (!score) { Assert.Null(v.EarnedPoints); Assert.Null(v.Percentage); Assert.Null(v.CorrectCount); Assert.Null(v.Passed); }
        var history = await s.GetFromJsonAsync<List<StudentHistoryRow>>("/api/students/me/attempts", fixture.JsonOptions); if (!score) Assert.Null(Assert.Single(history!).Percentage);
        foreach (var route in new[] { "/api/admin/tests/statistics", $"/api/admin/tests/{test.Id}/question-statistics", $"/api/admin/tests/attempts/{c.Id}" }) Assert.Contains((await s.GetAsync(route)).StatusCode, new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden });
    }
    [Fact] public async Task Concurrent_drafts_have_one_winner_and_retry_does_not_duplicate_events()
    {
        var (admin, student, test, c) = await Setup(); using var a = admin; using var s = student; var q = test.Definition.Questions[0];
        var inputs = new[] { new AnswerInput(q.Id, [q.Options[0].Id], null, OperationId: Guid.NewGuid()), new AnswerInput(q.Id, [q.Options[1].Id], null, OperationId: Guid.NewGuid()) };
        var responses = await Task.WhenAll(inputs.Select(input => Save(s, c.Id, input)));
        Assert.Single(responses, r => r.IsSuccessStatusCode); Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        var winner = Array.FindIndex(responses, r => r.IsSuccessStatusCode);
        await using var db = Context(); var before = await db.Set<TestAttempt>().AsNoTracking().SingleAsync();
        (await Save(s, c.Id, inputs[winner])).EnsureSuccessStatusCode();
        var after = await db.Set<TestAttempt>().AsNoTracking().SingleAsync(); Assert.Equal(before.InteractionsJson, after.InteractionsJson); Assert.Equal(before.AnswersJson, after.AnswersJson);
        var forgedRetry = inputs[winner] with { OptionIds = inputs[1 - winner].OptionIds };
        Assert.Equal(HttpStatusCode.Conflict, (await Save(s, c.Id, forgedRetry)).StatusCode);
        Assert.Equal(1, Assert.Single((await View(s, c.Id)).Answers).Revision);
    }
    [Fact] public async Task Immediate_confirmation_and_final_submission_are_immutable_under_retries()
    {
        var (admin, student, test, c) = await Setup(new(AnswerVisibility.Immediate, AllowRepeats: false, TrackAnswerChanges: true)); using var a = admin; using var s = student; var q = test.Definition.Questions[0];
        var input = new AnswerInput(q.Id, [q.Options[0].Id], null, true, OperationId: Guid.NewGuid());
        var confirmations = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => Save(s, c.Id, input))); foreach (var r in confirmations) r.EnsureSuccessStatusCode();
        Assert.True(Assert.Single((await View(s, c.Id)).Answers).Locked);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(s, c.Id, input with { OptionIds = [q.Options[1].Id], OperationId = Guid.NewGuid(), Revision = 1 })).StatusCode);
        var submissions = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => s.PostAsync($"/api/test-attempts/{c.Id}/submit", null))); foreach (var r in submissions) r.EnsureSuccessStatusCode();
        var done = await View(s, c.Id); Assert.Equal(2, done.EarnedPoints);
        (await Save(s, c.Id, new(q.Id, [q.Options[1].Id], null, Revision: 1))).EnsureSuccessStatusCode(); Assert.Equal(done.CompletedAt, (await View(s, c.Id)).CompletedAt);
        await using var db = Context(); var row = await db.Set<TestAttempt>().SingleAsync(); var events = AttemptInteractions.Read(row, DateTimeOffset.UtcNow); Assert.Single(events, e => e.EventType == "AnswerConfirmed"); Assert.Equal(2, row.EarnedPoints);
        Assert.Equal(HttpStatusCode.Conflict, (await s.PostAsync($"/api/tests/{test.Id}/attempts", null)).StatusCode);
        var stats = await a.GetFromJsonAsync<TestingOverview>("/api/admin/tests/statistics", fixture.JsonOptions); Assert.Equal(1, stats!.CompletedAttempts);
    }
    [Fact] public async Task Recovery_restores_snapshot_order_drafts_progress_and_server_deadline()
    {
        var (admin, student, test, c) = await Setup(new(TimeLimitMinutes: 10, ShuffleQuestions: true, ShuffleOptions: true, TrackAnswerChanges: true)); using var a = admin; using var s = student;
        var initial = await View(s, c.Id); var q = initial.Questions[0];
        (await Save(s, c.Id, new(q.Id, q.Type == QuestionType.Text ? [] : [q.Options[0].Id], q.Type == QuestionType.Text ? "чернетка" : null))).EnsureSuccessStatusCode();
        var nextQuestion = initial.Questions[1].Id;
        (await s.PutAsJsonAsync($"/api/test-attempts/{c.Id}/progress", new ProgressInput(nextQuestion, 0))).EnsureSuccessStatusCode();
        var recovered = await View(s, c.Id); Assert.Equal(nextQuestion, recovered.CurrentQuestionId); Assert.Equal(initial.Deadline, recovered.Deadline); Assert.Equal(initial.StartedAt, recovered.StartedAt);
        Assert.Equal(initial.Questions.Select(q => q.Id), recovered.Questions.Select(q => q.Id)); Assert.Equal(initial.Questions[0].Options.Select(o => o.Id), recovered.Questions[0].Options.Select(o => o.Id)); Assert.Single(recovered.Answers); Assert.True(recovered.ServerTime > initial.StartedAt);
        var resume = await s.PostAsync($"/api/tests/{test.Id}/attempts", null); resume.EnsureSuccessStatusCode(); Assert.Equal(c.Id, (await resume.Content.ReadFromJsonAsync<AttemptCredentials>(fixture.JsonOptions))!.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await s.PutAsJsonAsync($"/api/test-attempts/{c.Id}/progress", new ProgressInput(initial.Questions[2].Id, 0))).StatusCode);
        using var other = await fixture.CreateStudentClientAsync(); Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/test-attempts/{c.Id}")).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync($"/api/test-attempts/{c.Id}/progress", new ProgressInput(nextQuestion, 1))).StatusCode);
        await using var db = Context(); await db.Set<TestAttempt>().Where(x => x.Id == c.Id).ExecuteUpdateAsync(x => x.SetProperty(t => t.Deadline, DateTimeOffset.UtcNow.AddSeconds(-1)));
        var expired = await View(s, c.Id); Assert.Equal(AttemptStatus.Expired, expired.Status); Assert.Equal(expired.Deadline, expired.CompletedAt);
    }
    [Theory, InlineData(true), InlineData(false)] public async Task Interaction_metadata_is_ordered_private_bounded_and_optional(bool enabled)
    {
        var (admin, student, test, c) = await Setup(new(TrackAnswerChanges: enabled)); using var a = admin; using var s = student; var q = test.Definition.Questions[1]; var text = test.Definition.Questions[2];
        (await Save(s, c.Id, new(q.Id, [q.Options[0].Id], null))).EnsureSuccessStatusCode();
        (await Save(s, c.Id, new(q.Id, [q.Options[1].Id], null, Revision: 1))).EnsureSuccessStatusCode();
        (await Save(s, c.Id, new(text.Id, [], "PRIVATE-TEXT-DRAFT"))).EnsureSuccessStatusCode();
        (await s.PutAsJsonAsync($"/api/test-attempts/{c.Id}/progress", new ProgressInput(q.Id, 0))).EnsureSuccessStatusCode();
        (await s.PutAsJsonAsync($"/api/test-attempts/{c.Id}/progress", new ProgressInput(test.Definition.Questions[0].Id, 1))).EnsureSuccessStatusCode();
        var detail = await a.GetStringAsync($"/api/admin/tests/attempts/{c.Id}"); using var json = JsonDocument.Parse(detail);
        var events = json.RootElement.GetProperty("interactions"); Assert.Equal(enabled ? 6 : 0, events.GetArrayLength());
        if (enabled) { Assert.Equal(Enumerable.Range(1, 6).Select(i => (long)i), events.EnumerateArray().Select(e => e.GetProperty("sequence").GetInt64())); Assert.Contains("QuestionRevisited", events.GetRawText()); Assert.DoesNotContain("PRIVATE-TEXT-DRAFT", events.GetRawText()); Assert.Contains(q.Options[0].Id.ToString(), events.GetRawText()); }
        Assert.DoesNotContain("interactions", await s.GetStringAsync($"/api/test-attempts/{c.Id}"));
        var denied = await s.DeleteAsync($"/api/admin/tests/attempts/{c.Id}/interactions"); Assert.Contains(denied.StatusCode, new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden });
        (await a.DeleteAsync($"/api/admin/tests/attempts/{c.Id}/interactions")).EnsureSuccessStatusCode();
        (await Save(s, c.Id, new(text.Id, [], "FINAL", Revision: 1))).EnsureSuccessStatusCode();
        await using var db = Context(); var row = await db.Set<TestAttempt>().SingleAsync(); Assert.Equal("[]", row.InteractionsJson); Assert.Equal(AttemptInteractions.Limit, row.InteractionSequence); Assert.Contains("FINAL", row.AnswersJson);
    }
    [Fact] public async Task Grading_ignores_forged_scores_and_rejects_foreign_options_and_question_ids()
    {
        var (admin, student, test, c) = await Setup(new(AnswerVisibility.Never, PassingPercentage: 50)); using var a = admin; using var s = student;
        var q = test.Definition.Questions[0];
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(s, c.Id, new(Guid.NewGuid(), [], null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(s, c.Id, new(q.Id, [test.Definition.Questions[1].Options[0].Id], null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(s, c.Id, new(q.Id, q.Options.Select(o => o.Id).ToList(), null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(s, c.Id, new(q.Id, [], "unexpected text"))).StatusCode);
        (await s.PutAsJsonAsync($"/api/test-attempts/{c.Id}/answers", new { questionId = q.Id, optionIds = new[] { q.Options[1].Id }, text = (string?)null, isCorrect = true, earnedPoints = 999, finalScore = 100, passingStatus = true, studentId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        (await s.PostAsync($"/api/test-attempts/{c.Id}/submit", null)).EnsureSuccessStatusCode();
        var result = await View(s, c.Id); Assert.Equal(0, result.EarnedPoints); Assert.Equal(0, result.Percentage); Assert.False(result.Passed); Assert.Empty(result.Review);
    }
}
