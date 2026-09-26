using MathArchive.Application.Ai;
using Microsoft.Extensions.Configuration;

namespace MathArchive.Infrastructure.Ai;

public static class OpenAiPricingConfiguration
{
    public static void ApplyRootPricing(IConfiguration configuration, OpenAiOptions options)
    {
        var merged = new Dictionary<string, OpenAiModelPricing>(StringComparer.OrdinalIgnoreCase);
        foreach (var (model, pricing) in options.Pricing)
        {
            var normalizedModel = model.Trim();
            if (normalizedModel.Length > 0) merged[normalizedModel] = pricing;
        }

        var rootPricing = configuration.GetSection("Pricing")
            .Get<Dictionary<string, OpenAiModelPricing>>();
        if (rootPricing is not null)
        {
            foreach (var (model, pricing) in rootPricing)
            {
                var normalizedModel = model.Trim();
                if (normalizedModel.Length > 0) merged[normalizedModel] = pricing;
            }
        }

        options.Pricing = merged;
    }
}
