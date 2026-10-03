import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/aiApi';
import { analyticsBoundaries, presetDates } from '../../utils/analyticsDates';
import { AssistantAdminPage } from './AssistantAdminPage';
import type { AssistantSettings } from '../../types/assistant';
vi.mock('../../api/aiApi', () => ({ getAssistantSettings: vi.fn(), getAssistantDailyBudget: vi.fn(), getAssistantStatistics: vi.fn(), getAssistantRequests: vi.fn(), getRagStatus: vi.fn(), getAssistantRequest: vi.fn(), saveAssistantSettings: vi.fn(), reindexRag: vi.fn(), saveRagText: vi.fn() }));
const settings: AssistantSettings = { enabled: true, ragEnabled: true, tutorEnabled: true, exerciseEnabled: true, verifierEnabled: true, generalKnowledgeFallback: false, llmRouterEnabled: false, tutorModel: '', exerciseModel: '', verifierModel: '', routerModel: '', embeddingModel: 'embed', topK: 4, minimumRelevance: 0.35, chunkCharacters: 2800, chunkOverlapCharacters: 300, maxDocumentCharacters: 150000, maxPromptLength: 2000, maxInputTokens: 100000, maxOutputTokens: 1200, maxAgentCalls: 8, maxLlmCalls: 6, maxRetries: 1, timeoutSeconds: 60, maxRequestCostUsd: 0.05, dailyBudgetUsd: 1, requestsPerIdentityPerMinute: 40, globalRequestsPerMinute: 120, maxConcurrentRequests: 30, retentionDays: 30 };
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AssistantAdminPage /></QueryClientProvider>);
describe('AssistantAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAssistantSettings).mockResolvedValue(settings);
    vi.mocked(api.getAssistantDailyBudget).mockResolvedValue({ budgetUsd: 1, estimatedCommittedUsd: 0.2, remainingUsd: 0.8, exhausted: false, percentConsumed: 20, dayBoundary: 'UTC' });
    vi.mocked(api.getAssistantStatistics).mockResolvedValue({ requests: 0, succeeded: 0, failed: 0, rateLimited: 0, budgetRejected: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, averageDurationMs: 0, llmCalls: 0, ragSearches: 0, activeUsers: 0, retries: 0, retrievedChunks: 0, agents: [] });
    vi.mocked(api.getAssistantRequests).mockResolvedValue([]);
    vi.mocked(api.getRagStatus).mockResolvedValue({ indexedMaterials: 0, totalChunks: 0, failedMaterials: 0, lastIndexingTime: null, lastFullReindex: null, embedding: null, pending: [] });
    vi.mocked(api.reindexRag).mockResolvedValue();
  });
  it('requires confirmation before reindexing', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Переіндексувати RAG' }));
    expect(api.reindexRag).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Підтвердити' }));
    await waitFor(() => expect(api.reindexRag).toHaveBeenCalledTimes(1));
  });
  it('uses the same selected range for statistics and recent requests', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Останні 7 днів' }));
    const dates = presetDates(7); const range = analyticsBoundaries(dates.from, dates.to)!;
    await waitFor(() => expect(api.getAssistantStatistics).toHaveBeenCalledWith(range, expect.any(AbortSignal)));
    expect(api.getAssistantRequests).toHaveBeenCalledWith(range, 1, expect.any(AbortSignal));
  });
});
