using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using MathArchive.Application.Ai;
using MathArchive.Infrastructure.Seed;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace MathArchive.Application.Tests.Integration;

[Collection(SecurityIntegrationCollection.Name)]
public sealed class AiMaterialAnalysisSecurityIntegrationTests
{
    [Fact]
    public async Task Analyze_RequiresAuthenticatedAdministrator()
    {
        using var environment = RequiredEnvironment.Apply();
        await using var factory = CreateFactory("Production", new StubMaterialAnalysisService());
        using var anonymous = factory.CreateClient();
        using var forbidden = CreateAuthenticatedClient(factory, includeAdminRole: false);

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsync("/api/admin/materials/analyze", Content())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await forbidden.PostAsync("/api/admin/materials/analyze", Content())).StatusCode);
    }

    [Fact]
    public async Task Analyze_AllowsTwentyRequestsAndRejectsTwentyFirst()
    {
        using var environment = RequiredEnvironment.Apply();
        var analysisService = new StubMaterialAnalysisService();
        await using var factory = CreateFactory("Production", analysisService);
        using var client = CreateAuthenticatedClient(factory, includeAdminRole: true);

        for (var requestNumber = 1; requestNumber <= 20; requestNumber++)
        {
            using var response = await client.PostAsync("/api/admin/materials/analyze", Content());
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        using var rejected = await client.PostAsync("/api/admin/materials/analyze", Content());
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal(20, analysisService.CallCount);
    }

    [Fact]
    public async Task Swagger_IsAvailableOnlyInDevelopment()
    {
        using var environment = RequiredEnvironment.Apply();
        await using var productionFactory = CreateFactory("Production");
        using var production = productionFactory.CreateClient();
        using var productionResponse = await production.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.NotFound, productionResponse.StatusCode);

        await using var developmentFactory = CreateFactory("Development");
        using var development = developmentFactory.CreateClient();
        using var developmentResponse = await development.GetAsync("/swagger/v1/swagger.json");
        Assert.True(
            developmentResponse.StatusCode == HttpStatusCode.OK,
            await developmentResponse.Content.ReadAsStringAsync());
    }

    private static WebApplicationFactory<Program> CreateFactory(
        string environment,
        IMaterialAnalysisService? analysisService = null)
    {
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureServices(services =>
            {
                var developmentSeeder = services.SingleOrDefault(descriptor =>
                    descriptor.ServiceType == typeof(IHostedService) &&
                    descriptor.ImplementationType == typeof(DevelopmentSeedData));
                if (developmentSeeder is not null)
                {
                    services.Remove(developmentSeeder);
                }
            });
            if (analysisService is not null)
            {
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<IMaterialAnalysisService>();
                    services.AddSingleton(analysisService);
                });
            }
        });
    }

    private static HttpClient CreateAuthenticatedClient(
        WebApplicationFactory<Program> factory,
        bool includeAdminRole)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", CreateToken(includeAdminRole));
        return client;
    }

    private static string CreateToken(bool includeAdminRole)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestSigningKey));
        var claims = new List<Claim> { new(ClaimTypes.Name, "security-test-user") };
        if (includeAdminRole)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Admin"));
        }

        var token = new JwtSecurityToken(
            issuer: "MathArchive",
            audience: "MathArchive",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(30),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static MultipartFormDataContent Content()
    {
        var file = new ByteArrayContent([0xff, 0xd8, 0xff, 0x00]);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return new MultipartFormDataContent { { file, "file", "scan.jpg" } };
    }

    private const string TestSigningKey = "security-test-signing-key-for-matharchive-32-chars";
    private const string TestAdminPasswordHash =
        "PBKDF2-SHA256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    private sealed class RequiredEnvironment : IDisposable
    {
        private readonly Dictionary<string, string?> previousValues;

        private RequiredEnvironment(Dictionary<string, string?> previousValues)
        {
            this.previousValues = previousValues;
        }

        public static RequiredEnvironment Apply()
        {
            var values = new Dictionary<string, string?>
            {
                ["AllowedOrigins__0"] = "https://example.com",
                ["Jwt__Issuer"] = "MathArchive",
                ["Jwt__Audience"] = "MathArchive",
                ["Jwt__SigningKey"] = TestSigningKey,
                ["Admin__Username"] = "admin",
                ["Admin__PasswordHash"] = TestAdminPasswordHash,
                ["ConnectionStrings__DefaultConnection"] =
                    "Host=localhost;Port=5432;Database=matharchive;Username=matharchive;Password=matharchive",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            };
            var previous = values.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
            foreach (var (key, value) in values)
            {
                Environment.SetEnvironmentVariable(key, value);
            }

            return new RequiredEnvironment(previous);
        }

        public void Dispose()
        {
            foreach (var (key, value) in previousValues)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }

    private sealed class StubMaterialAnalysisService : IMaterialAnalysisService
    {
        public int CallCount { get; private set; }

        public Task<MaterialAnalysisResult> AnalyzeAsync(
            MathArchive.Application.Files.UploadedFile file,
            string? adminId,
            CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(new MaterialAnalysisResult(
                "Похідна", 10, "Похідна", "Theory", "Правила диференціювання.",
                new FieldConfidence(1, 1, 1, 1), false));
        }
    }
}

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class SecurityIntegrationCollection
{
    public const string Name = "Security integration tests";
}
