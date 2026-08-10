using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using MathArchive.Application.Files;
using MathArchive.Infrastructure.Auth;
using MathArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace MathArchive.Application.Tests.Integration;

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class ApiIntegrationCollection : ICollectionFixture<ApiIntegrationFixture>
{
    public const string Name = "ApiIntegration";
}

public sealed class ApiIntegrationFixture : IAsyncLifetime
{
    private const string AdminPassword = "admin-password";
    private const string JwtSigningKey = "integration-test-signing-key-for-matharchive-32-chars";
    private readonly string databaseName = $"matharchive_it_{Guid.NewGuid():N}";
    private readonly string storageRoot = Path.Combine(Path.GetTempPath(), $"matharchive-it-{Guid.NewGuid():N}");
    private WebApplicationFactory<Program>? factory;

    public string ConnectionString { get; private set; } = string.Empty;
    public string StorageRoot => storageRoot;

    public JsonSerializerOptions JsonOptions { get; } = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public async Task InitializeAsync()
    {
        var baseConnectionString = GetBaseConnectionString();
        ConnectionString = BuildDatabaseConnectionString(baseConnectionString, databaseName);

        await CreateDatabaseAsync(baseConnectionString, databaseName);
        Directory.CreateDirectory(storageRoot);

        factory = CreateFactory(ConnectionString, storageRoot);
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        await dbContext.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        if (factory is not null)
        {
            await factory.DisposeAsync();
        }

        await DropDatabaseAsync(GetBaseConnectionString(), databaseName);

        if (Directory.Exists(storageRoot))
        {
            Directory.Delete(storageRoot, recursive: true);
        }
    }


    public async Task ResetAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        await dbContext.Documents.ExecuteDeleteAsync();

        if (Directory.Exists(storageRoot))
        {
            foreach (var file in Directory.EnumerateFiles(storageRoot))
            {
                File.Delete(file);
            }
        }
    }
    public HttpClient CreateClient()
    {
        return Factory.CreateClient();
    }

    public async Task<HttpClient> CreateAuthorizedClientAsync()
    {
        var client = CreateClient();
        var response = await client.PostAsync(
            "/api/auth/login",
            JsonContent.Create(new { username = "admin", password = AdminPassword }));
        response.EnsureSuccessStatusCode();

        var login = await response.Content.ReadFromJsonAsync<LoginResponseForTests>(JsonOptions)
            ?? throw new InvalidOperationException("Login response was empty.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.Token);
        return client;
    }

    public HttpClient CreateForbiddenClient()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(includeAdminRole: false));
        return client;
    }

    public async Task<int> CountDocumentsAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        return await dbContext.Documents.CountAsync();
    }

    public async Task<MathArchive.Domain.Documents.Document?> FindDocumentAsync(Guid id)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MathArchiveDbContext>();
        return await dbContext.Documents.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
    }

    public WebApplicationFactory<Program> CreateFactoryWithStorageFailure(IFileStorage storage)
    {
        return CreateFactory(ConnectionString, storageRoot, services =>
        {
            services.RemoveAll<IFileStorage>();
            services.AddScoped(_ => storage);
        });
    }

    public WebApplicationFactory<Program> CreateFactoryWithConnectionString(string connectionString, string fileStorageRoot)
    {
        return CreateFactory(connectionString, fileStorageRoot);
    }

    private WebApplicationFactory<Program> Factory => factory ?? throw new InvalidOperationException("Fixture is not initialized.");

    private static WebApplicationFactory<Program> CreateFactory(
        string connectionString,
        string fileStorageRoot,
        Action<IServiceCollection>? configureServices = null)
    {
        SetRequiredEnvironment(connectionString, fileStorageRoot);

        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Production");
                builder.ConfigureServices(services => configureServices?.Invoke(services));
            });
    }

    private static void SetRequiredEnvironment(string connectionString, string fileStorageRoot)
    {
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", connectionString);
        Environment.SetEnvironmentVariable("AllowedOrigins__0", "https://example.com");
        Environment.SetEnvironmentVariable("FileStorage__RootPath", fileStorageRoot);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "MathArchive");
        Environment.SetEnvironmentVariable("Jwt__Audience", "MathArchive");
        Environment.SetEnvironmentVariable("Jwt__SigningKey", JwtSigningKey);
        Environment.SetEnvironmentVariable("Admin__Username", "admin");
        Environment.SetEnvironmentVariable("Admin__PasswordHash", new AdminPasswordHasher().Hash(AdminPassword));
    }

    private static string GetBaseConnectionString()
    {
        return Environment.GetEnvironmentVariable("MATHARCHIVE_TEST_CONNECTION_STRING")
            ?? "Host=127.0.0.1;Port=5433;Database=postgres;Username=matharchive;Password=matharchive";
    }

    private static string BuildDatabaseConnectionString(string baseConnectionString, string database)
    {
        var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
        {
            Database = database,
            Pooling = false
        };
        return builder.ConnectionString;
    }

    private static async Task CreateDatabaseAsync(string baseConnectionString, string database)
    {
        await using var connection = new NpgsqlConnection(BuildDatabaseConnectionString(baseConnectionString, "postgres"));
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"CREATE DATABASE \"{database}\"";
        await command.ExecuteNonQueryAsync();
    }

    private static async Task DropDatabaseAsync(string baseConnectionString, string database)
    {
        try
        {
            await using var connection = new NpgsqlConnection(BuildDatabaseConnectionString(baseConnectionString, "postgres"));
            await connection.OpenAsync();

            await using (var terminate = connection.CreateCommand())
            {
                terminate.CommandText = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = @database";
                terminate.Parameters.AddWithValue("database", database);
                await terminate.ExecuteNonQueryAsync();
            }

            await using var drop = connection.CreateCommand();
            drop.CommandText = $"DROP DATABASE IF EXISTS \"{database}\"";
            await drop.ExecuteNonQueryAsync();
        }
        catch
        {
            // Best-effort cleanup for integration test databases.
        }
    }

    private static string CreateToken(bool includeAdminRole)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSigningKey));
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

    private sealed record LoginResponseForTests(string Token);
}
