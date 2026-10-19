using MathArchive.Domain.Testing;
using MathArchive.Application.Common;
namespace MathArchive.Application.Testing;

public sealed class TestingException(int status, string message) : Exception(message) { public int Status { get; } = status; }
public sealed record StartAttempt(string FirstName, string LastName, int Grade, string ParticipantToken);
public sealed record AnswerInput(Guid QuestionId, List<Guid> OptionIds, string? Text, bool Lock = false, int Revision = 0, Guid? OperationId = null);
public sealed record ProgressInput(Guid QuestionId, int Revision);
public sealed record AttemptCredentials(Guid Id, string Token);
public sealed record TestSummary(Guid Id, string Title, string? Description, int Grade, TestStatus Status,
    int QuestionCount, int? TimeLimitMinutes, int CompletedAttempts, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record PublicTestSummary(Guid Id, string Title, string? Description, int Grade, int QuestionCount, int? TimeLimitMinutes);
public sealed record PublicTestInfo(Guid Id, string Title, string? Description, int Grade, Guid? DocumentId, int QuestionCount, int? TimeLimitMinutes, DateTimeOffset? AvailableFrom, DateTimeOffset? AvailableTo, bool AllowRepeats);
public sealed record AdminTest(Guid Id, TestStatus Status, TestDefinition Definition);
public sealed record PublicOption(Guid Id, string Text, List<TestContentBlock>? Content = null);
public sealed record PublicQuestion(Guid Id, string Text, QuestionType Type, decimal Points, List<PublicOption> Options, List<TestContentBlock>? Content = null);
public sealed record AnswerReview(Guid QuestionId, bool IsCorrect, decimal EarnedPoints, List<Guid> CorrectOptionIds,
    List<string> AcceptedAnswers, string? Explanation);
public sealed record AttemptView(Guid Id, string Title, AttemptStatus Status, DateTimeOffset StartedAt,
    DateTimeOffset? Deadline, DateTimeOffset? CompletedAt, AnswerVisibility AnswerVisibility,
    List<PublicQuestion> Questions, List<StoredAnswer> Answers, decimal? EarnedPoints, decimal? MaximumPoints,
    decimal? Percentage, bool? Passed, int? CorrectCount, List<AnswerReview> Review,
    DateTimeOffset ServerTime = default, Guid? CurrentQuestionId = null, int ProgressRevision = 0, bool TrackAnswerChanges = false);
public sealed record AttemptRow(Guid Id, Guid TestId, string TestTitle, string FirstName, string LastName, int Grade,
    AttemptStatus Status, DateTimeOffset StartedAt, DateTimeOffset? CompletedAt, decimal EarnedPoints,
    decimal MaximumPoints, decimal Percentage, bool? Passed, double DurationSeconds, Guid? StudentId = null, int AttemptNumber = 0);
public sealed record AttemptFilter(Guid? TestId = null, int? Grade = null, string? Search = null,
    AttemptStatus? Status = null, DateTimeOffset? From = null, DateTimeOffset? To = null,
    string Sort = "dateDesc", int Page = 1, int PageSize = 20, Guid? StudentId = null);
public sealed record TestingOverview(int PublishedTests, int CompletedAttempts, int BrowserParticipants,
    decimal AveragePoints, decimal AveragePercentage, int Passed, int Failed);
public sealed record AnswerFrequency(string Answer, int Count, Guid? OptionId = null, List<TestContentBlock>? Content = null);
public sealed record QuestionStatistics(Guid QuestionId, string Text, int Submitted, int Correct, int Incorrect,
    int Unanswered, decimal CorrectPercentage, List<AnswerFrequency> Distribution, List<AnswerFrequency> WrongAnswers, List<TestContentBlock>? Content = null);
public interface ITestingRepository
{
    Task<List<StudentTest>> ListTestsAsync(bool admin, int? grade, CancellationToken ct);
    Task<StudentTest?> FindTestAsync(Guid id, CancellationToken ct);
    Task SaveTestAsync(StudentTest test, CancellationToken ct);
    Task<bool> DocumentExistsAsync(Guid id, CancellationToken ct);
    Task<bool> ImagesExistAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) => Task.FromResult(ids.Count == 0);
    Task<TestAttempt> CreateAttemptAsync(TestAttempt attempt, bool allowRepeats, CancellationToken ct);
    Task DeleteTestAsync(Guid id, DateTimeOffset now, CancellationToken ct);
    Task<T> WithAttemptAsync<T>(Guid id, Func<TestAttempt, T> action, CancellationToken ct);
    Task<PagedResult<AttemptRow>> ListAttemptsAsync(AttemptFilter filter, CancellationToken ct);
    Task<List<TestAttempt>> ReportAttemptsAsync(AttemptFilter filter, CancellationToken ct);
    Task<Dictionary<Guid, int>> CompletedCountsAsync(CancellationToken ct);
}

