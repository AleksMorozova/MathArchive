using System.Text;
using System.Text.Json.Serialization;
using FluentValidation;
using MathArchive.Api.Errors;
using MathArchive.Api.Health;
using MathArchive.Application;
using MathArchive.Infrastructure;
using MathArchive.Infrastructure.Auth;
using MathArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Net.Http.Headers;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;

if (args is ["hash-password", var password])
{
    Console.WriteLine(new AdminPasswordHasher().Hash(password));
    return;
}

var builder = WebApplication.CreateBuilder(args);

var renderPort = Environment.GetEnvironmentVariable("PORT");
var aspNetCoreUrls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
if (!string.IsNullOrWhiteSpace(renderPort))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{renderPort}");
}
else if (string.IsNullOrWhiteSpace(aspNetCoreUrls))
{
    builder.WebHost.UseUrls("http://0.0.0.0:5293");
}

var allowedOrigins = GetAllowedOrigins(builder.Configuration, builder.Environment.IsDevelopment());
if (!builder.Environment.IsDevelopment() && allowedOrigins.Count == 0)
{
    throw new InvalidOperationException("AllowedOrigins must contain at least one production frontend origin.");
}

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(allowedOrigins.ToArray())
            .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .WithHeaders(HeaderNames.Authorization, HeaderNames.ContentType);
    });
});

var jwtOptions = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.SigningKey))
{
    if (builder.Environment.IsDevelopment())
    {
        jwtOptions.SigningKey = "development-local-signing-key-at-least-32-chars";
    }
    else
    {
        throw new InvalidOperationException("Jwt:SigningKey must be configured.");
    }
}

ValidateAdminConfiguration(builder.Configuration, builder.Environment.IsDevelopment());

var signingKey = Encoding.UTF8.GetBytes(jwtOptions.SigningKey);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(signingKey),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await Results.Problem(
                    title: "Unauthorized",
                    detail: "Authentication is required to access this resource.",
                    statusCode: StatusCodes.Status401Unauthorized).ExecuteAsync(context.HttpContext);
            },
            OnForbidden = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await Results.Problem(
                    title: "Forbidden",
                    detail: "You do not have permission to access this resource.",
                    statusCode: StatusCodes.Status403Forbidden).ExecuteAsync(context.HttpContext);
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
});

builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database")
    .AddCheck<FileStorageHealthCheck>("file_storage");

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "MathArchive API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            []
        }
    });
});

var app = builder.Build();

if (builder.Configuration.GetValue("Database:ApplyMigrationsOnStartup", true))
{
    await MigrateDatabaseAsync(app);
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseCors("Frontend");

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = WriteHealthResponseAsync
}).AllowAnonymous();
app.MapControllers();

app.Run();

static async Task MigrateDatabaseAsync(WebApplication app)
{
    await using var scope = app.Services.CreateAsyncScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
    await dbContext.Database.MigrateAsync();
}

static void ValidateAdminConfiguration(IConfiguration configuration, bool isDevelopment)
{
    if (isDevelopment)
    {
        return;
    }

    var adminOptions = configuration.GetSection("Admin").Get<AdminOptions>() ?? new AdminOptions();
    if (string.IsNullOrWhiteSpace(adminOptions.Username))
    {
        throw new InvalidOperationException("Admin:Username must be configured.");
    }

    if (!IsValidAdminPasswordHash(adminOptions.PasswordHash))
    {
        throw new InvalidOperationException("Admin:PasswordHash must be configured with a valid PBKDF2-SHA256 hash.");
    }
}

static bool IsValidAdminPasswordHash(string? passwordHash)
{
    if (string.IsNullOrWhiteSpace(passwordHash))
    {
        return false;
    }

    var parts = passwordHash.Split('$');
    if (parts is not ["PBKDF2-SHA256", var iterationsText, var saltText, var keyText])
    {
        return false;
    }

    if (!int.TryParse(iterationsText, out var iterations) || iterations <= 0)
    {
        return false;
    }

    try
    {
        return Convert.FromBase64String(saltText).Length == 16
            && Convert.FromBase64String(keyText).Length == 32;
    }
    catch (FormatException)
    {
        return false;
    }
}

static Task WriteHealthResponseAsync(HttpContext context, HealthReport report)
{
    context.Response.ContentType = "application/json";

    var response = new
    {
        status = report.Status.ToString(),
        service = "MathArchive.Api",
        timestamp = DateTimeOffset.UtcNow,
        checks = report.Entries.ToDictionary(
            entry => entry.Key,
            entry => new
            {
                status = entry.Value.Status.ToString(),
                description = entry.Value.Description,
                duration = entry.Value.Duration.TotalMilliseconds
            })
    };

    return context.Response.WriteAsJsonAsync(response);
}
static List<string> GetAllowedOrigins(IConfiguration configuration, bool isDevelopment)
{
    var configuredOrigins = configuration.GetSection("AllowedOrigins").Get<string[]>()
        ?? configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
        ?? [];

    var origins = configuredOrigins
        .Select(NormalizeOrigin)
        .Where(origin => origin is not null)
        .Select(origin => origin!)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();

    if (isDevelopment && origins.Count == 0)
    {
        origins.Add("http://localhost:5173");
        origins.Add("http://127.0.0.1:5173");
    }

    return origins;
}

static string? NormalizeOrigin(string? origin)
{
    var trimmed = origin?.Trim().TrimEnd('/');
    if (string.IsNullOrWhiteSpace(trimmed))
    {
        return null;
    }

    if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) ||
        (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
        !string.IsNullOrWhiteSpace(uri.PathAndQuery.Trim('/')))
    {
        throw new InvalidOperationException($"Allowed origin '{origin}' must be an absolute HTTP(S) origin without a path.");
    }

    return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
}

public partial class Program
{
}

