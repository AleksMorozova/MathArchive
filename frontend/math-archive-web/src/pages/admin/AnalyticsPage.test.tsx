import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnalytics } from '../../api/analyticsApi';
import { analyticsBoundaries, presetDates } from '../../utils/analyticsDates';
import { AnalyticsPage } from './AnalyticsPage';

vi.mock('../../api/analyticsApi', () => ({ getAnalytics: vi.fn() }));
const empty = { summary: { siteVisits: 0, documentPreviews: 0, documentDownloads: 0 }, documents: [] };
describe('AnalyticsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAnalytics).mockResolvedValue(empty); });
  it('shows zero totals and an empty message for an empty period', async () => {
    renderPage();
    expect(await screen.findByText('За вибраний період немає взаємодій із документами.')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(3);
  });
  it('queries today and a custom inclusive local date range and rejects reversed dates', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Сьогодні' }));
    const today = presetDates(1);
    const range = analyticsBoundaries(today.from, today.to)!;
    await waitFor(() => expect(getAnalytics).toHaveBeenLastCalledWith(range.from, range.to, expect.any(AbortSignal)));
    await user.click(screen.getByRole('button', { name: 'Вибрати дати' }));
    fireEvent.change(screen.getByLabelText('Від'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('До'), { target: { value: '2026-08-02' } });
    const custom = analyticsBoundaries('2026-08-01', '2026-08-02')!;
    await waitFor(() => expect(getAnalytics).toHaveBeenLastCalledWith(custom.from, custom.to, expect.any(AbortSignal)));
    const count = vi.mocked(getAnalytics).mock.calls.length;
    fireEvent.change(screen.getByLabelText('Від'), { target: { value: '2026-08-03' } });
    expect(screen.getByText(/Виберіть коректні дати/)).toBeInTheDocument();
    expect(getAnalytics).toHaveBeenCalledTimes(count);
  });
  it('shows loading, API errors, and supports retry', async () => {
    const user = userEvent.setup();
    vi.mocked(getAnalytics).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(empty);
    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Повторити' }));
    expect(await screen.findByText('За вибраний період немає взаємодій із документами.')).toBeInTheDocument();
  });
  it('shows document activity including zero counters and deleted titles', async () => {
    vi.mocked(getAnalytics).mockResolvedValue({ ...empty, documents: [
      { documentId: '1', title: 'Вектори', previewCount: 0, downloadCount: 2 },
      { documentId: '2', title: null, previewCount: 3, downloadCount: 0 }
    ] });
    renderPage();
    expect(await screen.findByText('Вектори')).toBeInTheDocument();
    expect(screen.getByText('Видалений матеріал')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Завантаження документів')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Завантаження' })).toBeInTheDocument();
    expect(screen.queryByText('Перегляди документів')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Перегляди' })).not.toBeInTheDocument();
  });
});
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><AnalyticsPage /></MemoryRouter></QueryClientProvider>);
}
