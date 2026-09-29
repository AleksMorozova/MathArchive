import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeMaterial, transformImagePoster } from '../../api/aiApi';
import type { AiMaterialDraftState } from '../../types/ai';
import { ImagePosterPage } from './ImagePosterPage';

vi.mock('../../api/aiApi', () => ({ analyzeMaterial: vi.fn(), transformImagePoster: vi.fn() }));

describe('ImagePosterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((value: Blob) => value.type === 'image/png' && value.size === 3 ? 'blob:result' : 'blob:original'),
      revokeObjectURL: vi.fn()
    });
    vi.mocked(analyzeMaterial).mockResolvedValue({
      title: 'Одночлени', grade: 7, topic: 'Одночлени', documentType: 'Memo',
      description: 'Правила та приклади дій з одночленами.',
      confidence: { title: .9, grade: .9, topic: .9, type: .9 }, requiresReview: false
    });
  });

  it('does not offer material creation before a generated result exists', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Використати для матеріалу' })).not.toBeInTheDocument();
  });

  it('uploads an image explicitly and shows original and generated result', async () => {
    const user = userEvent.setup();
    vi.mocked(transformImagePoster).mockResolvedValue({
      image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      fileName: 'matharchive-2026-09-27-2135.png'
    });
    renderPage();

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'source.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Обрати зображення'), file);
    expect(screen.getByRole('button', { name: 'Переробити в стилі MathArchive' })).toBeEnabled();
    expect(transformImagePoster).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Переробити в стилі MathArchive' }));

    expect(await screen.findByText('Оригінал')).toBeInTheDocument();
    expect(screen.getByText('Результат')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завантажити PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Спробувати ще раз' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обрати інше зображення' })).toBeInTheDocument();
    expect(transformImagePoster).toHaveBeenCalledTimes(1);
  });

  it('analyzes the generated PNG and transfers it with metadata to the existing AI material form', async () => {
    const user = userEvent.setup();
    vi.mocked(transformImagePoster).mockResolvedValue({
      image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      fileName: 'matharchive-2026-09-28-1630.png'
    });
    renderPage();
    await user.upload(screen.getByLabelText('Обрати зображення'),
      new File([new Uint8Array([9, 8, 7, 6])], 'original.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Переробити в стилі MathArchive' }));
    await user.click(await screen.findByRole('button', { name: 'Використати для матеріалу' }));

    expect(await screen.findByText('Draft: Одночлени')).toBeInTheDocument();
    const analyzedFile = vi.mocked(analyzeMaterial).mock.calls[0][0];
    expect(analyzedFile.name).toBe('matharchive-2026-09-28-1630.png');
    expect(analyzedFile.type).toBe('image/png');
    expect(analyzedFile.size).toBe(3);
    expect(screen.getByText('File: matharchive-2026-09-28-1630.png')).toBeInTheDocument();
  });

  it('keeps the generated result available when material analysis fails', async () => {
    const user = userEvent.setup();
    vi.mocked(transformImagePoster).mockResolvedValue({
      image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), fileName: 'result.png'
    });
    vi.mocked(analyzeMaterial).mockRejectedValueOnce(new Error('offline'));
    renderPage();
    await user.upload(screen.getByLabelText('Обрати зображення'), new File([new Uint8Array([9])], 'original.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Переробити в стилі MathArchive' }));
    await user.click(await screen.findByRole('button', { name: 'Використати для матеріалу' }));

    expect(await screen.findByText(/Не вдалося проаналізувати матеріал/)).toBeInTheDocument();
    expect(screen.getByText('Результат')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завантажити PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Використати для матеріалу' })).toBeInTheDocument();
  });

  it('ignores a stale transformation response after selecting a newer image', async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: { image: Blob; fileName: string }) => void) | undefined;
    vi.mocked(transformImagePoster).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));

    renderPage();

    const firstImage = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'first.jpg', { type: 'image/jpeg' });
    const secondImage = new File([new Uint8Array([1, 2, 3])], 'second.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('Обрати зображення'), firstImage);
    await user.click(screen.getByRole('button', { name: 'Переробити в стилі MathArchive' }));
    expect(transformImagePoster).toHaveBeenCalledTimes(1);

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [secondImage] } });
    expect(transformImagePoster).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/second\.png/i)).toBeInTheDocument();

    resolveFirst?.({ image: new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/png' }), fileName: 'stale.png' });
    await waitFor(() => expect(screen.queryByText('Результат')).not.toBeInTheDocument());
    expect(screen.queryByRole('img', { name: 'Згенерований постер MathArchive' })).not.toBeInTheDocument();
    expect(transformImagePoster).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate transform submission while a request is still pending', async () => {
    const user = userEvent.setup();
    let resolveResult: ((value: { image: Blob; fileName: string }) => void) | undefined;
    vi.mocked(transformImagePoster).mockImplementationOnce(() => new Promise((resolve) => { resolveResult = resolve; }));
    renderPage();

    await user.upload(screen.getByLabelText('Обрати зображення'),
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'source.jpg', { type: 'image/jpeg' }));

    const button = screen.getByRole('button', { name: 'Переробити в стилі MathArchive' });
    await user.click(button);

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(transformImagePoster).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Переробити в стилі MathArchive' })).not.toBeInTheDocument();
  });

  it('rejects unsupported files before calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(screen.getByLabelText('Обрати зображення'), {
      target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] }
    });

    expect(await screen.findByText('Підтримуються лише зображення PNG, JPEG та WEBP.')).toBeInTheDocument();
    expect(transformImagePoster).not.toHaveBeenCalled();
  });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/admin/image-transform']}>
    <Routes>
      <Route path="/admin/image-transform" element={<ImagePosterPage />} />
      <Route path="/admin/documents/ai" element={<DraftProbe />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
}

function DraftProbe() {
  const state = useLocation().state as AiMaterialDraftState;
  return <><div>Draft: {state.analysis.title}</div><div>File: {state.file.name}</div></>;
}
