using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Infrastructure.Auth;
using MathArchive.Infrastructure.Persistence;
using MathArchive.Infrastructure.Seed;
using MathArchive.Infrastructure.Storage;
using MathArchive.Infrastructure.Ai;
using MathArchive.Application.Ai;
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

        services.AddDbContext<MathArchiveDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));

        services.AddScoped<IDocumentRepository, DocumentRepository>();
        services.AddScoped<MathArchive.Application.Analytics.IAnalyticsRepository, AnalyticsRepository>();
        services.AddScoped<IAiUsageRepository, AiUsageRepository>();
        services.AddHttpClient<IOpenAiMaterialClient, OpenAiMaterialClient>(client =>
        {
            client.BaseAddress = new Uri("https://api.openai.com/v1/");
            client.Timeout = Timeout.InfiniteTimeSpan;
        });
        services.AddScoped<IFileStorage, LocalFileStorage>();
        services.AddSingleton<AdminPasswordHasher>();
        services.AddScoped<JwtTokenService>();
        services.AddScoped<AdminAuthenticationService>();
        services.AddHostedService<DevelopmentSeedData>();

        return services;
    }
}
