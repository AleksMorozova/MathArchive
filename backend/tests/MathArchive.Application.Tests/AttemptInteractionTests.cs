using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
namespace MathArchive.Application.Tests;
public sealed class AttemptInteractionTests
{
    private static TestAttempt Attempt(bool enabled = true) => new() { StartedAt = DateTimeOffset.UtcNow,
        SnapshotJson = TestingService.Serialize(new TestDefinition("Тест", null, 5, null, new(TrackAnswerChanges: enabled), [])) };
    [Fact] public void Reaching_the_event_limit_never_changes_the_grading_source()
    {
        var a = Attempt(); a.InteractionSequence = AttemptInteractions.Limit - 1; a.AnswersJson = "[]";
        AttemptInteractions.Add(a, Guid.NewGuid(), "OptionsChanged", DateTimeOffset.UtcNow);
        var json = a.InteractionsJson; AttemptInteractions.Add(a, Guid.NewGuid(), "AnswerConfirmed", DateTimeOffset.UtcNow);
        Assert.Equal(AttemptInteractions.Limit, a.InteractionSequence); Assert.Equal(json, a.InteractionsJson); Assert.Equal("[]", a.AnswersJson);
    }
    [Fact] public void Expired_metadata_is_removed_without_touching_answers_or_results()
    {
        var a = Attempt(); a.StartedAt = DateTimeOffset.UtcNow.AddDays(-182); a.CompletedAt = a.StartedAt.AddHours(1); a.Status = AttemptStatus.Completed;
        a.InteractionsJson = TestingService.Serialize(new[] { new AnswerInteraction(1, Guid.NewGuid(), "QuestionVisited", a.StartedAt, [], [], 0) }); a.EarnedPoints = 7;
        Assert.Empty(AttemptInteractions.Read(a, DateTimeOffset.UtcNow)); Assert.Equal("[]", a.InteractionsJson); Assert.Equal(7, a.EarnedPoints);
    }
    [Fact] public void Disabled_tracking_has_no_auxiliary_event_storage()
    { var a = Attempt(false); AttemptInteractions.Add(a, Guid.NewGuid(), "TextRevised", DateTimeOffset.UtcNow, textLength: 5); Assert.Equal("[]", a.InteractionsJson); Assert.Equal(0, a.InteractionSequence); }
}
