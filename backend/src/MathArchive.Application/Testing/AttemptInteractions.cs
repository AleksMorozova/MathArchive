using System.Text.Json;
using MathArchive.Domain.Testing;
namespace MathArchive.Application.Testing;

// Auxiliary, bounded metadata only. Grading continues to read AnswersJson exclusively.
public static class AttemptInteractions
{
    public const int Limit = 1000;
    public static List<AnswerInteraction> Read(TestAttempt attempt, DateTimeOffset now)
    {
        if ((attempt.CompletedAt ?? attempt.StartedAt).AddDays(180) <= now) { attempt.InteractionsJson = "[]"; return []; }
        return JsonSerializer.Deserialize<List<AnswerInteraction>>(attempt.InteractionsJson) ?? [];
    }
    public static void Add(TestAttempt attempt, Guid questionId, string type, DateTimeOffset now,
        IEnumerable<Guid>? selected = null, IEnumerable<Guid>? deselected = null, int revision = 0, int? textLength = null)
    {
        if (!TestingService.Definition(attempt.SnapshotJson).Settings.TrackAnswerChanges) return;
        var events = Read(attempt, now);
        if (attempt.InteractionSequence >= Limit || (attempt.CompletedAt ?? attempt.StartedAt).AddDays(180) <= now) return;
        var afterRevisit = (type == "OptionsChanged" || type == "TextRevised") && events.LastOrDefault(e => e.QuestionId == questionId &&
            (e.EventType == "QuestionVisited" || e.EventType == "QuestionRevisited"))?.EventType == "QuestionRevisited";
        events.Add(new(++attempt.InteractionSequence, questionId, type, now, selected?.ToList() ?? [], deselected?.ToList() ?? [], revision, textLength, afterRevisit));
        attempt.InteractionsJson = TestingService.Serialize(events);
    }
    public static void Changed(TestAttempt attempt, TestQuestion question, StoredAnswer? previous, StoredAnswer answer, DateTimeOffset now)
    {
        var changed = previous?.Text != answer.Text || !(previous?.OptionIds ?? []).ToHashSet().SetEquals(answer.OptionIds);
        if (changed) Add(attempt, question.Id, question.Type == QuestionType.Text ? "TextRevised" : "OptionsChanged", now,
            answer.OptionIds.Except(previous?.OptionIds ?? []), (previous?.OptionIds ?? []).Except(answer.OptionIds), answer.Revision,
            question.Type == QuestionType.Text ? answer.Text?.Length ?? 0 : null);
        if (answer.Locked && previous?.Locked != true) Add(attempt, question.Id, "AnswerConfirmed", now, revision: answer.Revision);
    }
}
