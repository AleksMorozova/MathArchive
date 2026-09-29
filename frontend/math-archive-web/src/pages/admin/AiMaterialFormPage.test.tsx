import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeMaterial } from '../../api/aiApi';
import { createDocument } from '../../api/documentsApi';
import { AiMaterialFormPage } from './AiMaterialFormPage';

vi.mock('../../api/aiApi', () => ({ analyzeMaterial: vi.fn() }));
vi.mock('../../api/documentsApi', () => ({ createDocument: vi.fn() }));

describe('AiMaterialFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeMaterial).mockResolvedValue({
      title: 'Похідна функції', grade: 10, topic: 'Похідна', documentType: 'Memo',
      description: 'Основні правила похідної.', confidence: { title: .9, grade: .9, topic: .9, type: .8 },
      requiresReview: false
    });
    vi.mocked(createDocument).mockResolvedValue({} as never);
  });

  it('analyzes only after an explicit click and does not publish automatically', async () => {
    const user = userEvent.setup();
    renderPage();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'scan.jpg', { type: 'image/jpeg' });

    await user.upload(screen.getByLabelText('Оберіть файл'), file);
    expect(analyzeMaterial).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Проаналізувати' }));

    expect(await screen.findByDisplayValue('Похідна функції')).toBeInTheDocument();
    expect(analyzeMaterial).toHaveBeenCalledTimes(1);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('starts with generated image and analyzed metadata and publishes that same file after review', async () => {
    const user = userEvent.setup();
    const generatedFile = new File([new Uint8Array([1, 2, 3])], 'matharchive-2026-09-28-1630.png', { type: 'image/png' });
    renderPage({
      file: generatedFile,
      analysis: {
        title: 'Одночлени', grade: 7, topic: 'Одночлени', documentType: 'Memo',
        description: 'Правила та приклади дій з одночленами.',
        confidence: { title: .9, grade: .9, topic: .9, type: .9 }, requiresReview: false
      },
      fromImageTransformation: true
    });

    expect(screen.getByLabelText(/Назва/)).toHaveValue('Одночлени');
    expect(screen.getByLabelText(/Тема/)).toHaveValue('Одночлени');
    expect(screen.getByDisplayValue('Правила та приклади дій з одночленами.')).toBeInTheDocument();
    expect(analyzeMaterial).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Підтвердити та опублікувати' }));
    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    const body = vi.mocked(createDocument).mock.calls[0][0];
    expect(body.get('file')).toBe(generatedFile);
    expect(body.get('title')).toBe('Одночлени');
    expect(body.get('grade')).toBe('7');
    expect(body.get('topic')).toBe('Одночлени');
  });

  it('keeps the file after an analysis failure and permits retry', async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeMaterial).mockRejectedValueOnce(new Error('offline'));
    renderPage();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'scan.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Оберіть файл'), file);
    await user.click(screen.getByRole('button', { name: 'Проаналізувати' }));

    await screen.findByText(/Не вдалося проаналізувати матеріал/);
    expect(screen.getByText(/scan.jpg/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Проаналізувати' }));
    await waitFor(() => expect(analyzeMaterial).toHaveBeenCalledTimes(2));
  });

  it.each(['null', ' undefined ', 'N/A', '   '])('does not display the AI placeholder %j as a field value', async (placeholder) => {
    const user = userEvent.setup();
    vi.mocked(analyzeMaterial).mockResolvedValueOnce({
      title: placeholder, grade: null, topic: placeholder, documentType: placeholder as never,
      description: placeholder, confidence: { title: null, grade: null, topic: null, type: null },
      requiresReview: true
    });
    renderPage();
    await user.upload(screen.getByLabelText('Оберіть файл'), new File([new Uint8Array([0xff, 0xd8, 0xff])], 'scan.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Проаналізувати' }));

    expect(await screen.findByLabelText(/Назва/)).toHaveValue('');
    expect(screen.getByLabelText(/Тема/)).toHaveValue('');
    expect(screen.getByLabelText('Опис')).toHaveValue('');
    expect(screen.getByLabelText(/Тип матеріалу/)).not.toHaveTextContent(/null|undefined|n\/a/i);
  });

  it('treats topic as ordinary text without new-topic confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await analyze(user);

    const topic = await screen.findByLabelText(/Тема/);
    await user.clear(topic);
    await user.type(topic, 'Стереометрія');

    expect(topic).toHaveValue('Стереометрія');
    expect(screen.queryByText(/Нова тема/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Підтвердити та опублікувати' })).toBeEnabled();
  }, 10_000);

  it('requires title and enables publication after the administrator supplies it', async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeMaterial).mockResolvedValueOnce({
      title: null, grade: 7, topic: 'Стереометрія', documentType: 'Theory', description: '',
      confidence: { title: null, grade: .9, topic: .9, type: .9 }, requiresReview: true
    });
    renderPage();
    await analyze(user);

    const publish = screen.getByRole('button', { name: 'Підтвердити та опублікувати' });
    expect(await screen.findByText('AI не визначив назву. Введіть назву матеріалу.')).toBeInTheDocument();
    expect(publish).toBeDisabled();
    await user.type(screen.getByLabelText(/Назва/), 'Основи стереометрії');
    expect(publish).toBeEnabled();
  }, 10_000);

  it('clears an unknown AI material type instead of adding it to the dropdown', async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeMaterial).mockResolvedValueOnce({
      title: 'Основи стереометрії', grade: 7, topic: 'Стереометрія', documentType: 'Invented' as never,
      description: '', confidence: { title: .9, grade: .9, topic: .9, type: .9 }, requiresReview: true
    });
    renderPage();
    await analyze(user);

    expect(screen.getByText('Оберіть тип матеріалу')).toBeInTheDocument();
    expect(screen.queryByText('Invented')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Підтвердити та опублікувати' })).toBeDisabled();
  });
});

async function analyze(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Оберіть файл'), new File([new Uint8Array([0xff, 0xd8, 0xff])], 'scan.jpg', { type: 'image/jpeg' }));
  await user.click(screen.getByRole('button', { name: 'Проаналізувати' }));
  await screen.findByLabelText(/Назва/);
}

function renderPage(state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: '/admin/documents/ai', state }]}><AiMaterialFormPage /></MemoryRouter></QueryClientProvider>);
}
