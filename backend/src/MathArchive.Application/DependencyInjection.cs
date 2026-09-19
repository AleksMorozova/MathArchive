using FluentValidation;
using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using MathArchive.Application.StorageAudit;
using MathArchive.Application.Ai;
using Microsoft.Extensions.DependencyInjection;

namespace MathArchive.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<DocumentService>();
        services.AddScoped<Analytics.AnalyticsService>();
        services.AddScoped<IValidator<Analytics.RecordAnalyticsEvent>, Analytics.RecordAnalyticsEventValidator>();
        services.AddScoped<StorageAuditService>();
        services.AddScoped<IMaterialAnalysisService, MaterialAnalysisService>();
        services.AddScoped<AiUsageService>();
        services.AddSingleton<IOpenAiUsageCostCalculator, OpenAiUsageCostCalculator>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IValidator<DocumentMetadata>, DocumentMetadataValidator>();
        services.AddScoped<IValidator<UploadedFile>, UploadedFileValidator>();

        return services;
    }
}
