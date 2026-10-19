using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Infrastructure.Auth;
using MathArchive.Infrastructure.Persistence;
using MathArchive.Infrastructure.Seed;
using MathArchive.Infrastructure.Storage;
using MathArchive.Infrastructure.Ai;
using MathArchive.Application.Ai;
using MathArchive.Application.Assistant;
using MathArchive.Infrastructure.Assistant;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MathArchive.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<LocalStorageOptions>(configuration.GetSection("FileStorage"));
        services.Configure<AdminOptions>(configuration.GetSection("Admin"));
        services.Configure<JwtOptions>(configuration.GetSection("Jwt"));
        services.Configure<OpenAiOptions>(configuration.GetSection("OpenAI"));
        services.PostConfigure<OpenAiOptions>(options =>
            OpenAiPricingConfiguration.ApplyRootPricing(configuration, options));

        services.AddDbContext<MathArchiveDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));

        services.Configure<AssistantOptions>(configuration.GetSection("Assistant"));
        services.AddSingleton<IAssistantStore, AssistantStore>();
        services.AddSingleton<AssistantAdmission>();
        services.AddHostedService<AssistantAuditRetention>();
        services.AddSingleton<RagIndexLock>();
        services.AddScoped<PaidAiService>();
        services.AddScoped<SearchAgent>();
        services.AddScoped<TutorAgent>();
        services.AddScoped<ExerciseAgent>();
        services.AddScoped<VerifierAgent>();
        services.AddScoped<AssistantOrchestrator>();
        services.AddScoped<IRagSearchService, RagSearchService>();
        services.AddScoped<IRagIndexer, RagIndexer>();
        services.AddHostedService<RagPendingIndexer>();
        services.AddHttpClient<OpenAiAssistantProvider>(client =>
        {
            client.BaseAddress = new Uri("https://api.openai.com/v1/");
            client.Timeout = Timeout.InfiniteTimeSpan;
        });
        services.AddScoped<IAssistantProvider>(sp => sp.GetRequiredService<OpenAiAssistantProvider>());
        services.AddScoped<IEmbeddingService>(sp => sp.GetRequiredService<OpenAiAssistantProvider>());
        services.AddScoped<IRagVisionProvider>(sp => sp.GetRequiredService<OpenAiAssistantProvider>());
        services.AddScoped<IDocumentRepository, DocumentRepository>();
        services.AddScoped<MathArchive.Application.Testing.ITestingRepository, MathArchive.Infrastructure.Testing.TestingRepository>();
        services.AddScoped<MathArchive.Application.Analytics.IAnalyticsRepository, AnalyticsRepository>();
        services.AddScoped<IAiUsageRepository, AiUsageRepository>();
        services.AddHostedService<AiUsageCostBackfillService>();
        services.AddHttpClient<IOpenAiMaterialClient, OpenAiMaterialClient>(client =>
        {
            client.BaseAddress = new Uri("https://api.openai.com/v1/");
            client.Timeout = Timeout.InfiniteTimeSpan;
        });
        services.AddHttpClient<IOpenAiImagePosterClient, OpenAiImagePosterClient>(client =>
        {
            client.BaseAddress = new Uri("https://api.openai.com/v1/");
            client.Timeout = Timeout.InfiniteTimeSpan;
        });
        services.AddScoped<IFileStorage, LocalFileStorage>();
        services.AddKeyedScoped<IFileStorage>("TestImages", (sp, _) => new LocalFileStorage(
            Microsoft.Extensions.Options.Options.Create(new LocalStorageOptions {
                RootPath = Path.Combine(sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<LocalStorageOptions>>().Value.RootPath, "test-images")
            }), sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<LocalFileStorage>>()));
        services.AddScoped<MathArchive.Application.Testing.ITestImageRepository, MathArchive.Infrastructure.Testing.TestImageRepository>();
        services.AddScoped<MathArchive.Application.Testing.ITestImageProcessor, MathArchive.Infrastructure.Testing.TestImageProcessor>();
        services.AddScoped<MathArchive.Application.Testing.TestImageService>();
        services.AddScoped<MathArchive.Application.Testing.IGoogleStudentVerifier, GoogleStudentVerifier>();
        services.AddScoped<MathArchive.Application.Testing.IStudentAccounts, StudentAccounts>();
        services.AddScoped<MathArchive.Application.Testing.StudentTestingService>();
        services.AddSingleton<AdminPasswordHasher>();
        services.AddScoped<JwtTokenService>();
        services.AddScoped<AdminAuthenticationService>();
        services.AddHostedService<DevelopmentSeedData>();

        return services;
    }
}



