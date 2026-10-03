export interface AssistantSettings {
  enabled: boolean; ragEnabled: boolean; tutorEnabled: boolean; exerciseEnabled: boolean;
  verifierEnabled: boolean; generalKnowledgeFallback: boolean; llmRouterEnabled: boolean;
  tutorModel: string; exerciseModel: string; verifierModel: string; routerModel: string; embeddingModel: string;
  topK: number; minimumRelevance: number; chunkCharacters: number; chunkOverlapCharacters: number;
  maxDocumentCharacters: number; maxPromptLength: number; maxInputTokens: number; maxOutputTokens: number;
  maxAgentCalls: number; maxLlmCalls: number; maxRetries: number; timeoutSeconds: number;
  maxRequestCostUsd: number; dailyBudgetUsd: number; requestsPerIdentityPerMinute: number;
  globalRequestsPerMinute: number; maxConcurrentRequests: number; retentionDays: number;
}
export interface AssistantSource { materialId: string; title: string; grade: number | null; topic: string; url: string }
export interface AssistantAnswer { requestId: string; answer: string; sources: AssistantSource[]; generalKnowledge: boolean }
export interface AgentStatistics { agentName: string; calls: number; failures: number; inputTokens: number; outputTokens: number; costUsd: number; averageDurationMs: number }
export interface AssistantStatistics {
  requests: number; succeeded: number; failed: number; rateLimited: number; budgetRejected: number;
  inputTokens: number; outputTokens: number; costUsd: number; averageDurationMs: number; llmCalls: number;
  ragSearches: number; activeUsers: number; retries: number; retrievedChunks: number; agents: AgentStatistics[]; peakConcurrency?: number; intents?: { label: string; requests: number }[]; topics?: { label: string; requests: number }[]; hoursUtc?: { label: string; requests: number }[];
}
export interface AssistantRequestItem { id: string; createdAt: string; queryPreview: string; grade: number | null; intent: string; status: string; inputTokens: number; outputTokens: number; costUsd: number; durationMs: number }
export interface AssistantRequestDetail extends AssistantRequestItem { query: string; answer: string; executionsJson: string; sourcesJson: string; retries: number; retrievedChunks: number }
export interface RagStatus { indexedMaterials: number; totalChunks: number; failedMaterials: number; lastIndexingTime: string | null; lastFullReindex: string | null; embedding: { calls: number; tokens: number; costUsd: number } | null; pending: { materialId: string; title: string; status: string }[] }
export interface DailyBudget { budgetUsd: number; estimatedCommittedUsd: number; remainingUsd: number; exhausted: boolean; percentConsumed: number; dayBoundary: string }
