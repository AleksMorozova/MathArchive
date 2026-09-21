import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocumentOrder, saveDocumentOrder } from '../../api/documentsApi';
import type { DocumentDto } from '../../types/documents';
import { AdminDocumentOrderPage } from './AdminDocumentOrderPage';

vi.mock('../../api/documentsApi', () => ({
  getDocumentOrder: vi.fn(),
  saveDocumentOrder: vi.fn()
}));

describe('AdminDocumentOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocumentOrder).mockResolvedValue([
      createDocument('ordered', 'Впорядкований', 1),
      createDocument('unordered', 'Без номера', 0)
    ]);
    vi.mocked(saveDocumentOrder).mockResolvedValue([
      createDocument('unordered', 'Без номера', 1),
      createDocument('ordered', 'Впорядкований', 2)
    ]);
  });

  it('loads a complete class list, supports dragging, and preserves the class after saving', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Порядок матеріалів' })).toBeInTheDocument();
    expect(screen.getByText(/Оберіть клас і розташуйте матеріали/)).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Клас' }));
    await user.click(screen.getByRole('option', { name: '7 клас' }));

    expect(await screen.findByText('Матеріалів у класі: 2')).toBeInTheDocument();
    expect(screen.getByText('Впорядковані')).toBeInTheDocument();
    expect(screen.getAllByText('Без порядку').length).toBeGreaterThan(0);
    expect(getDocumentOrder).toHaveBeenCalledWith(7);

    const unorderedCard = screen.getByText('Без номера').closest('.MuiCard-root');
    const orderedCard = screen.getByText('Впорядкований').closest('.MuiCard-root');
    fireEvent.dragStart(unorderedCard!, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(orderedCard!);
    fireEvent.drop(orderedCard!);

    expect(screen.getByText('Новий порядок')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зберегти порядок' }));
    await waitFor(() => expect(saveDocumentOrder).toHaveBeenCalledWith(7, ['unordered', 'ordered']));
    expect(await screen.findByText('Порядок матеріалів успішно збережено')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Клас' })).toHaveTextContent('7 клас');
  });

  it('supports keyboard-accessible movement and warns before leaving with unsaved changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('combobox', { name: 'Клас' }));
    await user.click(screen.getByRole('option', { name: '7 клас' }));
    await screen.findByText('Без номера');

    await user.click(screen.getByRole('button', { name: 'Перемістити вище: Без номера' }));
    await user.click(screen.getByRole('link', { name: 'До матеріалів' }));

    expect(screen.getByRole('dialog', { name: 'Вийти без збереження?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Залишитися' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Порядок матеріалів' })).toBeInTheDocument();
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const router = createMemoryRouter([
    { path: '/admin/materials/order', element: <AdminDocumentOrderPage /> },
    { path: '/admin/documents', element: <div>Основна сторінка матеріалів</div> }
  ], { initialEntries: ['/admin/materials/order'] });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function createDocument(id: string, title: string, displayOrder: number): DocumentDto {
  return {
    id,
    title,
    description: null,
    grade: 7,
    topic: 'Алгебра',
    documentType: 'Theory',
    originalFileName: `${id}.pdf`,
    contentType: 'application/pdf',
    fileSize: 1024,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    downloadCount: 0,
    displayOrder
  };
}
