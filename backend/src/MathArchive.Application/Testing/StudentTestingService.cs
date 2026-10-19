using MathArchive.Domain.Testing;
using MathArchive.Application.Common;
namespace MathArchive.Application.Testing;

// Account-scoped access reuses the existing immutable snapshots, grading and report repository.
public sealed class StudentTestingService(ITestingRepository repository, TestingService testing, IStudentAccounts accounts, IClock clock)
{
    public async Task<AttemptCredentials> StartAsync(Guid testId, Guid studentId, CancellationToken ct)
    {
        var s = (await accounts.FindAsync(studentId, ct))?.Profile;
        if (s is null || !s.IsActive) throw new TestingException(401, "Увійдіть для тестування.");
        return await testing.StartAsync(testId, new(s.FirstName, s.LastName, s.Grade, s.Id.ToString()), ct, s.Id);
    }
    public async Task<List<StudentHistoryRow>> HistoryAsync(Guid studentId, CancellationToken ct)
    {
        var rows = await repository.ReportAttemptsAsync(new(StudentId: studentId), ct);
        return rows.OrderByDescending(a => a.StartedAt).Select(a => {
            var visible = a.Status != AttemptStatus.InProgress && TestingService.Definition(a.SnapshotJson).Settings.ShowScore;
            return new StudentHistoryRow(a.Id, a.TestId, a.TestTitle, a.AttemptNumber, a.Status, a.StartedAt, a.CompletedAt,
                visible ? a.EarnedPoints : null, visible ? a.MaximumPoints : null, visible ? a.Percentage : null, visible ? a.Passed : null);
        }).ToList();
    }
    public async Task<StudentTestAccess> AccessAsync(Guid testId, Guid studentId, CancellationToken ct)
    {
        var rows = await repository.ReportAttemptsAsync(new(TestId: testId, StudentId: studentId), ct);
        var active = rows.FirstOrDefault(a => a.Status == AttemptStatus.InProgress);
        var previous = rows.Where(a => a.Status != AttemptStatus.InProgress).OrderByDescending(a => a.AttemptNumber).FirstOrDefault();
        var test = await repository.FindTestAsync(testId, ct);
        var settings = test is null ? null : TestingService.Definition(test.DefinitionJson).Settings;
        var available = test is { IsDeleted: false, Status: TestStatus.Published } && settings is not null &&
            !(settings.AvailableFrom > clock.UtcNow || settings.AvailableTo <= clock.UtcNow);
        return new(active?.Id, previous?.Id, active is null && available && (settings!.AllowRepeats || previous is null));
    }
    public async Task<StudentSummary> SummaryAsync(Guid studentId, CancellationToken ct)
    {
        var student = (await accounts.FindAsync(studentId, ct))?.Profile ?? throw new TestingException(404, "Учня не знайдено.");
        var rows = (await repository.ReportAttemptsAsync(new(StudentId: studentId), ct)).Where(a => a.Status != AttemptStatus.InProgress).ToList();
        return new(student, rows.Count, rows.Select(a => a.TestId).Distinct().Count(), rows.Count == 0 ? null : rows.Average(a => a.Percentage));
    }
    public async Task<StudentTestingStatistics> StatisticsAsync(AttemptFilter filter, CancellationToken ct)
    {
        TestingService.ValidateFilter(filter);
        var rows = (await repository.ReportAttemptsAsync(filter, ct)).Where(a => a.Status != AttemptStatus.InProgress).ToList();
        var counts = await accounts.CountsAsync(ct);
        var performance = rows.Where(a => a.StudentId.HasValue).GroupBy(a => new { a.StudentId, a.TestId }).Select(g => {
            var ordered = g.OrderBy(a => a.AttemptNumber).ToList(); var last = ordered[^1];
            return new AttemptPerformance(g.Key.StudentId, g.Key.TestId, last.FirstName + " " + last.LastName, last.TestTitle, ordered.Count,
                ordered[0].Percentage, last.Percentage, ordered.Max(a => a.Percentage));
        }).OrderBy(p => p.StudentName).ThenBy(p => p.TestTitle).ToList();
        return new(counts.Registered, counts.Active, rows.Where(a => a.StudentId.HasValue).Select(a => a.StudentId).Distinct().Count(), rows.Count,
            rows.Count == 0 ? 0 : rows.Average(a => a.Percentage), performance);
    }
}
