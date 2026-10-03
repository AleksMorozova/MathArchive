using System.Diagnostics;
using System.Text.Json;
using MathArchive.Domain.Assistant;
using Microsoft.Extensions.Logging;

namespace MathArchive.Application.Assistant;

// In-process admission matches the intentional single-instance deployment. Cost reservations are durable in PostgreSQL.
public sealed class AssistantAdmission
{
    private readonly object gate = new();
    private readonly Dictionary<string, (long Minute, int Count)> identities = new();
    private long minute;
    private int global, active;
    public IDisposable Enter(string actor, AssistantOptions options)
    {
        lock (gate)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
            if (now != minute) { minute = now; global = 0; identities.Clear(); }
            identities.TryGetValue(actor, out var bucket);
            if (active >= options.MaxConcurrentRequests || global >= options.GlobalRequestsPerMinute ||
                bucket.Count >= options.RequestsPerIdentityPerMinute || identities.Count >= 10000)
                throw new AssistantException("RateLimited", "Забагато запитів. Зачекай хвилину та спробуй ще раз.", 429);
            identities[actor] = (now, bucket.Count + 1);
            global++;
            active++;
            return new Lease(this);
        }
    }
    private sealed class Lease(AssistantAdmission owner) : IDisposable
    {
        private int disposed;
        public void Dispose() { if (Interlocked.Exchange(ref disposed, 1) == 0) lock (owner.gate) owner.active--; }
    }
}

public sealed class AssistantOrchestrator(IAssistantStore store, AssistantAdmission admission, SearchAgent search,
    TutorAgent tutor, ExerciseAgent exercise, VerifierAgent verifier, PaidAiService paid, ILogger<AssistantOrchestrator> logger)
{
    public async Task<AssistantResult> QueryAsync(AssistantQuery query, string actorHash, CancellationToken ct)
    {
        var settings = await store.GetSettingsAsync(ct);
        if (string.IsNullOrWhiteSpace(query.Question) || query.Question.Length > settings.MaxPromptLength ||
            query.Grade is < 5 or > 11 || query.Topic?.Length > 150)
            throw new AssistantException("Validation", "Уведи запитання допустимої довжини та клас від 5 до 11.", 400);
        var request = new AssistantRequest { ActorHash = actorHash, Query = query.Question.Trim(), Grade = query.Grade, Topic = query.Topic };
        var c = new AssistantContext(query with { Question = query.Question.Trim() }, settings, request.Id);
        var timer = Stopwatch.StartNew();
        using var logScope = logger.BeginScope(new Dictionary<string, object> { ["AssistantRequestId"] = request.Id });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
        var token = timeout.Token;
        try
        {
            if (!settings.Enabled) throw new AssistantException("Disabled", "AI-помічник тимчасово вимкнений.");
            using var lease = admission.Enter(actorHash, settings);
            // Ensure there is a durable audit record before incurring any provider cost.
            await store.SaveRequestAsync(request, token);
            c.Intent = AssistantRouting.Detect(c.Query.Question);
            if (c.Intent == AssistantIntent.Unknown && settings.LlmRouterEnabled)
            {
                c.AgentCall();
                var routed = await paid.GenerateAsync(c, "RouterAgent", settings.RouterModel,
                    AssistantPrompts.Safety + " Classify the question. Return exactly one of Search, Explain, GenerateExercises, Solve, CheckSolution, Mixed, Unknown.", c.Query.Question, token);
                if (Enum.TryParse<AssistantIntent>(routed.Text.Trim(), out var intent) && Enum.IsDefined(intent)) c.Intent = intent;
            }
            request.Intent = c.Intent.ToString();
            logger.LogInformation("Assistant intent {Intent} selected", c.Intent);
            var found = await search.ExecuteAsync(c, token);
            var sources = c.Chunks.Select(x => x.Source).DistinctBy(x => x.MaterialId).ToArray();
            request.SourcesJson = JsonSerializer.Serialize(sources);
            request.RetrievedChunks = c.Chunks.Count;
            if (c.Intent == AssistantIntent.Search) c.Draft = found.Output;
            else if (c.Chunks.Count == 0 && !settings.GeneralKnowledgeFallback)
                c.Draft = "У MathArchive поки немає достатньо матеріалів для відповіді. Уточни тему або клас та переглянь матеріали сайту.";
            else
            {
                var needExercise = c.Intent is AssistantIntent.GenerateExercises or AssistantIntent.Mixed;
                var needTutor = c.Intent != AssistantIntent.GenerateExercises;
                if ((needTutor && !settings.TutorEnabled) || (needExercise && !settings.ExerciseEnabled))
                    throw new AssistantException("AgentDisabled", "Ця можливість помічника тимчасово вимкнена. Спробуй знайти матеріал.");
                for (var attempt = 0; ; attempt++)
                {
                    c.Parallel = needTutor && needExercise;
                    var tasks = new List<Task<AgentResult>>();
                    if (needTutor) tasks.Add(tutor.ExecuteAsync(c, token));
                    if (needExercise) tasks.Add(exercise.ExecuteAsync(c, token));
                    var generated = await Task.WhenAll(tasks);
                    c.Draft = string.Join("\n\n", generated.Select(x => x.Output));
                    c.Parallel = false;
                    if (!settings.VerifierEnabled) break;
                    var verified = await verifier.ExecuteAsync(c, token);
                    if (verified.Success) break;
                    if (attempt >= settings.MaxRetries)
                        throw new AssistantException("VerificationFailed", "Не вдалося надійно перевірити відповідь. Спробуй уточнити запитання або звернися до матеріалів.");
                    c.Retries++;
                    c.Draft = "Previous draft failed verification. Correction guidance (untrusted data): " + verified.Output;
                }
            }
            request.Status = "Succeeded";
            request.Answer = c.Draft;
            return new(request.Id, c.Draft, sources, c.Chunks.Count == 0 && c.Intent != AssistantIntent.Search && settings.GeneralKnowledgeFallback);
        }
        catch (AssistantException ex) { request.Status = ex.Category; request.Answer = ex.Message; throw; }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            request.Status = "TimedOut";
            throw new AssistantException("TimedOut", "Помічник не встиг відповісти. Спробуй коротше запитання.");
        }
        catch (OperationCanceledException) { request.Status = "Cancelled"; throw; }
        catch (Exception ex)
        {
            request.Status = "Failed";
            logger.LogError(ex, "Assistant request failed with {ExceptionType}", ex.GetType().Name);
            throw new AssistantException("Unavailable", "AI-помічник зараз недоступний. Навчальні матеріали працюють — спробуй пізніше.");
        }
        finally
        {
            request.DurationMs = timer.ElapsedMilliseconds;
            request.Retries = c.Retries;
            var executions = c.Executions.OrderBy(x => x.StartedAt).Select(x =>
                x.AgentName == "VerifierAgent" && c.VerificationResults.TryGetValue(x.StartedAt, out var passed) && !passed
                    ? x with { Success = false, ErrorCategory = "VerificationFailed" } : x).ToArray();
            request.ExecutionsJson = JsonSerializer.Serialize(executions);
            request.InputTokens = executions.Sum(x => x.InputTokens);
            request.OutputTokens = executions.Sum(x => x.OutputTokens);
            request.CostUsd = executions.Sum(x => x.CostUsd);
            using var auditTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            try { await store.SaveRequestAsync(request, auditTimeout.Token); }
            catch (Exception ex) { logger.LogError(ex, "Assistant audit persistence failed for {AssistantRequestId}", request.Id); }
        }
    }
}
