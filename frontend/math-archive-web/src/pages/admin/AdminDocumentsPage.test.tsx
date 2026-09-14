import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDocument, getDocuments } from '../../api/documentsApi';
import { queryKeys } from '../../api/queryKeys';
import { AdminDocumentsPage } from './AdminDocumentsPage';

vi.mock('../../api/documentsApi', () => ({
  deleteDocument: vi.fn(async () => undefined),
  getDocuments: vi.fn()
}));

describe('AdminDocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocuments).mockResolvedValue({
      items: [createDocument()],
      page: 1,
      pageSize: 12,
      totalCount: 1,
      totalPages: 1
    });
  });

  it('invalidates document lists and removes deleted document detail after successful delete', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminDocumentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Пам’ятка з геометрії');
    await user.click(screen.getByRole('button', { name: 'Видалити' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Видалити' }));

    await waitFor(() => expect(deleteDocument).toHaveBeenCalled());
    expect(vi.mocked(deleteDocument).mock.calls[0][0]).toBe('document-id');
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: queryKeys.document('document-id') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['documents'] });
  });

  it('does not trigger a pending delete mutation twice', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    vi.mocked(deleteDocument).mockReturnValueOnce(new Promise(() => undefined));

    renderPage(queryClient);

    await screen.findByText('Пам’ятка з геометрії');
    await user.click(screen.getByRole('button', { name: 'Видалити' }));
    await user.dblClick(within(screen.getByRole('dialog')).getByRole('button', { name: 'Видалити' }));

    await waitFor(() => expect(deleteDocument).toHaveBeenCalledTimes(1));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Видаляємо…' })).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Скасувати' })).toBeDisabled();
  });

  it('moves to the previous page after deleting the only item on page two', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    vi.mocked(getDocuments).mockImplementation(async (filters) => filters.page === 2
      ? { items: [{ ...createDocument(), id: 'page-two-document', title: 'Останній матеріал' }], page: 2, pageSize: 12, totalCount: 13, totalPages: 2 }
      : { items: [createDocument()], page: 1, pageSize: 12, totalCount: 12, totalPages: 2 });

    renderPage(queryClient);

    await screen.findByText('Пам’ятка з геометрії');
    await user.click(screen.getByRole('button', { name: /2/ }));
    await screen.findByText('Останній матеріал');
    await user.click(screen.getByRole('button', { name: 'Видалити' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Видалити' }));

    expect(await screen.findByText('Пам’ятка з геометрії')).toBeInTheDocument();
    await waitFor(() => expect(getDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
      expect.any(AbortSignal)
    ));
  });

  it('shows the filtered total and requests newest materials first with date filters', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    vi.mocked(getDocuments).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 12,
      totalCount: 4,
      totalPages: 1
    });

    renderPage(queryClient);

    expect(await screen.findByText('Знайдено матеріалів: 4')).toBeInTheDocument();
    expect(screen.queryByLabelText('Тема')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Тип матеріалу')).not.toBeInTheDocument();
    expect(getDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'CreatedAtDescending', page: 1 }),
      expect.any(AbortSignal)
    );

    await user.type(screen.getByLabelText('Дата від'), '2026-08-01');

    await waitFor(() => expect(getDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ createdFrom: '2026-08-01', sort: 'CreatedAtDescending', page: 1 }),
      expect.any(AbortSignal)
    ));
  });
});

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminDocumentsPage />
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

function createDocument() {
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
