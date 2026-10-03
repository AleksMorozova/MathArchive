using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using MathArchive.Application.Ai;
using MathArchive.Domain.AiUsage;
using Microsoft.Extensions.Options;

namespace MathArchive.Application.Assistant;

public sealed class AssistantContext(AssistantQuery query, AssistantOptions settings, Guid requestId)
{
    private readonly object gate = new();
    private int agents, llmCalls, inputTokens;
    private decimal reservedCost;
    public AssistantQuery Query { get; } = query;
    public AssistantOptions Settings { get; } = settings;
    public Guid RequestId { get; } = requestId;
    public AssistantIntent Intent { get; set; }
    public IReadOnlyList<RetrievedChunk> Chunks { get; set; } = [];
    public ConcurrentQueue<AgentExecution> Executions { get; } = new();
    public ConcurrentDictionary<DateTimeOffset, bool> VerificationResults { get; } = new();
    public string Draft { get; set; } = "";
    public bool Parallel { get; set; }
    public int Retries { get; set; }
    public void AgentCall()
    {
        lock (gate) if (++agents > Settings.MaxAgentCalls) throw Budget();
    }
    public void PaidCall(int input, decimal cost, bool isLlm)
    {
        lock (gate)
        {
            if ((isLlm && llmCalls + 1 > Settings.MaxLlmCalls) || inputTokens + input > Settings.MaxInputTokens ||
                reservedCost + cost > Settings.MaxRequestCostUsd) throw Budget();
            if (isLlm) llmCalls++;
            inputTokens += input;
            reservedCost += cost;
        }
    }
    public static AssistantException Budget() => new("RequestBudget", "Ліміт цього запиту вичерпано. Спробуй коротше запитання.", 429);
}

public sealed class PaidAiService(IAssistantStore store, IAssistantProvider provider, IEmbeddingService embeddings,
    IOpenAiUsageCostCalculator costs, IOptions<OpenAiOptions> openAi)
{
    public string Model(string configured) => string.IsNullOrWhiteSpace(configured) ? openAi.Value.Model : configured;
    public async Task<ProviderResult> GenerateAsync(AssistantContext context, string agent, string configuredModel,
        string instructions, string input, CancellationToken ct)
    {
        var model = Model(configuredModel);
        // UTF-8 byte count is a conservative token upper bound, plus message envelope overhead.
        var upperInput = Encoding.UTF8.GetByteCount(instructions + input) + 256;
        var result = await RunAsync(context, agent, model, upperInput, context.Settings.MaxOutputTokens, true,
            async () => await provider.GenerateAsync(model, instructions, input, context.Settings.MaxOutputTokens, ct), ct);
        if (result.Text.Length > context.Settings.MaxOutputTokens * 16) throw new AssistantException("InvalidResponse", "Не вдалося отримати коректну відповідь.");
        return result;
    }
    public async Task<float[]> EmbedAsync(AssistantContext context, string text, CancellationToken ct)
    {
        if (Encoding.UTF8.GetByteCount(text) > 8000) throw AssistantContext.Budget();
        var result = await RunAsync(context, "Embedding", context.Settings.EmbeddingModel,
            Encoding.UTF8.GetByteCount(text) + 32, 0, false, async () =>
            {
                var embedding = await embeddings.EmbedAsync(context.Settings.EmbeddingModel, text, ct);
                return new ProviderResult(System.Text.Json.JsonSerializer.Serialize(embedding.Vector), embedding.InputTokens, 0);
            }, ct);
        return System.Text.Json.JsonSerializer.Deserialize<float[]>(result.Text)!;
    }
    private async Task<ProviderResult> RunAsync(AssistantContext context, string agent, string model, int upperInput,
        int upperOutput, bool llm, Func<Task<ProviderResult>> call, CancellationToken ct)
    {
        var latest = await store.GetSettingsAsync(ct);
        if (!latest.Enabled) throw new AssistantException("Disabled", "AI-помічник тимчасово вимкнений.");
        if ((agent == "TutorAgent" && !latest.TutorEnabled) || (agent == "ExerciseAgent" && !latest.ExerciseEnabled) ||
            (agent == "VerifierAgent" && !latest.VerifierEnabled) || (agent == "RouterAgent" && !latest.LlmRouterEnabled) ||
            (agent == "Embedding" && !latest.RagEnabled))
            throw new AssistantException("AgentDisabled", "Ця можливість тимчасово вимкнена.");
        var maximum = costs.Calculate(model, upperInput, upperOutput) ??
            throw new AssistantException("PricingUnavailable", "AI-помічник ще налаштовується. Скористайся матеріалами сайту.");
        context.PaidCall(upperInput, maximum, llm);
        var day = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!await store.ReserveAsync(day, maximum, latest.DailyBudgetUsd, ct))
            throw new AssistantException("DailyBudget", "Денний ліміт AI вичерпано. Спробуй завтра або відкрий навчальні матеріали.", 429);
        var started = DateTimeOffset.UtcNow;
        var timer = Stopwatch.StartNew();
        var charged = maximum;
        ProviderResult? result = null;
        string? error = null;
        try
        {
            result = await call();
            charged = costs.Calculate(model, result.InputTokens, result.OutputTokens) ?? maximum;
            await store.SettleAsync(day, maximum, charged, CancellationToken.None);
            return result;
        }
        catch (Exception ex)
        {
            // A timeout/cancellation can still have incurred provider cost; retain the upper reservation.
            error = ex is AssistantException safe ? safe.Category : ex is OperationCanceledException ? "CancelledOrTimeout" : "ProviderFailure";
            throw;
        }
        finally
        {
            context.Executions.Enqueue(new(agent, started, timer.ElapsedMilliseconds, error is null, model,
                result?.InputTokens ?? 0, result?.OutputTokens ?? 0, charged, context.Parallel, error));
        }
    }
}
