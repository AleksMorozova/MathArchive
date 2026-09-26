import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAiUsageHistory, getAiUsageSummary } from '../../api/aiApi';
import { analyticsBoundaries } from '../../utils/analyticsDates';
import { AiUsagePage } from './AiUsagePage';

vi.mock('../../api/aiApi', () => ({
  getAiUsageSummary: vi.fn(),
  getAiUsageHistory: vi.fn()
}));

const summary = {
  requestsForPeriod: 2,
  succeeded: 1,
  failed: 1,
  inputTokens: 6440,
  outputTokens: 442,
  totalTokens: 6882,
  estimatedCostUsd: 0.0009092,
  averageDurationMilliseconds: 250,
  monthlyWarningLimitUsd: 5,
  limitUsagePercent: 0,
  limitReached: false,
  isBlocked: false
};

const history = { items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 };

describe('AiUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAiUsageSummary).mockResolvedValue(summary);
    vi.mocked(getAiUsageHistory).mockResolvedValue(history);
  });

  it('shows selected-period labels and preserves small cost values', async () => {
    renderPage();

    expect(await screen.findByText('Запитів за вибраний період')).toBeInTheDocument();
    expect(screen.getByText('Орієнтовна вартість за вибраний період')).toBeInTheDocument();
    expect(screen.getByText('$0.0009092')).toBeInTheDocument();
    expect(screen.queryByText('Запитів за сьогодні')).not.toBeInTheDocument();
    expect(screen.queryByText('Запитів за місяць')).not.toBeInTheDocument();
  });

  it('uses the same inclusive date range and additional filters for summary and history', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Запитів за вибраний період');

    fireEvent.change(screen.getByLabelText('Від'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('До'), { target: { value: '2026-09-11' } });
    await user.click(screen.getByLabelText('Статус'));
    await user.click(screen.getByRole('option', { name: 'Помилка' }));
    await user.type(screen.getByLabelText('Модель'), 'gpt-5.6-luna');
    await user.click(screen.getByLabelText('Операція'));
    await user.click(screen.getByRole('option', { name: 'Аналіз матеріалу' }));

    const range = analyticsBoundaries('2026-09-10', '2026-09-11')!;
    const aggregateFilters = {
      from: range.from,
      to: range.to,
      status: 'Failed',
      model: 'gpt-5.6-luna',
      operation: 'MaterialAnalysis'
    };
    await waitFor(() => expect(getAiUsageSummary).toHaveBeenLastCalledWith(
      aggregateFilters, expect.any(AbortSignal)
    ));
    expect(getAiUsageHistory).toHaveBeenLastCalledWith(
      { ...aggregateFilters, page: 1, pageSize: 20 }, expect.any(AbortSignal)
    );
  });

  it('shows an unpriced unknown model as not calculated without failing', async () => {
    vi.mocked(getAiUsageSummary).mockResolvedValue({ ...summary, estimatedCostUsd: null });
    vi.mocked(getAiUsageHistory).mockResolvedValue({
      ...history,
      items: [{
        id: 'usage-1', startedAt: '2026-09-11T12:00:00Z', operation: 'MaterialAnalysis',
        model: 'unknown-model', status: 'Succeeded', inputTokens: 10, outputTokens: 20,
        totalTokens: 30, durationMilliseconds: 100, estimatedCostUsd: null
      }],
      totalCount: 1,
      totalPages: 1
    });

    renderPage();

    expect(await screen.findByText('unknown-model')).toBeInTheDocument();
    expect(screen.getAllByText('Не розраховано')).toHaveLength(2);
  });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><AiUsagePage /></QueryClientProvider>);
}
