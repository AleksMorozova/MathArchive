using System.Text;
using System.Text.Json.Serialization;
using FluentValidation;
using MathArchive.Application;
using MathArchive.Infrastructure;
using MathArchive.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Net.Http.Headers;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

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
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
});

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

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseCors("Frontend");

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "MathArchive.Api",
    timestamp = DateTimeOffset.UtcNow
})).AllowAnonymous();
app.MapControllers();

app.Run();

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

