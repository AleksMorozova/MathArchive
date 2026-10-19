namespace MathArchive.Domain.Testing;

public enum TestStatus { Draft, Published, Archived }
public enum QuestionType { SingleChoice, MultipleChoice, Text }
public enum AnswerVisibility { Immediate, AfterCompletion, Never }
public enum AttemptStatus { InProgress, Completed, Expired }
public enum TestContentKind { Text, InlineMath, BlockMath, Image }
public enum TestImageAlignment { Left, Center, Right }
public sealed record TestContentBlock(TestContentKind Kind, string? Text = null, Guid? ImageId = null,
    TestImageAlignment Alignment = TestImageAlignment.Center, string? Description = null);
public sealed record TestOption(Guid Id, string Text, bool IsCorrect, List<TestContentBlock>? Content = null);
public sealed record TestQuestion(Guid Id, string Text, QuestionType Type, decimal Points,
    string? Explanation, List<TestOption> Options, List<string> AcceptedAnswers, List<TestContentBlock>? Content = null);
public sealed record TestSettings(AnswerVisibility AnswerVisibility = AnswerVisibility.AfterCompletion,
    bool ShowScore = true, bool AllowRepeats = true, bool ShuffleQuestions = false,
    bool ShuffleOptions = false, int? TimeLimitMinutes = null, int? PassingPercentage = null,
    DateTimeOffset? AvailableFrom = null, DateTimeOffset? AvailableTo = null, bool TrackAnswerChanges = false);
public sealed record TestDefinition(string Title, string? Description, int Grade, Guid? DocumentId,
    TestSettings Settings, List<TestQuestion> Questions);
public sealed record StoredAnswer(Guid QuestionId, List<Guid> OptionIds, string? Text, bool Locked = false, int Revision = 0, Guid? OperationId = null);
public sealed record AnswerInteraction(long Sequence, Guid QuestionId, string EventType, DateTimeOffset ServerTimestamp,
    List<Guid> Selected, List<Guid> Deselected, int Revision, int? TextLength = null, bool AfterRevisit = false);

// Definitions and attempt snapshots are bounded JSON documents; array order defines display order.
public sealed class StudentTest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = "";
    public int Grade { get; set; }
    public TestStatus Status { get; set; }
    public string DefinitionJson { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public bool IsDeleted { get; set; }
}
public sealed class TestImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StoredFileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long FileSize { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class TestAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StudentId { get; set; }
    public int AttemptNumber { get; set; }
    public Guid TestId { get; set; }
    public string TokenHash { get; set; } = "";
    public string ParticipantHash { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public int Grade { get; set; }
    public string TestTitle { get; set; } = "";
    public string SnapshotJson { get; set; } = "";
    public string AnswersJson { get; set; } = "[]";
    public string InteractionsJson { get; set; } = "[]";
    public long InteractionSequence { get; set; }
    public Guid? CurrentQuestionId { get; set; }
    public int ProgressRevision { get; set; }
    public AttemptStatus Status { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? Deadline { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public decimal EarnedPoints { get; set; }
    public decimal MaximumPoints { get; set; }
    public decimal Percentage { get; set; }
    public bool? Passed { get; set; }
}

