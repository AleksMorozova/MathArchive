import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient';
import { ApiError } from '../api/apiErrors';
import { TrainerFrame } from './TrainerFrame';

vi.mock('../api/httpClient', () => ({ httpClient: { get: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

function mount() {
  render(<QueryClientProvider client={new QueryClient()}><TrainerFrame id="trainer-1" title="Ділення" /></QueryClientProvider>);
}

it('runs a trainer in an opaque sandbox without granting origin, popup, or top-navigation access', async () => {
  vi.mocked(httpClient.get).mockResolvedValue({ data: { url: 'https://trainers.example.net/api/trainer-content/trainer-1' } });
  mount();
  const frame = await screen.findByTitle('Ділення');
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(frame).toHaveAttribute('src', 'https://trainers.example.net/api/trainer-content/trainer-1');
  expect(httpClient.get).toHaveBeenCalledWith('/api/documents/trainer-1/trainer', expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it('refuses to embed content from the main application hostname', async () => {
  vi.mocked(httpClient.get).mockResolvedValue({ data: { url: window.location.origin + '/api/trainer-content/trainer-1' } });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Тренажер');
  expect(screen.queryByTitle('Ділення')).not.toBeInTheDocument();
});

it('shows a useful error when isolated hosting is not configured', async () => {
  const detail = 'Тренажер тимчасово недоступний. Адміністратор має завершити налаштування окремої адреси для тренажерів.';
  vi.mocked(httpClient.get).mockRejectedValue(new ApiError('unavailable', {
    status: 503, problem: { title: 'TrainerHostingNotConfigured', status: 503, detail }
  }));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(detail);
  expect(screen.queryByTitle('Ділення')).not.toBeInTheDocument();
});
