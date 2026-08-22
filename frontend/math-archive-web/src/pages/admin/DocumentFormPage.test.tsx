import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, getDocument, updateDocument } from '../../api/documentsApi';
import { queryKeys } from '../../api/queryKeys';
import { DocumentFormPage } from './DocumentFormPage';

vi.mock('../../api/documentsApi', () => ({
  createDocument: vi.fn(async () => ({ id: 'document-id' })),
  updateDocument: vi.fn(),
  getDocument: vi.fn()
}));

describe('DocumentFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Ukrainian validation messages for required fields', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();

    renderForm(queryClient);

    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Введіть назву матеріалу')).toBeInTheDocument();
    expect(screen.getByText('Вкажіть тему')).toBeInTheDocument();
    expect(screen.getAllByText('Оберіть файл').length).toBeGreaterThan(0);
    expect(screen.getByText('Оберіть клас')).toBeInTheDocument();
  });

  it('submits a general material without a grade field', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();

    renderForm(queryClient);

    await user.type(screen.getByLabelText('Назва'), 'Критерії оцінювання');
    await user.type(screen.getByLabelText('Тема'), 'Оцінювання');
    await user.click(screen.getByLabelText('Призначення'));
    await user.click(screen.getByRole('option', { name: 'Загальний матеріал' }));
    await user.click(screen.getByLabelText('Тип матеріалу'));
    await user.click(screen.getByRole('option', { name: 'Методичний матеріал' }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['content'], 'criteria.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(createDocument).toHaveBeenCalled());
    const formData = vi.mocked(createDocument).mock.calls[0][0] as FormData;
    expect(formData.get('title')).toBe('Критерії оцінювання');
    expect(formData.has('grade')).toBe(false);
    expect(formData.get('documentType')).toBe('MethodicalMaterial');
  });

  it('does not submit a pending create mutation twice', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    vi.mocked(createDocument).mockReturnValueOnce(new Promise(() => undefined));

    renderForm(queryClient);

    await user.type(screen.getByLabelText('Назва'), 'Критерії оцінювання');
    await user.type(screen.getByLabelText('Тема'), 'Оцінювання');
    await user.click(screen.getByLabelText('Призначення'));
    await user.click(screen.getByRole('option', { name: 'Загальний матеріал' }));
    await user.click(screen.getByLabelText('Тип матеріалу'));
    await user.click(screen.getByRole('option', { name: 'Методичний матеріал' }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['content'], 'criteria.pdf', { type: 'application/pdf' })
    );

    await user.dblClick(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Зберігаємо…' })).toBeDisabled();
  });

  it('shows a loading state instead of the edit form while the document is loading', () => {
    const queryClient = createQueryClient();
    let resolveDocument!: (value: Awaited<ReturnType<typeof getDocument>>) => void;
    vi.mocked(getDocument).mockReturnValueOnce(new Promise((resolve) => {
      resolveDocument = resolve;
    }));

    renderForm(queryClient, 'edit');

    expect(screen.getByText('Завантажуємо матеріал…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Назва')).not.toBeInTheDocument();
    resolveDocument(createLoadedDocument());
  });

  it('shows an error state instead of the edit form when the document cannot be loaded', async () => {
    const queryClient = createQueryClient();
    vi.mocked(getDocument).mockRejectedValueOnce(new Error('Failed to load'));

    renderForm(queryClient, 'edit');

    expect(await screen.findByText('Не вдалося завантажити матеріал.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Назва')).not.toBeInTheDocument();
  });

  it('renders edit form values after the document is loaded', async () => {
    const queryClient = createQueryClient();
    vi.mocked(getDocument).mockResolvedValueOnce(createLoadedDocument());

    renderForm(queryClient, 'edit');

    expect(await screen.findByDisplayValue('Пам’ятка з геометрії')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Основні формули')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Геометрія')).toBeInTheDocument();
    expect(screen.getByText('Поточний файл: geometry.pdf')).toBeInTheDocument();
  });

  it('does not overwrite unsaved edit values when document query data changes', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    vi.mocked(getDocument).mockResolvedValueOnce(createLoadedDocument());

    renderForm(queryClient, 'edit');

    const titleInput = await screen.findByDisplayValue('Пам’ятка з геометрії');
    await user.clear(titleInput);
    await user.type(titleInput, 'Моя незбережена назва');

    act(() => {
      queryClient.setQueryData(queryKeys.document('document-id'), {
        ...createLoadedDocument(),
        title: 'Назва після фонового оновлення'
      });
    });

    expect(screen.getByLabelText('Назва')).toHaveValue('Моя незбережена назва');
  });

  it('invalidates document lists and the edited document detail after a successful update', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    vi.mocked(getDocument).mockResolvedValue(createLoadedDocument());
    vi.mocked(updateDocument).mockResolvedValueOnce(createLoadedDocument());

    renderForm(queryClient, 'edit');

    await screen.findByDisplayValue('Пам’ятка з геометрії');
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    await waitFor(() => expect(updateDocument).toHaveBeenCalled());
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['documents'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.document('document-id') });
  });

  it('renders the create form without waiting for a document query', () => {
    const queryClient = createQueryClient();

    renderForm(queryClient);

    expect(screen.getByRole('heading', { name: 'Новий матеріал' })).toBeInTheDocument();
    expect(screen.getByLabelText('Назва')).toBeInTheDocument();
    expect(getDocument).not.toHaveBeenCalled();
  });
});

function renderForm(queryClient: QueryClient, mode: 'create' | 'edit' = 'create') {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[mode === 'edit' ? '/admin/documents/document-id/edit' : '/admin/documents/new']}>
        <Routes>
          <Route path="/admin/documents/new" element={<DocumentFormPage mode="create" />} />
          <Route path="/admin/documents/:id/edit" element={<DocumentFormPage mode="edit" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

function createLoadedDocument() {
  return {
    id: 'document-id',
    title: 'Пам’ятка з геометрії',
    description: 'Основні формули',
    grade: 7,
    topic: 'Геометрія',
    documentType: 'Memo' as const,
    originalFileName: 'geometry.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    downloadCount: 3
  };
}
