import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askAssistant, getAssistantStatus } from '../api/aiApi';
import { ApiError } from '../api/apiErrors';
import { AssistantPage } from './AssistantPage';

vi.mock('../api/aiApi', () => ({ askAssistant: vi.fn(), getAssistantStatus: vi.fn() }));
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AssistantPage /></MemoryRouter></QueryClientProvider>);
describe('AssistantPage', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAssistantStatus).mockResolvedValue({ enabled: true, maxPromptLength: 2000 }); });
  it('disabled assistant blocks submission and offers materials', async () => {
    vi.mocked(getAssistantStatus).mockResolvedValue({ enabled: false, maxPromptLength: 2000 });
    renderPage();
    expect(await screen.findByText(/AI-помічник тимчасово вимкнений/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запитати' })).toBeDisabled();
    expect(askAssistant).not.toHaveBeenCalled();
  });
  it('prevents duplicates while pending and shows actual source links', async () => {
    let complete!: (value: Awaited<ReturnType<typeof askAssistant>>) => void;
    vi.mocked(askAssistant).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Твоє запитання')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Твоє запитання'), { target: { value: 'Поясни похідну' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запитати' }));
    expect(await screen.findByRole('button', { name: 'Готуємо відповідь…' })).toBeDisabled();
    expect(askAssistant).toHaveBeenCalledTimes(1);
    complete({ requestId: 'id', answer: 'Похідна x² — це 2x.', generalKnowledge: false, sources: [{ materialId: 'real-id', title: 'Похідна', grade: 10, topic: 'Похідна', url: '/materials/real-id' }] });
    expect(await screen.findByText('Похідна x² — це 2x.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Похідна · 10 клас/ })).toHaveAttribute('href', '/materials/real-id');
  });
  it('shows budget rejection and allows a later submission', async () => {
    vi.mocked(askAssistant).mockRejectedValue(new ApiError('Денний ліміт AI вичерпано.', { status: 429, problem: { title: 'DailyBudget', detail: 'Денний ліміт AI вичерпано.', status: 429 } }));
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Твоє запитання')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Твоє запитання'), { target: { value: 'Поясни тему' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запитати' }));
    expect(await screen.findByText('Денний ліміт AI вичерпано.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запитати' })).toBeEnabled();
  });
});
