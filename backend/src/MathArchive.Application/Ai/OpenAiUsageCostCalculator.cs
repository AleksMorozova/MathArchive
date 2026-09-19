using Microsoft.Extensions.Options;

namespace MathArchive.Application.Ai;

public sealed class OpenAiUsageCostCalculator(IOptions<OpenAiOptions> options) : IOpenAiUsageCostCalculator
{
    public decimal? Calculate(string model, int? inputTokens, int? outputTokens)
    {
        if (!inputTokens.HasValue || !outputTokens.HasValue || inputTokens < 0 || outputTokens < 0 ||
            string.IsNullOrWhiteSpace(model)) return null;

        var pricing = options.Value.Pricing
            .FirstOrDefault(entry => string.Equals(entry.Key.Trim(), model.Trim(), StringComparison.OrdinalIgnoreCase)).Value;
        if (pricing is null || pricing.InputPerMillionTokensUsd <= 0 || pricing.OutputPerMillionTokensUsd <= 0)
            return null;

        return decimal.Round(
            inputTokens.Value / 1_000_000m * pricing.InputPerMillionTokensUsd +
            outputTokens.Value / 1_000_000m * pricing.OutputPerMillionTokensUsd, 8);
    }
}
