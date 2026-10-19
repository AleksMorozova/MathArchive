using MathArchive.Application.Common;
using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace MathArchive.Infrastructure.Testing;

public static class TestingModel
{
    public static void Configure(ModelBuilder model)
    {
        var student = model.Entity<Student>(); student.ToTable("students"); student.HasKey(x => x.Id);
        student.Property(x => x.FirstName).HasMaxLength(100); student.Property(x => x.LastName).HasMaxLength(100);
        student.Property(x => x.NormalizedFirstName).HasMaxLength(200); student.Property(x => x.NormalizedLastName).HasMaxLength(200);
        student.Property(x => x.PasswordHash).HasMaxLength(500);
        student.HasIndex(x => new { x.NormalizedFirstName, x.NormalizedLastName, x.Grade }).IsUnique().HasFilter("\"PasswordHash\" IS NOT NULL");
        student.HasIndex(x => x.Grade);
        var identity = model.Entity<StudentAuthenticationIdentity>(); identity.ToTable("student_authentication_identities"); identity.HasKey(x => x.Id);
        identity.Property(x => x.Provider).HasMaxLength(30); identity.Property(x => x.Subject).HasMaxLength(255);
        identity.HasIndex(x => new { x.Provider, x.Subject }).IsUnique();
        identity.HasIndex(x => new { x.StudentId, x.Provider }).IsUnique();
        student.HasMany(x => x.AuthenticationIdentities).WithOne().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
        var image = model.Entity<TestImage>(); image.ToTable("test_images"); image.HasKey(x => x.Id);
        image.Property(x => x.StoredFileName).HasMaxLength(80);
        image.Property(x => x.ContentType).HasMaxLength(30);
        var t = model.Entity<StudentTest>(); t.ToTable("student_tests"); t.HasKey(x => x.Id);
        t.Property(x => x.Title).HasMaxLength(200); t.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        t.Property(x => x.DefinitionJson).HasColumnType("jsonb"); t.HasIndex(x => new { x.IsDeleted, x.Status, x.Grade });
        var a = model.Entity<TestAttempt>(); a.ToTable("test_attempts"); a.HasKey(x => x.Id);
        a.Property(x => x.TokenHash).HasMaxLength(64); a.Property(x => x.ParticipantHash).HasMaxLength(64);
        a.Property(x => x.FirstName).HasMaxLength(100); a.Property(x => x.LastName).HasMaxLength(100); a.Property(x => x.TestTitle).HasMaxLength(200);
        a.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        a.Property(x => x.SnapshotJson).HasColumnType("jsonb"); a.Property(x => x.AnswersJson).HasColumnType("jsonb");
        a.Property(x => x.InteractionsJson).HasColumnType("jsonb");
        a.Property(x => x.EarnedPoints).HasPrecision(12, 2); a.Property(x => x.MaximumPoints).HasPrecision(12, 2); a.Property(x => x.Percentage).HasPrecision(5, 2);
        a.HasOne<Student>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
        a.HasIndex(x => new { x.StudentId, x.TestId, x.AttemptNumber }).IsUnique().HasFilter("\"StudentId\" IS NOT NULL");
        a.HasIndex(x => new { x.StudentId, x.TestId }).IsUnique().HasFilter("\"StudentId\" IS NOT NULL AND \"Status\" = 'InProgress'");
        a.HasOne<StudentTest>().WithMany().HasForeignKey(x => x.TestId).OnDelete(DeleteBehavior.Restrict);
        a.HasIndex(x => new { x.TestId, x.ParticipantHash }); a.HasIndex(x => x.CompletedAt); a.HasIndex(x => x.StartedAt);
    }
}
public sealed class TestingRepository(MathArchiveDbContext db, IClock clock) : ITestingRepository
{
    public Task<List<StudentTest>> ListTestsAsync(bool admin, int? grade, CancellationToken ct) => db.Set<StudentTest>().AsNoTracking()
        .Where(t => !t.IsDeleted && (admin || t.Status == TestStatus.Published) && (!grade.HasValue || t.Grade == grade))
        .OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
    public Task<StudentTest?> FindTestAsync(Guid id, CancellationToken ct) => db.Set<StudentTest>().SingleOrDefaultAsync(t => t.Id == id, ct);
    public async Task SaveTestAsync(StudentTest t, CancellationToken ct)
    { if (db.Entry(t).State == EntityState.Detached) db.Add(t); await db.SaveChangesAsync(ct); }
    public Task<bool> DocumentExistsAsync(Guid id, CancellationToken ct) => db.Documents.AnyAsync(d => d.Id == id, ct);
    public async Task<bool> ImagesExistAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) => ids.Count == 0 || await db.Set<TestImage>().CountAsync(x => ids.Contains(x.Id), ct) == ids.Count;
    public async Task<TestAttempt> CreateAttemptAsync(TestAttempt a, bool allowRepeats, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // The test row serializes starts with deletion/archive and other starts for this small classroom.
        var test = await db.Set<StudentTest>().FromSqlInterpolated($"SELECT * FROM student_tests WHERE \"Id\" = {a.TestId} FOR UPDATE").SingleOrDefaultAsync(ct)
            ?? throw new TestingException(404, "Тест не знайдено.");
        await db.Entry(test).ReloadAsync(ct);
        if (test.IsDeleted || test.Status != TestStatus.Published) throw new TestingException(404, "Тест недоступний.");
        var settings = TestingService.Definition(test.DefinitionJson).Settings;
        if (settings.AvailableFrom > clock.UtcNow || settings.AvailableTo <= clock.UtcNow) throw new TestingException(409, "Тест зараз недоступний.");
        if (a.StudentId.HasValue)
        {
            var previous = await db.Set<TestAttempt>().Where(x => x.StudentId == a.StudentId && x.TestId == a.TestId).OrderByDescending(x => x.AttemptNumber).ToListAsync(ct);
            var active = previous.FirstOrDefault(x => x.Status == AttemptStatus.InProgress);
            if (active is not null)
            {
                if (active.Deadline <= clock.UtcNow) { TestingService.FinalizeAttempt(active, clock.UtcNow, true); await db.SaveChangesAsync(ct); }
                else { await tx.CommitAsync(ct); return active; }
            }
            if (!settings.AllowRepeats && previous.Any(x => x.Status != AttemptStatus.InProgress))
                { await tx.CommitAsync(ct); throw new TestingException(409, "Ви вже проходили цей тест"); }
            a.AttemptNumber = previous.Count == 0 ? 1 : previous.Max(x => x.AttemptNumber) + 1;
        }
        else if (!allowRepeats && await db.Set<TestAttempt>().AnyAsync(x => x.TestId == a.TestId && x.ParticipantHash == a.ParticipantHash, ct))
            throw new TestingException(409, "Повторні спроби в цьому браузері вимкнено. Відновіть попередню спробу.");
        db.Add(a); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return a;
    }
    public async Task DeleteTestAsync(Guid id, DateTimeOffset now, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var test = await db.Set<StudentTest>().FromSqlInterpolated($"SELECT * FROM student_tests WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct)
            ?? throw new TestingException(404, "Тест не знайдено.");
        if (await db.Set<TestAttempt>().AnyAsync(a => a.TestId == id, ct))
        { test.IsDeleted = true; test.Status = TestStatus.Archived; test.DeletedAt = now; test.UpdatedAt = now; }
        else db.Remove(test);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task<T> WithAttemptAsync<T>(Guid id, Func<TestAttempt, T> action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var a = await db.Set<TestAttempt>().FromSqlInterpolated($"SELECT * FROM test_attempts WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct)
            ?? throw new TestingException(404, "Спробу не знайдено.");
        var result = action(a); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return result;
    }
    private IQueryable<TestAttempt> Filter(AttemptFilter f) => db.Set<TestAttempt>().AsNoTracking().Where(a =>
        (!f.StudentId.HasValue || a.StudentId == f.StudentId) && (!f.TestId.HasValue || a.TestId == f.TestId) && (!f.Grade.HasValue || a.Grade == f.Grade) &&
        (!f.Status.HasValue || a.Status == f.Status) && (!f.From.HasValue || (a.CompletedAt ?? a.StartedAt) >= f.From) &&
        (!f.To.HasValue || (a.CompletedAt ?? a.StartedAt) < f.To) &&
        (f.Search == null || (a.FirstName + " " + a.LastName).ToLower().Contains(f.Search.ToLower()) || (a.LastName + " " + a.FirstName).ToLower().Contains(f.Search.ToLower())));
    private async Task ExpireAsync(CancellationToken ct)
    {
        // Expiry is finalized lazily for reporting as well as student requests. No background worker is needed.
        var ids = await db.Set<TestAttempt>().AsNoTracking().Where(a => a.Status == AttemptStatus.InProgress && a.Deadline <= clock.UtcNow).Select(a => a.Id).ToListAsync(ct);
        foreach (var id in ids) await WithAttemptAsync(id, a =>
        {
            if (a.Status != AttemptStatus.InProgress) return false;
            TestingService.FinalizeAttempt(a, clock.UtcNow, true);
            return true;
        }, ct);
    }
    public async Task<PagedResult<AttemptRow>> ListAttemptsAsync(AttemptFilter f, CancellationToken ct)
    {
        await ExpireAsync(ct); var query = Filter(f); var count = await query.CountAsync(ct);
        var ordered = f.Sort switch
        {
            "dateAsc" => query.OrderBy(a => a.CompletedAt ?? a.StartedAt),
            "scoreDesc" => query.OrderByDescending(a => a.Percentage),
            "scoreAsc" => query.OrderBy(a => a.Percentage),
            "name" => query.OrderBy(a => a.LastName).ThenBy(a => a.FirstName),
            _ => query.OrderByDescending(a => a.CompletedAt ?? a.StartedAt)
        };
        var rows = await ordered.ThenBy(a => a.Id).Skip((f.Page - 1) * f.PageSize).Take(f.PageSize).ToListAsync(ct);
        return new(rows.Select(a => new AttemptRow(a.Id, a.TestId, a.TestTitle, a.FirstName, a.LastName, a.Grade, a.Status, a.StartedAt,
            a.CompletedAt, a.EarnedPoints, a.MaximumPoints, a.Percentage, a.Passed, ((a.CompletedAt ?? clock.UtcNow) - a.StartedAt).TotalSeconds, a.StudentId, a.AttemptNumber)).ToList(),
            f.Page, f.PageSize, count, (int)Math.Ceiling((double)count / f.PageSize));
    }
    public async Task<List<TestAttempt>> ReportAttemptsAsync(AttemptFilter f, CancellationToken ct)
    { await ExpireAsync(ct); return await Filter(f).ToListAsync(ct); }
    public async Task<Dictionary<Guid, int>> CompletedCountsAsync(CancellationToken ct)
    {
        await ExpireAsync(ct);
        return await db.Set<TestAttempt>().Where(a => a.Status != AttemptStatus.InProgress)
            .GroupBy(a => a.TestId).ToDictionaryAsync(g => g.Key, g => g.Count(), ct);
    }
}




