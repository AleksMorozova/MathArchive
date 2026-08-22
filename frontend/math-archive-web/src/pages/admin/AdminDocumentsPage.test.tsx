import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDocument, getDocuments, getTopics } from '../../api/documentsApi';
import { queryKeys } from '../../api/queryKeys';
import { AdminDocumentsPage } from './AdminDocumentsPage';

vi.mock('../../api/documentsApi', () => ({
  deleteDocument: vi.fn(async () => undefined),
  getDocuments: vi.fn(),
  getTopics: vi.fn(async () => [])
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
});

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
