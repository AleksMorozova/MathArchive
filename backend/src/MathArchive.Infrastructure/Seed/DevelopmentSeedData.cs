using MathArchive.Domain.Documents;
using MathArchive.Infrastructure.Persistence;
using MathArchive.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace MathArchive.Infrastructure.Seed;

public sealed class DevelopmentSeedData(
    IServiceProvider serviceProvider,
    IHostEnvironment environment,
    IOptions<LocalStorageOptions> storageOptions) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment())
        {
            return;
        }

        using var scope = serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();

        await dbContext.Database.MigrateAsync(cancellationToken);

        if (await dbContext.Documents.AnyAsync(cancellationToken))
        {
            return;
        }

        var storageRoot = Path.GetFullPath(storageOptions.Value.RootPath);
        Directory.CreateDirectory(storageRoot);

        var createdAt = DateTimeOffset.UtcNow.AddDays(-14);
        var documents = new[]
        {
            Create("Формули скороченого множення", "Коротка добірка формул для повторення алгебри.", 7, "Алгебра", DocumentType.Formula, "formulas.pdf", "seed-formulas.pdf", createdAt),
            Create("Контрольна робота з алгебри", "Завдання для тематичного оцінювання.", 8, "Алгебра", DocumentType.Test, "algebra-test.pdf", "seed-algebra-test.pdf", createdAt.AddDays(2)),
            Create("Самостійна робота: лінійні рівняння", "Варіанти самостійної роботи з відповідями.", 7, "Лінійні рівняння", DocumentType.IndependentWork, "linear-equations.pdf", "seed-linear-equations.pdf", createdAt.AddDays(5)),
            Create("Основні властивості трикутників", "Теоретичний матеріал з геометрії.", 8, "Геометрія", DocumentType.Theory, "triangles.pdf", "seed-triangles.pdf", createdAt.AddDays(8)),
            Create("Підсумкова контрольна робота", "Підсумкові завдання за навчальний рік.", 9, "Повторення", DocumentType.Test, "final-test.pdf", "seed-final-test.pdf", createdAt.AddDays(10))
        };

        foreach (var document in documents)
        {
            var filePath = Path.Combine(storageRoot, document.StoredFileName);
            if (!File.Exists(filePath))
            {
                await File.WriteAllBytesAsync(filePath, MinimalPdfBytes(document.Title), cancellationToken);
            }
        }

        dbContext.Documents.AddRange(documents);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static Document Create(string title, string description, int grade, string topic, DocumentType type, string originalFileName, string storedFileName, DateTimeOffset createdAt)
    {
        return new Document(title, description, grade, topic, type, originalFileName, storedFileName, "application/pdf", 256, createdAt);
    }

    private static byte[] MinimalPdfBytes(string title)
    {
        var escapedTitle = title.Replace("(", "\\(", StringComparison.Ordinal).Replace(")", "\\)", StringComparison.Ordinal);
        var content = $"""
            %PDF-1.4
            1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
            2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
            3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
            4 0 obj << /Length 64 >> stream
            BT /F1 18 Tf 72 720 Td ({escapedTitle}) Tj ET
            endstream endobj
            trailer << /Root 1 0 R >>
            %%EOF
            """;
        return System.Text.Encoding.UTF8.GetBytes(content);
    }
}
