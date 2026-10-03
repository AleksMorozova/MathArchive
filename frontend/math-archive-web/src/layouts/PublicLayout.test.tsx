import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askAssistant, getAssistantStatus } from '../api/aiApi';
import { PublicLayout } from './PublicLayout';

vi.mock('../api/aiApi', () => ({ askAssistant: vi.fn(), getAssistantStatus: vi.fn() }));
vi.mock('../api/analyticsApi', () => ({ trackSiteVisit: vi.fn() }));
function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/materials']}><Routes>
    <Route element={<PublicLayout />}><Route path="/materials" element={<main data-testid="normal-page">Навчальні матеріали <Link to="/about">Читати про сайт</Link></main>} />
      <Route path="/about" element={<div>Про вчителя</div>} /><Route path="/materials/real-id" element={<div>Сторінка матеріалу</div>} /></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return client;
}
describe('public assistant chat', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAssistantStatus).mockResolvedValue({ enabled: true, maxPromptLength: 2000 }); });
  it('removes Assistant from navigation and shows an enabled, labelled floating launcher', async () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Основна навігація' });
    expect(within(nav).queryByRole('link', { name: 'AI-помічник' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'AI-помічник' })).toHaveAttribute('aria-haspopup', 'dialog');
  });
  it('does not show a button or placeholder for disabled assistant', async () => {
    vi.mocked(getAssistantStatus).mockResolvedValue({ enabled: false, maxPromptLength: 2000 });
    renderLayout(); await waitFor(() => expect(getAssistantStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'AI-помічник' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('normal-page')).toBeInTheDocument();
  });
  it('does not advertise availability before status resolves', async () => {
    let complete!: (value: { enabled: boolean; maxPromptLength: number }) => void;
    vi.mocked(getAssistantStatus).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    renderLayout();
    expect(screen.queryByRole('button', { name: 'AI-помічник' })).not.toBeInTheDocument();
    complete({ enabled: false, maxPromptLength: 2000 });
    await waitFor(() => expect(getAssistantStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'AI-помічник' })).not.toBeInTheDocument();
  });
  it('hides launcher on status error and on a later disabled status', async () => {
    const client = renderLayout();
    await screen.findByRole('button', { name: 'AI-помічник' });
    vi.mocked(getAssistantStatus).mockRejectedValue(new Error('private provider error'));
    await client.invalidateQueries({ queryKey: ['assistant', 'status'] });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'AI-помічник' })).not.toBeInTheDocument());
    expect(screen.queryByText('private provider error')).not.toBeInTheDocument();
    vi.mocked(getAssistantStatus).mockResolvedValue({ enabled: false, maxPromptLength: 2000 });
    await client.invalidateQueries({ queryKey: ['assistant', 'status'] });
    expect(screen.queryByRole('button', { name: 'AI-помічник' })).not.toBeInTheDocument();
  });
  it('opens by keyboard, closes with Escape and restores launcher focus without navigating', async () => {
    renderLayout(); const user = userEvent.setup();
    const launcher = await screen.findByRole('button', { name: 'AI-помічник' });
    act(() => launcher.focus()); await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'AI-помічник' })).toBeInTheDocument();
    const close = await screen.findByRole('button', { name: 'Закрити AI-помічника' });
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('normal-page')).toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });
  it('preserves drafts and responses when closed, reopened and browsing another public page', async () => {
    vi.mocked(askAssistant).mockResolvedValue({ requestId: 'id', answer: '**Натуральні числа** — для лічби.', generalKnowledge: false, sources: [] });
    renderLayout();
    fireEvent.click(await screen.findByRole('button', { name: 'AI-помічник' }));
    const input = await screen.findByLabelText('Твоє запитання', {}, { timeout: 10000 });
    fireEvent.change(input, { target: { value: 'Поясни натуральні числа' } });
    fireEvent.click(screen.getByRole('button', { name: 'Закрити AI-помічника' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('link', { name: 'Читати про сайт' }));
    fireEvent.click(screen.getByRole('button', { name: 'AI-помічник' }));
    expect(await screen.findByLabelText('Твоє запитання', {}, { timeout: 10000 })).toHaveValue('Поясни натуральні числа');
    fireEvent.click(screen.getByRole('button', { name: 'Запитати' }));
    expect(await screen.findByText('Натуральні числа')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрити AI-помічника' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Про вчителя')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI-помічник' }));
    expect(await screen.findByText('Натуральні числа')).toBeInTheDocument();
    expect(askAssistant).toHaveBeenCalledTimes(1);
  });
  it('opens real sources in the current page and minimizes chat while preserving its answer', async () => {
    vi.mocked(askAssistant).mockResolvedValue({ requestId: 'id', answer: 'Знайдено матеріал.', generalKnowledge: false,
      sources: [{ materialId: 'real-id', title: 'Натуральні числа', grade: 5, topic: 'Числа', url: '/materials/real-id' }] });
    renderLayout(); fireEvent.click(await screen.findByRole('button', { name: 'AI-помічник' }));
    fireEvent.change(await screen.findByLabelText('Твоє запитання', {}, { timeout: 10000 }), { target: { value: 'Знайди матеріал' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запитати' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Натуральні числа · 5 клас' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Сторінка матеріалу')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI-помічник' }));
    expect(await screen.findByText('Знайдено матеріал.')).toBeInTheDocument();
  });
  it('uses a full-screen closeable dialog on a mobile viewport', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes('max-width'), media: query,
      onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    try {
      renderLayout(); fireEvent.click(await screen.findByRole('button', { name: 'AI-помічник' }));
      const dialog = await screen.findByRole('dialog', { name: 'AI-помічник' });
      expect(dialog).toHaveClass('MuiDialog-paperFullScreen');
      expect(await screen.findByLabelText('Твоє запитання', {}, { timeout: 10000 })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Закрити AI-помічника' })).toBeInTheDocument();
    } finally { window.matchMedia = original; }
  });
});
