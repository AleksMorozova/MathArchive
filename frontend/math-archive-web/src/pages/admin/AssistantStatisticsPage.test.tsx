import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../../api/aiApi';
import { analyticsBoundaries, presetDates } from '../../utils/analyticsDates';
import { AssistantStatisticsPage } from './AssistantStatisticsPage';
vi.mock('../../api/aiApi', () => ({ getAssistantStatistics: vi.fn(), getAssistantRequests: vi.fn(), getAssistantRequest: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAssistantStatistics).mockResolvedValue({ requests: 0, succeeded: 0, failed: 0, rateLimited: 0, budgetRejected: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, averageDurationMs: 0, llmCalls: 0, ragSearches: 0, activeUsers: 0, retries: 0, retrievedChunks: 0, agents: [] });
  vi.mocked(api.getAssistantRequests).mockResolvedValue([]);
});
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AssistantStatisticsPage /></QueryClientProvider>);
it('shows standalone reporting and applies the same period to statistics and requests', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Статистика AI-помічника' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Останні 7 днів' }));
  const dates = presetDates(7); const range = analyticsBoundaries(dates.from, dates.to)!;
  await waitFor(() => expect(api.getAssistantStatistics).toHaveBeenCalledWith(range, expect.any(AbortSignal)));
  expect(api.getAssistantRequests).toHaveBeenCalledWith(range, 1, expect.any(AbortSignal));
  expect(await screen.findByText('Запитів за цей період немає.')).toBeInTheDocument();
  const beforeRefresh = vi.mocked(api.getAssistantStatistics).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Оновити' }));
  await waitFor(() => expect(api.getAssistantStatistics).toHaveBeenCalledTimes(beforeRefresh + 1));
});
it('does not fetch an invalid period', async () => {
  renderPage();
  await screen.findByText('Запитів за цей період немає.');
  vi.mocked(api.getAssistantStatistics).mockClear();
  vi.mocked(api.getAssistantRequests).mockClear();
  fireEvent.change(screen.getByLabelText('Від'), { target: { value: '2099-01-01' } });
  expect(screen.getByText('Перевір дати періоду.')).toBeInTheDocument();
  expect(api.getAssistantStatistics).not.toHaveBeenCalled();
  expect(api.getAssistantRequests).not.toHaveBeenCalled();
});
