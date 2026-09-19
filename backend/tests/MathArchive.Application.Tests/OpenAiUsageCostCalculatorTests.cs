using MathArchive.Application.Ai;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Configuration;

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
