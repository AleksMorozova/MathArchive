using FluentValidation;
using MathArchive.Application.Common;
using MathArchive.Application.Documents;
using MathArchive.Application.Files;
using Microsoft.Extensions.DependencyInjection;

namespace MathArchive.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<DocumentService>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IValidator<DocumentMetadata>, DocumentMetadataValidator>();
        services.AddScoped<IValidator<UploadedFile>, UploadedFileValidator>();

        return services;
    }
}
