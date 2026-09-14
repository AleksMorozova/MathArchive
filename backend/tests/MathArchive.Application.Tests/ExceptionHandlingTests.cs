using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FluentValidation;
using FluentValidation.Results;
using MathArchive.Api.Errors;
using MathArchive.Application.Documents;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;

using Npgsql;

namespace MathArchive.Application.Tests;

public sealed class ExceptionHandlingTests
{
    [Fact]
    public async Task Missing_physical_file_maps_to_problem_details_not_found()
    {
        var problem = await HandleAsync(new MaterialFileNotFoundException(Guid.NewGuid()));

        Assert.Equal(StatusCodes.Status404NotFound, problem.Status);
        Assert.Equal("Material file not found", problem.Title);
        Assert.Equal("The file associated with this material is unavailable.", problem.Detail);
        Assert.True(problem.Extensions.ContainsKey("traceId"));
    }

    [Fact]
    public async Task Validation_exception_maps_to_validation_problem_details()
    {
        var exception = new ValidationException([
            new FluentValidation.Results.ValidationFailure("Title", "Title is required."),
            new FluentValidation.Results.ValidationFailure("Grade", "Grade is invalid.")
        ]);

        var problem = await HandleAsync(exception);

        var validationProblem = Assert.IsType<ValidationProblemDetails>(problem);
        Assert.Equal(StatusCodes.Status400BadRequest, validationProblem.Status);
        Assert.Equal("One or more validation errors occurred.", validationProblem.Title);
        Assert.Contains("Title", validationProblem.Errors.Keys);
        Assert.Contains("Grade", validationProblem.Errors.Keys);
    }

    [Fact]
    public async Task Concurrency_exception_maps_to_conflict()
    {
        var problem = await HandleAsync(new DbUpdateConcurrencyException());

        Assert.Equal(StatusCodes.Status409Conflict, problem.Status);
        Assert.Equal("Conflict", problem.Title);
    }

    [Fact]
    public async Task Duplicate_database_exception_maps_to_conflict()
    {
        var exception = new DbUpdateException("Duplicate key.", new PostgresException("duplicate key value violates unique constraint", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation));

        var problem = await HandleAsync(exception);

        Assert.Equal(StatusCodes.Status409Conflict, problem.Status);
        Assert.Equal("Conflict", problem.Title);
        Assert.DoesNotContain("duplicate key", problem.Detail, StringComparison.OrdinalIgnoreCase);
    }
    [Fact]
    public async Task Malformed_request_exception_maps_to_bad_request()
    {
        var problem = await HandleAsync(new BadHttpRequestException("Malformed JSON body."));

        Assert.Equal(StatusCodes.Status400BadRequest, problem.Status);
        Assert.Equal("Bad request", problem.Title);
        Assert.DoesNotContain("Malformed JSON body", problem.Detail, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Unexpected_exception_maps_to_safe_internal_server_error_without_internal_details()
    {
        var problem = await HandleAsync(new InvalidOperationException("database password is secret"));

        Assert.Equal(StatusCodes.Status500InternalServerError, problem.Status);
        Assert.Equal("An error occurred while processing your request.", problem.Title);
        Assert.Equal("An unexpected server error occurred.", problem.Detail);
    }

    [Fact]
    public async Task Operation_canceled_maps_to_client_closed_request()
    {
        var problem = await HandleAsync(new OperationCanceledException());

        Assert.Equal(StatusCodes.Status499ClientClosedRequest, problem.Status);
        Assert.Equal("Request canceled", problem.Title);
    }

    [Fact]
    public async Task Admin_endpoint_without_token_returns_unauthorized_problem_details()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.DeleteAsync($"/api/admin/documents/{Guid.NewGuid()}");
        var problem = await ReadProblemDetailsAsync(response);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Unauthorized", problem.GetProperty("title").GetString());
        Assert.Equal(401, problem.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task Admin_endpoint_with_authenticated_non_admin_token_returns_forbidden_problem_details()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(includeAdminRole: false));

        var response = await client.DeleteAsync($"/api/admin/documents/{Guid.NewGuid()}");
        var problem = await ReadProblemDetailsAsync(response);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Forbidden", problem.GetProperty("title").GetString());
        Assert.Equal(403, problem.GetProperty("status").GetInt32());
    }

    private static async Task<ProblemDetails> HandleAsync(Exception exception)
    {
        var problemDetailsService = new RecordingProblemDetailsService();
        var handler = new GlobalExceptionHandler(problemDetailsService, NullLogger<GlobalExceptionHandler>.Instance);
        var context = new DefaultHttpContext();
        context.TraceIdentifier = "test-trace-id";
        context.Request.Path = "/api/test";
        context.Response.Body = new MemoryStream();

        var handled = await handler.TryHandleAsync(context, exception, CancellationToken.None);

        Assert.True(handled);
        Assert.NotNull(problemDetailsService.ProblemDetails);
        Assert.Equal(context.Response.StatusCode, problemDetailsService.ProblemDetails.Status);
        Assert.Equal("/api/test", problemDetailsService.ProblemDetails.Instance);
        return problemDetailsService.ProblemDetails;
    }

    private static WebApplicationFactory<Program> CreateFactory()
    {
        Environment.SetEnvironmentVariable("AllowedOrigins__0", "https://example.com");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "MathArchive");
        Environment.SetEnvironmentVariable("Jwt__Audience", "MathArchive");
        Environment.SetEnvironmentVariable("Jwt__SigningKey", TestSigningKey);
        Environment.SetEnvironmentVariable("Admin__Username", "admin");
        Environment.SetEnvironmentVariable("Admin__PasswordHash", TestAdminPasswordHash);
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", "Host=localhost;Port=5432;Database=matharchive;Username=matharchive;Password=matharchive");
        Environment.SetEnvironmentVariable("Database__ApplyMigrationsOnStartup", "false");

        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
    }

    private static async Task<JsonElement> ReadProblemDetailsAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(body);
        return document.RootElement.Clone();
    }

    private static string CreateToken(bool includeAdminRole)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestSigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim> { new(ClaimTypes.Name, "teacher") };
        if (includeAdminRole)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Admin"));
        }

        var token = new JwtSecurityToken(
            issuer: "MathArchive",
            audience: "MathArchive",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(30),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private const string TestSigningKey = "test-signing-key-for-matharchive-at-least-32-chars";
    private const string TestAdminPasswordHash = "PBKDF2-SHA256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    private sealed class RecordingProblemDetailsService : IProblemDetailsService
    {
        public ProblemDetails? ProblemDetails { get; private set; }

        public ValueTask WriteAsync(ProblemDetailsContext context)
        {
            ProblemDetails = context.ProblemDetails;
            return ValueTask.CompletedTask;
        }

        public ValueTask<bool> TryWriteAsync(ProblemDetailsContext context)
        {
            ProblemDetails = context.ProblemDetails;
            return ValueTask.FromResult(true);
        }
    }
}

