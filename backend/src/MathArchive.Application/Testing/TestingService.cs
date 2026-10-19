using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentValidation;
using MathArchive.Application.Common;
using MathArchive.Domain.Testing;
namespace MathArchive.Application.Testing;

public sealed class TestingService(ITestingRepository repository, IClock clock,
    IValidator<TestDefinition> validator, IValidator<StartAttempt> startValidator)
{
    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value);
    public static TestDefinition Definition(string json) => JsonSerializer.Deserialize<TestDefinition>(json)!;
    public static List<StoredAnswer> Answers(TestAttempt a) => JsonSerializer.Deserialize<List<StoredAnswer>>(a.AnswersJson)!;
    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    public static bool IsCorrect(TestQuestion q, StoredAnswer? a) => a is not null && (q.Type == QuestionType.Text
        ? !string.IsNullOrWhiteSpace(a.Text) && q.AcceptedAnswers.Any(v => string.Equals(v.Trim(), a.Text.Trim(), StringComparison.OrdinalIgnoreCase))
        : q.Options.Where(o => o.IsCorrect).Select(o => o.Id).ToHashSet().SetEquals(a.OptionIds));
    private static TestingException Missing() => new(404, "Тест або спробу не знайдено.");
    private async Task<StudentTest> Find(Guid id, bool admin, CancellationToken ct)
    {
        var t = await repository.FindTestAsync(id, ct);
        if (t is null || t.IsDeleted || (!admin && t.Status != TestStatus.Published)) throw Missing();
        return t;
    }
    public async Task<List<TestSummary>> ListAsync(bool admin, int? grade, CancellationToken ct)
    {
        if (grade is < 5 or > 11) throw new TestingException(400, "Оберіть клас від 5 до 11.");
        var tests = await repository.ListTestsAsync(admin, grade, ct);
        var counts = admin ? await repository.CompletedCountsAsync(ct) : [];
        return tests.Select(t =>
        {
            var d = Definition(t.DefinitionJson); return new TestSummary(t.Id, t.Title, d.Description,
            t.Grade, t.Status, d.Questions.Count, d.Settings.TimeLimitMinutes, counts.GetValueOrDefault(t.Id), t.CreatedAt, t.UpdatedAt);
        }).ToList();
    }
    public async Task<List<PublicTestSummary>> ListPublicAsync(int? grade, CancellationToken ct) =>
        (await ListAsync(false, grade, ct)).Select(t => new PublicTestSummary(t.Id, t.Title, t.Description, t.Grade, t.QuestionCount, t.TimeLimitMinutes)).ToList();
    public async Task<AdminTest> GetAdminAsync(Guid id, CancellationToken ct)
    { var t = await Find(id, true, ct); return new(t.Id, t.Status, Definition(t.DefinitionJson)); }
    public async Task<PublicTestInfo> GetPublicAsync(Guid id, CancellationToken ct)
    {
        var t = await Find(id, false, ct); var d = Definition(t.DefinitionJson);
        return new(t.Id, d.Title, d.Description, d.Grade, d.DocumentId, d.Questions.Count,
            d.Settings.TimeLimitMinutes, d.Settings.AvailableFrom, d.Settings.AvailableTo, d.Settings.AllowRepeats);
    }
    public async Task<AdminTest> SaveAsync(Guid? id, TestDefinition d, CancellationToken ct, bool publish = false)
    {
        await validator.ValidateAndThrowAsync(d, ct);
        if (!await repository.ImagesExistAsync(TestRichContent.ImageIds(d).ToArray(), ct)) throw new TestingException(400, "Одне із зображень не знайдено. Завантажте його повторно.");
        d = d with { Questions = d.Questions.Select(q => q with {
            Text = TestRichContent.PlainText(q.Text, q.Content, 4000),
            Options = q.Options.Select(o => o with { Text = TestRichContent.PlainText(o.Text, o.Content, 1000) }).ToList()
        }).ToList() };
        if (d.DocumentId is { } doc && !await repository.DocumentExistsAsync(doc, ct)) throw new TestingException(400, "Матеріал не знайдено.");
        var t = id.HasValue ? await Find(id.Value, true, ct) : new StudentTest { CreatedAt = clock.UtcNow };
        if ((publish || t.Status == TestStatus.Published) && d.Questions.Count == 0) throw new TestingException(400, "Опублікований тест повинен містити питання.");
        if (publish) t.Status = TestStatus.Published;
        t.Title = d.Title.Trim(); t.Grade = d.Grade; t.DefinitionJson = Serialize(d with { Title = t.Title }); t.UpdatedAt = clock.UtcNow;
        await repository.SaveTestAsync(t, ct);
        return new(t.Id, t.Status, Definition(t.DefinitionJson));
    }
    public async Task SetStatusAsync(Guid id, TestStatus status, CancellationToken ct)
    {
        if (!Enum.IsDefined(status)) throw new TestingException(400, "Невірний статус.");
        var t = await Find(id, true, ct); var d = Definition(t.DefinitionJson);
        await validator.ValidateAndThrowAsync(d, ct);
        if (status == TestStatus.Published && d.Questions.Count == 0) throw new TestingException(400, "Додайте хоча б одне питання.");
        t.Status = status; t.UpdatedAt = clock.UtcNow; await repository.SaveTestAsync(t, ct);
    }
    public async Task DeleteAsync(Guid id, CancellationToken ct)
    { await Find(id, true, ct); await repository.DeleteTestAsync(id, clock.UtcNow, ct); }
    public async Task<AdminTest> DuplicateAsync(Guid id, CancellationToken ct)
    { var t = await GetAdminAsync(id, ct); return await SaveAsync(null, t.Definition with { Title = t.Definition.Title[..Math.Min(190, t.Definition.Title.Length)] + " (копія)" }, ct); }
    public async Task<AttemptCredentials> StartAsync(Guid id, StartAttempt r, CancellationToken ct, Guid? studentId = null)
    {
        await startValidator.ValidateAndThrowAsync(r, ct);
        var t = await Find(id, false, ct); var d = Definition(t.DefinitionJson); var now = clock.UtcNow;
        if (d.Settings.AvailableFrom > now || d.Settings.AvailableTo <= now) throw new TestingException(409, "Тест зараз недоступний.");
        // Clone through JSON so per-attempt ordering cannot mutate the author's definition.
        if (d.Settings.ShuffleQuestions) Random.Shared.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(d.Questions));
        if (d.Settings.ShuffleOptions) foreach (var q in d.Questions) Random.Shared.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(q.Options));
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var deadline = d.Settings.TimeLimitMinutes is { } minutes ? now.AddMinutes(minutes) : (DateTimeOffset?)null;
        if (d.Settings.AvailableTo is { } end && (deadline is null || end < deadline)) deadline = end.ToUniversalTime();
        var a = new TestAttempt
        {
            StudentId = studentId,
            TestId = id,
            TokenHash = Hash(token),
            ParticipantHash = Hash(r.ParticipantToken.ToLowerInvariant()),
            FirstName = r.FirstName.Trim(),
            LastName = r.LastName.Trim(),
            Grade = r.Grade,
            TestTitle = d.Title,
            SnapshotJson = Serialize(d),
            StartedAt = now,
            Deadline = deadline,
            MaximumPoints = d.Questions.Sum(q => q.Points)
        };
        a.CurrentQuestionId = d.Questions.FirstOrDefault()?.Id;
        if (a.CurrentQuestionId is { } first) AttemptInteractions.Add(a, first, "QuestionVisited", now);
        a = await repository.CreateAttemptAsync(a, d.Settings.AllowRepeats, ct);
        return new(a.Id, studentId.HasValue ? "" : token);
    }
    public static void Authorize(TestAttempt a, string? token, Guid? studentId = null)
    {
        if (studentId.HasValue || a.StudentId.HasValue) { if (!studentId.HasValue || a.StudentId != studentId) throw Missing(); return; }
        if (token is null || token.Length != 64 || !CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(a.TokenHash), Encoding.ASCII.GetBytes(Hash(token)))) throw Missing();
    }
    public Task<AttemptView> AttemptAsync(Guid id, string? token, AnswerInput? input, bool submit, CancellationToken ct, Guid? studentId = null) =>
        repository.WithAttemptAsync(id, a =>
        {
            Authorize(a, token, studentId); var d = Definition(a.SnapshotJson); var answers = Answers(a);
            if (a.Status == AttemptStatus.InProgress && a.Deadline <= clock.UtcNow) FinalizeAttempt(a, clock.UtcNow, true);
            if (a.Status == AttemptStatus.InProgress)
            {
                if (input is not null)
                {
                    var q = d.Questions.SingleOrDefault(q => q.Id == input.QuestionId) ?? throw new TestingException(400, "Питання не знайдено.");
                    if (input.OptionIds is null || input.OptionIds.Count > 20 || input.Text?.Length > 1000 || input.OptionIds.Distinct().Count() != input.OptionIds.Count ||
                        input.OptionIds.Any(id => q.Options.All(o => o.Id != id)) ||
                        (q.Type == QuestionType.Text ? input.OptionIds.Count != 0 : !string.IsNullOrEmpty(input.Text)) ||
                        (q.Type == QuestionType.SingleChoice && input.OptionIds.Count > 1)) throw new TestingException(400, "Некоректна відповідь.");
                    var old = answers.SingleOrDefault(v => v.QuestionId == q.Id);
                    var same = old is not null && old.Text == input.Text && old.OptionIds.ToHashSet().SetEquals(input.OptionIds);
                    if (input.OperationId.HasValue && old?.OperationId == input.OperationId) {
                        if (!same || old!.Locked != (d.Settings.AnswerVisibility == AnswerVisibility.Immediate && input.Lock)) throw new TestingException(409, "Конфлікт повторного запиту.");
                        return View(a, false) with { ServerTime = clock.UtcNow };
                    }
                    if (old?.Locked == true)
                    {
                        if (old.Text != input.Text || !old.OptionIds.ToHashSet().SetEquals(input.OptionIds)) throw new TestingException(409, "Відповідь уже зафіксовано.");
                    }
                    else
                    {
                        if (input.Revision != (old?.Revision ?? 0)) throw new TestingException(409, "Відповідь змінена в іншому сеансі. Оновіть сторінку, щоб завантажити збережену версію.");
                        if (old is not null) answers.Remove(old);
                        var saved = new StoredAnswer(q.Id, input.OptionIds, input.Text, d.Settings.AnswerVisibility == AnswerVisibility.Immediate && input.Lock, (old?.Revision ?? 0) + 1, input.OperationId);
                        answers.Add(saved);
                        AttemptInteractions.Changed(a, q, old, saved, clock.UtcNow);
                    }
                    a.AnswersJson = Serialize(answers);
                }
                if (submit) FinalizeAttempt(a, clock.UtcNow, false);
            }
            return View(a, false) with { ServerTime = clock.UtcNow };
        }, ct);
    public Task<AttemptView> ProgressAsync(Guid id, Guid studentId, ProgressInput input, CancellationToken ct) => repository.WithAttemptAsync(id, a => {
        Authorize(a, null, studentId);
        var d = Definition(a.SnapshotJson);
        if (a.Status == AttemptStatus.InProgress && a.Deadline <= clock.UtcNow) FinalizeAttempt(a, clock.UtcNow, true);
        if (a.Status != AttemptStatus.InProgress) return View(a, false) with { ServerTime = clock.UtcNow };
        if (!d.Questions.Any(q => q.Id == input.QuestionId)) throw new TestingException(400, "Питання не знайдено.");
        if (a.CurrentQuestionId != input.QuestionId) {
            if (input.Revision != a.ProgressRevision) throw new TestingException(409, "Прогрес змінено в іншому сеансі. Оновіть сторінку.");
            var visited = AttemptInteractions.Read(a, clock.UtcNow).Any(e => e.QuestionId == input.QuestionId && (e.EventType == "QuestionVisited" || e.EventType == "QuestionRevisited"));
            a.CurrentQuestionId = input.QuestionId; a.ProgressRevision++;
            AttemptInteractions.Add(a, input.QuestionId, visited ? "QuestionRevisited" : "QuestionVisited", clock.UtcNow);
        }
        return View(a, false) with { ServerTime = clock.UtcNow };
    }, ct);
    public Task ClearInteractionsAsync(Guid id, CancellationToken ct) => repository.WithAttemptAsync(id, a => { a.InteractionsJson = "[]"; a.InteractionSequence = AttemptInteractions.Limit; return true; }, ct);
    public static void FinalizeAttempt(TestAttempt a, DateTimeOffset now, bool expired)
    {
        var d = Definition(a.SnapshotJson); var answers = Answers(a);
        if (!expired) foreach (var answer in answers.Where(answer => !answer.Locked))
            AttemptInteractions.Add(a, answer.QuestionId, "AnswerConfirmed", now, revision: answer.Revision);
        a.Status = expired ? AttemptStatus.Expired : AttemptStatus.Completed;
        a.CompletedAt = expired ? a.Deadline : now;
        a.EarnedPoints = d.Questions.Where(q => IsCorrect(q, answers.SingleOrDefault(v => v.QuestionId == q.Id))).Sum(q => q.Points);
        a.Percentage = a.MaximumPoints == 0 ? 0 : decimal.Round(a.EarnedPoints / a.MaximumPoints * 100, 2);
        a.Passed = d.Settings.PassingPercentage is { } p ? a.Percentage >= p : null;
    }
    public static AttemptView View(TestAttempt a, bool admin)
    {
        var d = Definition(a.SnapshotJson); var answers = Answers(a); var done = a.Status != AttemptStatus.InProgress;
        var score = admin || (done && d.Settings.ShowScore);
        var review = d.Questions.Where(q => admin || (d.Settings.ShowScore && d.Settings.AnswerVisibility != AnswerVisibility.Never &&
            (done || (d.Settings.AnswerVisibility == AnswerVisibility.Immediate && answers.Any(v => v.QuestionId == q.Id && v.Locked)))))
            .Select(q =>
            {
                var correct = IsCorrect(q, answers.SingleOrDefault(v => v.QuestionId == q.Id));
                return new AnswerReview(q.Id, correct, correct ? q.Points : 0, q.Options.Where(o => o.IsCorrect).Select(o => o.Id).ToList(), q.AcceptedAnswers, q.Explanation);
            }).ToList();
        return new(a.Id, d.Title, a.Status, a.StartedAt, a.Deadline, a.CompletedAt, d.Settings.AnswerVisibility,
            d.Questions.Select(q => new PublicQuestion(q.Id, q.Text, q.Type, q.Points, q.Options.Select(o => new PublicOption(o.Id, o.Text, o.Content)).ToList(), q.Content)).ToList(),
            answers, score ? a.EarnedPoints : null, score ? a.MaximumPoints : null, score ? a.Percentage : null, score ? a.Passed : null,
            score ? d.Questions.Count(q => IsCorrect(q, answers.SingleOrDefault(v => v.QuestionId == q.Id))) : null, review,
            CurrentQuestionId: a.CurrentQuestionId, ProgressRevision: a.ProgressRevision, TrackAnswerChanges: d.Settings.TrackAnswerChanges);
    }
    public static void ValidateFilter(AttemptFilter f)
    {
        if (f.Page is < 1 or > 1000000 || f.PageSize is < 1 or > 100 || f.Grade is < 5 or > 11 || f.Search?.Length > 200 ||
            f.From >= f.To || f.Status.HasValue && !Enum.IsDefined(f.Status.Value) || !new[] { "dateDesc", "dateAsc", "scoreDesc", "scoreAsc", "name" }.Contains(f.Sort))
            throw new TestingException(400, "Перевірте фільтри та період.");
    }
    public Task<PagedResult<AttemptRow>> AttemptsAsync(AttemptFilter f, CancellationToken ct)
    { ValidateFilter(f); return repository.ListAttemptsAsync(f, ct); }
    public Task<object> AdminAttemptAsync(Guid id, CancellationToken ct) => repository.WithAttemptAsync<object>(id, a => { if (a.Status == AttemptStatus.InProgress && a.Deadline <= clock.UtcNow) FinalizeAttempt(a, clock.UtcNow, true); return new { a.FirstName, a.LastName, a.Grade, a.TestTitle, View = View(a, true), Interactions = AttemptInteractions.Read(a, clock.UtcNow), InteractionLimitReached = a.InteractionSequence >= AttemptInteractions.Limit }; }, ct);
    public async Task<TestingOverview> OverviewAsync(AttemptFilter f, CancellationToken ct)
    {
        ValidateFilter(f); var rows = await repository.ReportAttemptsAsync(f, ct); var done = rows.Where(a => a.Status != AttemptStatus.InProgress).ToList();
        var tests = await repository.ListTestsAsync(true, null, ct);
        return new(tests.Count(t => t.Status == TestStatus.Published && (!f.TestId.HasValue || t.Id == f.TestId) && (!f.Grade.HasValue || t.Grade == f.Grade) && (!f.From.HasValue || t.CreatedAt >= f.From) && (!f.To.HasValue || t.CreatedAt < f.To)),
            done.Count, done.Select(a => a.ParticipantHash).Distinct().Count(), done.Count == 0 ? 0 : done.Average(a => a.EarnedPoints),
            done.Count == 0 ? 0 : done.Average(a => a.Percentage), done.Count(a => a.Passed == true), done.Count(a => a.Passed == false));
    }
    public async Task<List<QuestionStatistics>> QuestionsAsync(Guid id, AttemptFilter f, CancellationToken ct)
    {
        ValidateFilter(f); var rows = (await repository.ReportAttemptsAsync(f with { TestId = id }, ct)).Where(a => a.Status != AttemptStatus.InProgress).ToList();
        // Group by full question configuration: edits never merge incompatible historical variants.
        return rows.SelectMany(a => Definition(a.SnapshotJson).Questions.Select(q => (q, answer: Answers(a).SingleOrDefault(v => v.QuestionId == q.Id))))
            .GroupBy(v => Serialize(v.q with { Options = v.q.Options.OrderBy(o => o.Id).ToList(), AcceptedAnswers = v.q.AcceptedAnswers.OrderBy(a => a).ToList() })).Select(g =>
            {
                var q = g.First().q; var items = g.ToList(); var correct = items.Count(v => IsCorrect(v.q, v.answer));
                bool Empty(StoredAnswer? a) => a is null || (q.Type == QuestionType.Text ? string.IsNullOrWhiteSpace(a.Text) : a.OptionIds.Count == 0);
                List<AnswerFrequency> Frequencies(IEnumerable<(TestQuestion q, StoredAnswer? answer)> source, bool wrongOnly = false)
                {
                    var submitted = source.Where(v => !Empty(v.answer)).Select(v => v.answer!).ToList();
                    if (q.Type == QuestionType.Text) return submitted.GroupBy(a => a.Text!.Trim()).Select(g => new AnswerFrequency(g.Key, g.Count())).OrderByDescending(v => v.Count).Take(20).ToList();
                    return q.Options.Where(o => !wrongOnly || !o.IsCorrect).Select(o => new AnswerFrequency(o.Text, submitted.Count(a => a.OptionIds.Contains(o.Id)), o.Id, o.Content))
                        .Where(v => !wrongOnly || v.Count > 0).OrderByDescending(v => v.Count).ToList();
                }
                var unanswered = items.Count(v => Empty(v.answer));
                return new QuestionStatistics(q.Id, q.Text, items.Count - unanswered, correct, items.Count - unanswered - correct,
                    unanswered, items.Count == 0 ? 0 : decimal.Round(100m * correct / items.Count, 2), Frequencies(items), Frequencies(items.Where(v => !IsCorrect(v.q, v.answer)), true), q.Content);
            }).ToList();
    }
}

