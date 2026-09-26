using MathArchive.Application.Ai;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Configuration;
using MathArchive.Infrastructure.Ai;

namespace MathArchive.Application.Tests;

public sealed class OpenAiUsageCostCalculatorTests
{
    [Fact]
    public void Calculate_BindsEnvironmentStylePricingKeyAndMatchesModelWithoutCaseOrWhitespaceSensitivity()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["OpenAI:Model"] = "gpt-4o-mini",
            ["OpenAI:Pricing:gpt-4o-mini:InputPerMillionTokensUsd"] = "0.15",
            ["OpenAI:Pricing:gpt-4o-mini:OutputPerMillionTokensUsd"] = "0.60"
        }).Build();
        var options = configuration.GetSection("OpenAI").Get<OpenAiOptions>()!;
        var calculator = new OpenAiUsageCostCalculator(Options.Create(options));

        Assert.Equal(0.00564495m, calculator.Calculate(" GPT-4O-MINI ", 37181, 113));
        Assert.Equal(0m, calculator.Calculate("gpt-4o-mini", 0, 0));
    }

    [Fact]
    public void Calculate_BindsRootEnvironmentPricingForModelNamesWithHyphensAndDots()
    {
        const string prefix = "MATHARCHIVE_PRICING_TEST_";
        const string inputKey = prefix + "Pricing__gpt-5.6-luna__InputPerMillionTokensUsd";
        const string outputKey = prefix + "Pricing__gpt-5.6-luna__OutputPerMillionTokensUsd";
        Environment.SetEnvironmentVariable(inputKey, "0.10");
        Environment.SetEnvironmentVariable(outputKey, "0.60");
        try
        {
            var configuration = new ConfigurationBuilder().AddEnvironmentVariables(prefix).Build();
            var options = new OpenAiOptions();
            OpenAiPricingConfiguration.ApplyRootPricing(configuration, options);
            var calculator = new OpenAiUsageCostCalculator(Options.Create(options));

            Assert.Equal(0.00045460m, calculator.Calculate(" GPT-5.6-LUNA ", 3220, 221));
        }
        finally
        {
            Environment.SetEnvironmentVariable(inputKey, null);
            Environment.SetEnvironmentVariable(outputKey, null);
        }
    }
    [Fact]
    public void Calculate_UsesDecimalConfiguredModelPricing()
    {
        var options = new OpenAiOptions
        {
            Pricing = new Dictionary<string, OpenAiModelPricing>(StringComparer.OrdinalIgnoreCase)
            {
                ["configured-model"] = new() { InputPerMillionTokensUsd = 2.5m, OutputPerMillionTokensUsd = 10m }
            }
        };
        var calculator = new OpenAiUsageCostCalculator(Options.Create(options));

        var cost = calculator.Calculate("configured-model", 100_000, 20_000);

        Assert.Equal(0.45m, cost);
    }

    [Theory]
    [InlineData("unknown-model", 10, 20)]
    [InlineData("configured-model", null, 20)]
    [InlineData("configured-model", 10, null)]
    public void Calculate_ReturnsNullWhenPricingOrUsageIsUnavailable(string model, int? input, int? output)
    {
        var options = new OpenAiOptions
        {
            Pricing = new Dictionary<string, OpenAiModelPricing>
            {
                ["configured-model"] = new() { InputPerMillionTokensUsd = 1m, OutputPerMillionTokensUsd = 1m }
            }
        };
        var calculator = new OpenAiUsageCostCalculator(Options.Create(options));

        Assert.Null(calculator.Calculate(model, input, output));
    }
}
