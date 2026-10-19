using System.Text;
using System.Text.RegularExpressions;
using MathArchive.Application.Common;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
namespace MathArchive.Infrastructure.Auth;

public sealed class StudentAccounts(MathArchiveDbContext db, AdminPasswordHasher hasher, IClock clock) : IStudentAccounts
{
    private static readonly string DummyHash = new AdminPasswordHasher().Hash(Guid.NewGuid().ToString(), 600_000);
    private static string Clean(string value) => Regex.Replace(value.Trim().Normalize(NormalizationForm.FormKC), @"\s+", " ");
    private static string Normalize(string value) => Clean(value).ToUpperInvariant();
    public static StudentProfile Profile(Student s) => new(s.Id, s.FirstName, s.LastName, s.Grade, s.CreatedAt, s.LastLoginAt, s.IsActive, Methods(s));
    private static List<string> Methods(Student s) => (s.PasswordHash is null ? Enumerable.Empty<string>() : ["PIN"]).Concat(s.AuthenticationIdentities.Select(i => i.Provider)).Distinct().Order().ToList();
    private static void ValidateIdentity(string? first, string? last, int grade)
    {
        if (string.IsNullOrWhiteSpace(first) || first.Length > 100 || string.IsNullOrWhiteSpace(last) || last.Length > 100 || grade is < 5 or > 11 ||
            first.Any(char.IsControl) || last.Any(char.IsControl) || Clean(first).Length > 100 || Clean(last).Length > 100)
            throw new TestingException(400, "Введіть ім’я та прізвище до 100 символів і оберіть клас від 5 до 11.");
    }
    private static void ValidatePin(string? pin)
    {
        if (pin is null || pin.Length is < 8 or > 64 || pin.Any(char.IsWhiteSpace) || pin.Any(char.IsControl) || pin.Distinct().Count() < 3)
            throw new TestingException(400, "PIN-код: 8–64 символи без пробілів, щонайменше 3 різні символи. Можна використовувати цифри та літери.");
    }
    public async Task<StudentIdentity> RegisterAsync(StudentRegistration input, CancellationToken ct)
    {
        ValidateIdentity(input.FirstName, input.LastName, input.Grade); ValidatePin(input.Pin);
        if (input.Pin != input.ConfirmPin) throw new TestingException(400, "PIN-коди не збігаються.");
        var s = new Student { FirstName = Clean(input.FirstName), LastName = Clean(input.LastName), Grade = input.Grade,
            NormalizedFirstName = Normalize(input.FirstName), NormalizedLastName = Normalize(input.LastName),
            PasswordHash = hasher.Hash(input.Pin, 600_000), CreatedAt = clock.UtcNow, LastLoginAt = clock.UtcNow };
        db.Add(s);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { throw new TestingException(409, "Не вдалося зареєструватися з цими даними. Спробуйте увійти або зверніться до вчителя."); }
        return new(Profile(s), s.SessionVersion);
    }
    public async Task<StudentIdentity> LoginAsync(StudentLogin input, CancellationToken ct)
    {
        ValidateIdentity(input.FirstName, input.LastName, input.Grade);
        if (input.Pin is null || input.Pin.Length > 64) throw InvalidLogin();
        var first = Normalize(input.FirstName); var last = Normalize(input.LastName);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var s = await db.Set<Student>().FromSqlInterpolated(
            $"SELECT * FROM students WHERE \"NormalizedFirstName\" = {first} AND \"NormalizedLastName\" = {last} AND \"Grade\" = {input.Grade} AND \"PasswordHash\" IS NOT NULL FOR UPDATE").SingleOrDefaultAsync(ct);
        if (s is null) { hasher.Verify(input.Pin, DummyHash); throw InvalidLogin(); }
        if (s.LockedUntil > clock.UtcNow) { hasher.Verify(input.Pin, DummyHash); throw InvalidLogin(); }
        var valid = hasher.Verify(input.Pin, s.PasswordHash!);
        if (!valid || !s.IsActive)
        {
            s.FailedLogins++;
            if (s.FailedLogins >= 5) { s.LockedUntil = clock.UtcNow.AddMinutes(15); s.FailedLogins = 0; }
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); throw InvalidLogin();
        }
        s.FailedLogins = 0; s.LockedUntil = null; s.LastLoginAt = clock.UtcNow;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        await db.Entry(s).Collection(x => x.AuthenticationIdentities).LoadAsync(ct);
        return new(Profile(s), s.SessionVersion);
    }
    private static TestingException InvalidLogin() => new(401, "Перевірте ім’я, прізвище, клас і PIN-код. Якщо не вдається увійти, зверніться до вчителя.");
    public async Task<StudentIdentity?> FindAsync(Guid id, CancellationToken ct)
    {
        var s = await db.Set<Student>().AsNoTracking().Include(s => s.AuthenticationIdentities).SingleOrDefaultAsync(s => s.Id == id, ct);
        return s is null ? null : new(Profile(s), s.SessionVersion);
    }
    public async Task<PagedResult<StudentProfile>> ListAsync(StudentFilter f, CancellationToken ct)
    {
        if (f.Page < 1 || f.Page > 1000000 || f.PageSize is < 1 or > 100 || f.Grade is < 5 or > 11 || f.Search?.Length > 200)
            throw new TestingException(400, "Перевірте фільтри учнів.");
        var q = db.Set<Student>().AsNoTracking().Include(s => s.AuthenticationIdentities).Where(s => (!f.Grade.HasValue || s.Grade == f.Grade) &&
            (f.Search == null || (s.NormalizedFirstName + " " + s.NormalizedLastName).Contains(Normalize(f.Search)) ||
             (s.NormalizedLastName + " " + s.NormalizedFirstName).Contains(Normalize(f.Search))));
        var count = await q.CountAsync(ct);
        var rows = await q.OrderBy(s => s.LastName).ThenBy(s => s.FirstName).ThenBy(s => s.Id).Skip((f.Page - 1) * f.PageSize).Take(f.PageSize).ToListAsync(ct);
        return new(rows.Select(Profile).ToList(), f.Page, f.PageSize, count, (int)Math.Ceiling((double)count / f.PageSize));
    }
    public async Task ResetPinAsync(Guid id, string pin, CancellationToken ct)
    {
        ValidatePin(pin); var s = await db.Set<Student>().SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw new TestingException(404, "Учня не знайдено.");
        s.PasswordHash = hasher.Hash(pin, 600_000); s.SessionVersion = Guid.NewGuid(); s.FailedLogins = 0; s.LockedUntil = null;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { throw new TestingException(409, "Не вдалося встановити PIN для цих даних. Перевірте обліковий запис учня."); }
    }
    private static void CheckGoogleSubject(string subject)
    {
        if (string.IsNullOrWhiteSpace(subject) || subject.Length > 255) throw InvalidLogin();
    }
    public async Task<StudentIdentity?> GoogleLoginAsync(string subject, CancellationToken ct)
    {
        CheckGoogleSubject(subject);
        var identity = await db.Set<StudentAuthenticationIdentity>().AsNoTracking().SingleOrDefaultAsync(i => i.Provider == "Google" && i.Subject == subject, ct);
        if (identity is null) return null;
        var s = await db.Set<Student>().Include(s => s.AuthenticationIdentities).SingleAsync(s => s.Id == identity.StudentId, ct);
        if (!s.IsActive) throw InvalidLogin();
        s.LastLoginAt = clock.UtcNow; await db.SaveChangesAsync(ct);
        return new(Profile(s), s.SessionVersion);
    }
    private async Task LockGoogleAsync(string subject, CancellationToken ct)
    {
        var key = BitConverter.ToInt64(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes("Google:" + subject)), 0);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})", ct);
    }
    public async Task<StudentIdentity> RegisterGoogleAsync(VerifiedGoogleStudent google, GoogleStudentProfile input, CancellationToken ct)
    {
        CheckGoogleSubject(google.Subject); ValidateIdentity(input.FirstName, input.LastName, input.Grade);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockGoogleAsync(google.Subject, ct);
        var existing = await GoogleLoginAsync(google.Subject, ct);
        if (existing is not null) { await tx.CommitAsync(ct); return existing; }
        // Identical names or emails are never a reason to claim another StudentId.
        var s = new Student { FirstName = Clean(input.FirstName), LastName = Clean(input.LastName), Grade = input.Grade,
            NormalizedFirstName = Normalize(input.FirstName), NormalizedLastName = Normalize(input.LastName), PasswordHash = null,
            CreatedAt = clock.UtcNow, LastLoginAt = clock.UtcNow };
        s.AuthenticationIdentities.Add(new() { Subject = google.Subject, StudentId = s.Id, CreatedAt = clock.UtcNow });
        db.Add(s); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(Profile(s), s.SessionVersion);
    }
    public async Task<StudentIdentity> LinkGoogleAsync(Guid studentId, Guid sessionVersion, string subject, CancellationToken ct)
    {
        CheckGoogleSubject(subject);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockGoogleAsync(subject, ct);
        var s = await db.Set<Student>().FromSqlInterpolated($"SELECT * FROM students WHERE \"Id\" = {studentId} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw InvalidLogin();
        if (!s.IsActive || s.SessionVersion != sessionVersion) throw InvalidLogin();
        await db.Entry(s).Collection(x => x.AuthenticationIdentities).LoadAsync(ct);
        var assigned = await db.Set<StudentAuthenticationIdentity>().SingleOrDefaultAsync(i => i.Provider == "Google" && i.Subject == subject, ct);
        if (assigned is not null && assigned.StudentId != studentId) throw new TestingException(409, "Не вдалося підключити цей Google-акаунт. Облікові записи не було об’єднано.");
        if (s.AuthenticationIdentities.Any(i => i.Provider == "Google" && i.Subject != subject)) throw new TestingException(409, "До профілю вже підключено Google.");
        if (assigned is null) {
            var linked = new StudentAuthenticationIdentity { StudentId = studentId, Subject = subject, CreatedAt = clock.UtcNow };
            db.Add(linked); s.AuthenticationIdentities.Add(linked);
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(Profile(s), s.SessionVersion);
    }
    public async Task RevokeSessionsAsync(Guid id, CancellationToken ct)
    {
        await db.Set<Student>().Where(s => s.Id == id).ExecuteUpdateAsync(s => s.SetProperty(x => x.SessionVersion, Guid.NewGuid()), ct);
    }
    public async Task SetActiveAsync(Guid id, bool active, CancellationToken ct)
    {
        var s = await db.Set<Student>().SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw new TestingException(404, "Учня не знайдено.");
        s.IsActive = active; s.SessionVersion = Guid.NewGuid(); await db.SaveChangesAsync(ct);
    }
    public async Task<(int Registered, int Active)> CountsAsync(CancellationToken ct) =>
        (await db.Set<Student>().CountAsync(ct), await db.Set<Student>().CountAsync(s => s.IsActive, ct));
}



