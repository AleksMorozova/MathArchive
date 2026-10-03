import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askAssistant, getAssistantStatus } from '../api/aiApi';
import { ApiError } from '../api/apiErrors';
import { AssistantPage } from './AssistantPage';
import { AssistantSessionProvider } from '../components/assistant/AssistantSession';

vi.mock('../api/aiApi', () => ({ askAssistant: vi.fn(), getAssistantStatus: vi.fn() }));
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AssistantSessionProvider><AssistantPage /></AssistantSessionProvider></MemoryRouter></QueryClientProvider>);
describe('AssistantPage', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAssistantStatus).mockResolvedValue({ enabled: true, maxPromptLength: 2000 }); });
  it('shows only the two starter suggestions and fills the draft when selected', async () => {
    renderPage();
    expect(await screen.findByText('Чим я можу допомогти?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Поясни тему' }));
    expect(screen.getByLabelText('Твоє запитання')).toHaveValue('Поясни тему: ');
    fireEvent.click(screen.getByRole('button', { name: 'Знайди матеріал' }));
    expect(screen.getByLabelText('Твоє запитання')).toHaveValue('Знайди матеріал: ');
    expect(screen.queryByRole('button', { name: 'Дай мені завдання' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Перевір моє розв/ })).not.toBeInTheDocument();
    expect(askAssistant).not.toHaveBeenCalled();
  });
  it.each(['Дай мені завдання з дробами', 'Перевір моє розв’язання: 2x = 8, x = 4'])('still submits free-text requests: %s', async question => {
    vi.mocked(askAssistant).mockResolvedValue({ requestId: 'id', answer: 'Відповідь', generalKnowledge: true, sources: [] });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Твоє запитання')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Твоє запитання'), { target: { value: question } });
    fireEvent.click(screen.getByRole('button', { name: 'Запитати' }));
    await waitFor(() => expect(askAssistant).toHaveBeenCalledWith(question, undefined, undefined, expect.any(AbortSignal)));
    expect(await screen.findByText('Відповідь')).toBeInTheDocument();
  });
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
    expect(await screen.findByRole('button', { name: 'Думаю…' })).toBeDisabled();
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
    expect(await screen.findByText('Денний ліміт AI вичерпано. Спробуй завтра або переглянь матеріали.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Твоє запитання'), { target: { value: 'Поясни рівняння' } });
    expect(screen.getByRole('button', { name: 'Запитати' })).toBeEnabled();
  });
});
