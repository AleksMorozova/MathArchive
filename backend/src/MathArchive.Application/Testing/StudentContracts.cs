using MathArchive.Application.Common;
using MathArchive.Domain.Testing;
namespace MathArchive.Application.Testing;

public sealed record StudentLogin(string FirstName, string LastName, int Grade, string Pin);
public sealed record StudentRegistration(string FirstName, string LastName, int Grade, string Pin, string ConfirmPin);
public sealed record StudentProfile(Guid Id, string FirstName, string LastName, int Grade, DateTimeOffset CreatedAt, DateTimeOffset? LastLoginAt, bool IsActive, List<string>? AuthenticationMethods = null);
public sealed record VerifiedGoogleStudent(string Subject, string? FirstName, string? LastName);
public sealed record GoogleStudentProfile(string FirstName, string LastName, int Grade);
public interface IGoogleStudentVerifier { Task<VerifiedGoogleStudent> VerifyAsync(string credential, string clientId, string nonce, CancellationToken ct); }
public sealed record StudentIdentity(StudentProfile Profile, Guid SessionVersion);
public sealed record StudentFilter(string? Search = null, int? Grade = null, int Page = 1, int PageSize = 20);
public sealed record StudentHistoryRow(Guid Id, Guid TestId, string TestTitle, int AttemptNumber, AttemptStatus Status,
    DateTimeOffset StartedAt, DateTimeOffset? CompletedAt, decimal? EarnedPoints, decimal? MaximumPoints, decimal? Percentage, bool? Passed);
public sealed record StudentTestAccess(Guid? ResumeAttemptId, Guid? PreviousAttemptId, bool CanStart);
public sealed record StudentSummary(StudentProfile Student, int CompletedAttempts, int CompletedTests, decimal? AveragePercentage);
public sealed record AttemptPerformance(Guid? StudentId, Guid TestId, string StudentName, string TestTitle, int Attempts,
    decimal FirstPercentage, decimal LatestPercentage, decimal BestPercentage);
public sealed record StudentTestingStatistics(int RegisteredStudents, int ActiveStudents, int UniqueStudents, int CompletedAttempts,
    decimal AveragePercentage, List<AttemptPerformance> Performance);
public interface IStudentAccounts
{
    Task<StudentIdentity?> GoogleLoginAsync(string subject, CancellationToken ct);
    Task<StudentIdentity> RegisterGoogleAsync(VerifiedGoogleStudent google, GoogleStudentProfile input, CancellationToken ct);
    Task<StudentIdentity> LinkGoogleAsync(Guid studentId, Guid sessionVersion, string subject, CancellationToken ct);
    Task<StudentIdentity> RegisterAsync(StudentRegistration input, CancellationToken ct);
    Task<StudentIdentity> LoginAsync(StudentLogin input, CancellationToken ct);
    Task<StudentIdentity?> FindAsync(Guid id, CancellationToken ct);
    Task<PagedResult<StudentProfile>> ListAsync(StudentFilter filter, CancellationToken ct);
    Task ResetPinAsync(Guid id, string pin, CancellationToken ct);
    Task RevokeSessionsAsync(Guid id, CancellationToken ct);
    Task SetActiveAsync(Guid id, bool active, CancellationToken ct);
    Task<(int Registered, int Active)> CountsAsync(CancellationToken ct);
}


