using MathArchive.Application.Common;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
namespace MathArchive.Application.Tests;

public sealed class TestingServiceTests
{
    private readonly Clock clock = new();
    private readonly Store store = new();
    private TestingService Service => new(store, clock, new TestDefinitionValidator(), new StartAttemptValidator());
    private static TestQuestion Single() => new(Guid.NewGuid(), "2 + 2?", QuestionType.SingleChoice, 2, "Пояснення", [new(Guid.NewGuid(), "4", true), new(Guid.NewGuid(), "5", false)], []);
    private static TestDefinition Definition(TestQuestion q, TestSettings? s = null) => new("Тест", null, 5, null, s ?? new(), [q]);
    private async Task<(Guid id, AttemptCredentials c, TestQuestion q)> Start(TestSettings? settings = null)
    {
        var q = Single(); var t = await Service.SaveAsync(null, Definition(q, settings), default);
        await Service.SetStatusAsync(t.Id, TestStatus.Published, default);
        return (t.Id, await Service.StartAsync(t.Id, new("Олена", "Тестова", 5, Guid.NewGuid().ToString()), default), q);
    }
    [Fact]
    public void Single_choice_requires_correct_option()
    { var q = Single(); Assert.True(TestingService.IsCorrect(q, new(q.Id, [q.Options[0].Id], null))); Assert.False(TestingService.IsCorrect(q, new(q.Id, [q.Options[1].Id], null))); Assert.False(TestingService.IsCorrect(q, null)); }
    [Fact]
    public void Multiple_choice_requires_exact_set()
    {
        var q = Single() with { Type = QuestionType.MultipleChoice }; q.Options.Add(new(Guid.NewGuid(), "6", true));
        Assert.True(TestingService.IsCorrect(q, new(q.Id, [q.Options[2].Id, q.Options[0].Id], null)));
        Assert.False(TestingService.IsCorrect(q, new(q.Id, [q.Options[0].Id], null)));
        Assert.False(TestingService.IsCorrect(q, new(q.Id, q.Options.Select(o => o.Id).ToList(), null)));
    }
    [Theory]
    [InlineData("  ВІДПОВІДЬ ", true)]
    [InlineData("відповідь", true)]
    [InlineData("1/2", true)]
    [InlineData("0.5", false)]
    [InlineData(" ", false)]
    public void Text_normalization_is_explicit(string value, bool expected)
    { var q = Single() with { Type = QuestionType.Text, Options = [], AcceptedAnswers = ["відповідь", "1/2"] }; Assert.Equal(expected, TestingService.IsCorrect(q, new(q.Id, [], value))); }
    [Theory]
    [InlineData(AnswerVisibility.Never)]
    [InlineData(AnswerVisibility.AfterCompletion)]
    public async Task In_progress_does_not_disclose_answers(AnswerVisibility visibility)
    {
        var (_, c, q) = await Start(new(visibility, ShowScore: false)); var v = await Service.AttemptAsync(c.Id, c.Token, null, false, default);
        Assert.Empty(v.Review); Assert.Null(v.EarnedPoints); var json = TestingService.Serialize(v); Assert.DoesNotContain("IsCorrect", json); Assert.DoesNotContain("AcceptedAnswers", json); Assert.DoesNotContain("Explanation", json);
        v = await Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[0].Id], null), true, default);
        Assert.Null(v.EarnedPoints); Assert.Empty(v.Review);
    }
    [Fact]
    public async Task Publishing_empty_draft_is_rejected()
    { var t = await Service.SaveAsync(null, Definition(Single()) with { Questions = [] }, default); Assert.Equal(TestStatus.Draft, t.Status); await Assert.ThrowsAsync<TestingException>(() => Service.SetStatusAsync(t.Id, TestStatus.Published, default)); }
    [Fact]
    public async Task Invalid_configuration_is_rejected()
    { var q = Single(); q.Options[1] = q.Options[1] with { IsCorrect = true }; await Assert.ThrowsAsync<FluentValidation.ValidationException>(() => Service.SaveAsync(null, Definition(q), default)); }
    [Fact]
    public async Task Submission_is_idempotent_and_edits_do_not_change_snapshot()
    {
        var (id, c, q) = await Start(); await Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[0].Id], null), false, default);
        await Service.SaveAsync(id, Definition(q with { Points = 100 }), default);
        var result = await Service.AttemptAsync(c.Id, c.Token, null, true, default); clock.UtcNow = clock.UtcNow.AddHours(1);
        var again = await Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[1].Id], null), true, default);
        Assert.Equal(2, result.EarnedPoints); Assert.Equal(result.CompletedAt, again.CompletedAt); Assert.Equal(result.EarnedPoints, again.EarnedPoints);
    }
    [Fact]
    public async Task Token_is_required_for_every_attempt_operation()
    { var (_, c, _) = await Start(); foreach (var token in new string?[] { null, "", new('0', 64) }) { var ex = await Assert.ThrowsAsync<TestingException>(() => Service.AttemptAsync(c.Id, token, null, true, default)); Assert.Equal(404, ex.Status); } }
    [Fact]
    public async Task Immediate_feedback_locks_answer()
    {
        var (_, c, q) = await Start(new(AnswerVisibility.Immediate)); var v = await Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[0].Id], null, true), false, default);
        Assert.True(Assert.Single(v.Answers).Locked); Assert.True(Assert.Single(v.Review).IsCorrect);
        await Assert.ThrowsAsync<TestingException>(() => Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[1].Id], null), false, default));
    }
    [Fact]
    public async Task Expired_attempt_ignores_late_answer_and_grades_saved_progress()
    {
        var (_, c, q) = await Start(new(TimeLimitMinutes: 1)); clock.UtcNow = clock.UtcNow.AddMinutes(2);
        var v = await Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[0].Id], null), true, default);
        Assert.Equal(AttemptStatus.Expired, v.Status); Assert.Equal(0, v.EarnedPoints); Assert.Equal(v.Deadline, v.CompletedAt);
    }
    [Theory]
    [InlineData(TestStatus.Draft)]
    [InlineData(TestStatus.Archived)]
    public async Task Non_public_tests_cannot_be_started(TestStatus status)
    { var (id, _, _) = await Start(); await Service.SetStatusAsync(id, status, default); await Assert.ThrowsAsync<TestingException>(() => Service.StartAsync(id, new("Олена", "Тестова", 5, Guid.NewGuid().ToString()), default)); }
    [Fact]
    public async Task Missing_identity_is_rejected()
    { var (id, _, _) = await Start(); await Assert.ThrowsAsync<FluentValidation.ValidationException>(() => Service.StartAsync(id, new("", " ", 4, "bad"), default)); }
    [Fact]
    public async Task Overview_and_question_distribution_respect_period()
    {
        var (_, c, q) = await Start(new(PassingPercentage: 50)); var from = clock.UtcNow.AddMinutes(-1);
        await Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[0].Id], null), true, default);
        var f = new AttemptFilter(From: from, To: clock.UtcNow.AddMinutes(1)); var v = await Service.OverviewAsync(f, default);
        Assert.Equal(1, v.CompletedAttempts); Assert.Equal(100, v.AveragePercentage); Assert.Equal(1, v.Passed);
        var stats = Assert.Single(await Service.QuestionsAsync(store.Attempts[c.Id].TestId, f, default)); Assert.Equal(1, stats.Correct);
        Assert.Equal(0, (await Service.OverviewAsync(f with { From = clock.UtcNow.AddDays(1), To = clock.UtcNow.AddDays(2) }, default)).CompletedAttempts);
    }
    [Fact]
    public async Task Publish_with_save_is_atomic_for_invalid_empty_test()
    {
        await Assert.ThrowsAsync<TestingException>(() => Service.SaveAsync(null, Definition(Single()) with { Questions = [] }, default, publish: true));
        Assert.Empty(store.Tests);
        var t = await Service.SaveAsync(null, Definition(Single()), default, publish: true);
        Assert.Equal(TestStatus.Published, t.Status);
    }
    [Fact]
    public async Task Availability_blocks_start_and_normalizes_deadline_to_utc()
    {
        var d = Definition(Single(), new(AvailableFrom: clock.UtcNow.AddDays(1)));
        var t = await Service.SaveAsync(null, d, default, publish: true);
        await Assert.ThrowsAsync<TestingException>(() => Service.StartAsync(t.Id, new("Олена", "Тестова", 5, Guid.NewGuid().ToString()), default));
        await Service.SaveAsync(t.Id, d with { Settings = new(AvailableTo: clock.UtcNow.AddHours(1).ToOffset(TimeSpan.FromHours(3))) }, default);
        var c = await Service.StartAsync(t.Id, new("Олена", "Тестова", 5, Guid.NewGuid().ToString()), default);
        Assert.Equal(TimeSpan.Zero, store.Attempts[c.Id].Deadline!.Value.Offset);
        clock.UtcNow = clock.UtcNow.AddHours(2);
        await Assert.ThrowsAsync<TestingException>(() => Service.StartAsync(t.Id, new("Олена", "Тестова", 5, Guid.NewGuid().ToString()), default));
    }
    [Fact]
    public async Task Shuffling_option_order_does_not_split_question_statistics()
    {
        var (id, c, q) = await Start();
        await Service.AttemptAsync(c.Id, c.Token, new(q.Id, [q.Options[0].Id], null), true, default);
        var reversed = q with { Options = q.Options.AsEnumerable().Reverse().ToList() };
        await Service.SaveAsync(id, Definition(reversed), default);
        var second = await Service.StartAsync(id, new("Олена", "Тестова", 5, Guid.NewGuid().ToString()), default);
        await Service.AttemptAsync(second.Id, second.Token, new(q.Id, [q.Options[1].Id], null), true, default);
        var stats = Assert.Single(await Service.QuestionsAsync(id, new(), default));
        Assert.Equal(2, stats.Submitted); Assert.Equal(1, stats.Correct); Assert.Equal(1, stats.Incorrect);
        Assert.Equal("5", Assert.Single(stats.WrongAnswers).Answer);
    }
    private sealed class Clock : IClock { public DateTimeOffset UtcNow { get; set; } = DateTimeOffset.Parse("2026-10-16T12:00:00Z"); }
    private sealed class Store : ITestingRepository
    {
        public Dictionary<Guid, StudentTest> Tests { get; } = []; public Dictionary<Guid, TestAttempt> Attempts { get; } = [];
        public Task<List<StudentTest>> ListTestsAsync(bool admin, int? grade, CancellationToken ct) => Task.FromResult(Tests.Values.Where(t => !t.IsDeleted && (admin || t.Status == TestStatus.Published)).ToList());
        public Task<StudentTest?> FindTestAsync(Guid id, CancellationToken ct) => Task.FromResult(Tests.GetValueOrDefault(id));
        public Task SaveTestAsync(StudentTest t, CancellationToken ct) { Tests[t.Id] = t; return Task.CompletedTask; }
        public Task<bool> DocumentExistsAsync(Guid id, CancellationToken ct) => Task.FromResult(true);
        public Task<TestAttempt> CreateAttemptAsync(TestAttempt a, bool repeats, CancellationToken ct) { Attempts[a.Id] = a; return Task.FromResult(a); }
        public Task DeleteTestAsync(Guid id, DateTimeOffset now, CancellationToken ct) { Tests[id].IsDeleted = true; return Task.CompletedTask; }
        public Task<T> WithAttemptAsync<T>(Guid id, Func<TestAttempt, T> action, CancellationToken ct) => Task.FromResult(action(Attempts[id]));
        public Task<PagedResult<AttemptRow>> ListAttemptsAsync(AttemptFilter f, CancellationToken ct) => throw new NotSupportedException();
        public Task<List<TestAttempt>> ReportAttemptsAsync(AttemptFilter f, CancellationToken ct) => Task.FromResult(Attempts.Values.Where(a => (!f.From.HasValue || (a.CompletedAt ?? a.StartedAt) >= f.From) && (!f.To.HasValue || (a.CompletedAt ?? a.StartedAt) < f.To) && (!f.TestId.HasValue || a.TestId == f.TestId)).ToList());
        public Task<Dictionary<Guid, int>> CompletedCountsAsync(CancellationToken ct) => Task.FromResult(new Dictionary<Guid, int>());
    }
}

