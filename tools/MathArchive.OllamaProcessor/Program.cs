using System.Net;
using MathArchive.OllamaProcessor.Configuration;
using MathArchive.OllamaProcessor.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddOptions<OllamaOptions>()
    .Bind(builder.Configuration.GetSection(OllamaOptions.SectionName))
    .Validate(options => IsLoopbackHttpUrl(options.BaseUrl), "Ollama:BaseUrl must be an HTTP loopback URL.")
    .Validate(options => !string.IsNullOrWhiteSpace(options.VisionModel), "Ollama:VisionModel is required.")
    .Validate(options => options.TimeoutSeconds is >= 30 and <= 1800, "Ollama:TimeoutSeconds must be from 30 to 1800.")
    .Validate(options => options.MaximumImageBytes is > 0 and <= 50 * 1024 * 1024, "Ollama:MaximumImageBytes must be from 1 byte to 50 MB.")
    .Validate(options => options.ContextWindow is >= 2048 and <= 32768, "Ollama:ContextWindow must be from 2048 to 32768.")
    .Validate(options => options.MaximumOutputTokens is >= 256 and <= 4096, "Ollama:MaximumOutputTokens must be from 256 to 4096.")
    .Validate(options => !string.IsNullOrWhiteSpace(options.KeepAlive), "Ollama:KeepAlive is required.")
    .ValidateOnStart();

builder.Services.Configure<FormOptions>(options =>
{
    var maximumBytes = builder.Configuration.GetValue<long?>("Ollama:MaximumImageBytes") ?? 10 * 1024 * 1024;
    options.MultipartBodyLengthLimit = maximumBytes + 1024 * 1024;
});
builder.Services.AddSingleton<AnalysisValidator>();
builder.Services.AddSingleton<ImageUploadValidator>();
builder.Services.AddHttpClient<OllamaClient>((serviceProvider, client) =>
{
    var configured = serviceProvider.GetRequiredService<IOptions<OllamaOptions>>().Value;
    client.BaseAddress = new Uri(configured.BaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
    client.Timeout = Timeout.InfiniteTimeSpan;
});

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/status", async (OllamaClient client, CancellationToken cancellationToken) =>
    Results.Ok(await client.GetStatusAsync(cancellationToken)));

app.MapPost("/api/analyze", async (
    IFormFile file,
    ImageUploadValidator imageValidator,
    OllamaClient client,
    IWebHostEnvironment environment,
    CancellationToken cancellationToken) =>
{
    try
    {
        imageValidator.Validate(file);
        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream((int)file.Length);
        await stream.CopyToAsync(buffer, cancellationToken);
        var bytes = buffer.ToArray();
        ImageUploadValidator.ValidateSignature(bytes, file.ContentType);

        var result = await client.AnalyzeAsync(
            bytes,
            file.ContentType,
            includeRawResponse: environment.IsDevelopment(),
            cancellationToken);
        return Results.Ok(result);
    }
    catch (InvalidImageException exception)
    {
        return Results.Problem(title: "Некоректне зображення", detail: exception.Message, statusCode: 400);
    }
    catch (AnalysisValidationException exception)
    {
        return Results.Problem(
            title: "Результат не пройшов перевірку",
            detail: string.Join(" ", exception.Errors),
            statusCode: 502);
    }
    catch (OllamaException exception)
    {
        var statusCode = exception.Kind switch
        {
            OllamaErrorKind.Unavailable => 503,
            OllamaErrorKind.ModelMissing => 424,
            OllamaErrorKind.Timeout => 504,
            OllamaErrorKind.Cancelled => 499,
            _ => 502
        };
        return Results.Problem(title: "Помилка Ollama", detail: exception.Message, statusCode: statusCode);
    }
}).DisableAntiforgery();

app.Run();

static bool IsLoopbackHttpUrl(string value)
{
    if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttp)
    {
        return false;
    }

    if (uri.IsLoopback)
    {
        return true;
    }

    return IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address);
}

public partial class Program;
