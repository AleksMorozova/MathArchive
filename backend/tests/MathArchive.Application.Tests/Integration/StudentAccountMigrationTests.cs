using MathArchive.Application.Testing;
using MathArchive.Domain.Testing;
using MathArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
namespace MathArchive.Application.Tests.Integration;

[Collection(ApiIntegrationCollection.Name)]
public sealed class StudentAccountMigrationTests(ApiIntegrationFixture fixture)
{
    [Fact] public async Task Upgrade_preserves_anonymous_history_without_claiming_it_by_name()
    {
        var name = "matharchive_migration_" + Guid.NewGuid().ToString("N");
        var connection = new NpgsqlConnectionStringBuilder(fixture.ConnectionString) { Database = "postgres", Pooling = false };
        await using var control = new NpgsqlConnection(connection.ConnectionString); await control.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", control)) await create.ExecuteNonQueryAsync();
        try
        {
            connection.Database = name;
            await using var db = new MathArchiveDbContext(new DbContextOptionsBuilder<MathArchiveDbContext>().UseNpgsql(connection.ConnectionString).Options);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20261016190045_AddTestImages");
            var testId = Guid.NewGuid(); var attemptId = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
            var question = new TestQuestion(Guid.NewGuid(), "2+2?", QuestionType.SingleChoice, 3, "Пояснення", [new(Guid.NewGuid(), "4", true), new(Guid.NewGuid(), "5", false)], []);
            var definition = TestingService.Serialize(new TestDefinition("Історичний тест", null, 5, null, new(), [question]));
            var answers = TestingService.Serialize(new List<StoredAnswer> { new(question.Id, [question.Options[0].Id], null) });
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO student_tests ("Id","Title","Grade","Status","DefinitionJson","CreatedAt","UpdatedAt","IsDeleted")
                VALUES ({testId},'Історичний тест',5,'Archived',{definition}::jsonb,{now},{now},true)
                """);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO test_attempts ("Id","TestId","TokenHash","ParticipantHash","FirstName","LastName","Grade","TestTitle",
                  "SnapshotJson","AnswersJson","Status","StartedAt","Deadline","CompletedAt","EarnedPoints","MaximumPoints","Percentage","Passed")
                VALUES ({attemptId},{testId},'old-hash','old-browser','Олена','Тестова',5,'Історичний тест',
                  {definition}::jsonb,{answers}::jsonb,'Completed',{now},NULL,{now},3,3,100,true)
                """);
            await migrator.MigrateAsync("20261016202814_StudentAccounts");
            var pinStudent = new Student { FirstName = "Іван", LastName = "Історичний", NormalizedFirstName = "ІВАН", NormalizedLastName = "ІСТОРИЧНИЙ", Grade = 5,
                PasswordHash = new MathArchive.Infrastructure.Auth.AdminPasswordHasher().Hash("Matematyka29", 600_000), CreatedAt = now };
            db.Add(pinStudent); await db.SaveChangesAsync();
            var hashBeforeUpgrade = pinStudent.PasswordHash; var versionBeforeUpgrade = pinStudent.SessionVersion;
            await migrator.MigrateAsync();
            db.ChangeTracker.Clear();
            var preservedStudent = await db.Set<Student>().SingleAsync();
            Assert.Equal(pinStudent.Id, preservedStudent.Id); Assert.Equal(hashBeforeUpgrade, preservedStudent.PasswordHash);
            Assert.Equal(versionBeforeUpgrade, preservedStudent.SessionVersion);
            Assert.Empty(await db.Set<StudentAuthenticationIdentity>().ToListAsync());
            var attempt = await db.Set<TestAttempt>().SingleAsync();
            Assert.Equal(attemptId, attempt.Id); Assert.Null(attempt.StudentId); Assert.Equal(0, attempt.AttemptNumber);
            Assert.Equal(question.Id, TestingService.Definition(attempt.SnapshotJson).Questions.Single().Id);
            Assert.True(TestingService.Definition(attempt.SnapshotJson).Questions.Single().Options[0].IsCorrect);
            Assert.Equal(3, attempt.EarnedPoints); Assert.Equal("old-hash", attempt.TokenHash);
            Assert.Single(await db.Set<Student>().ToListAsync());
            Assert.NotNull((await db.Set<StudentTest>().SingleAsync()).DeletedAt);
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{name}\" WITH (FORCE)", control); await drop.ExecuteNonQueryAsync();
        }
    }
}

