import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authStorage } from '../api/authStorage';
import { downloadDocument, getDocumentFile } from '../api/documentsApi';
import { DocumentCard } from '../components/DocumentCard';
import { DocumentDetailsPage } from './DocumentDetailsPage';
import { useDocument } from '../hooks/useDocuments';
import type { DocumentDto } from '../types/documents';

vi.mock('../hooks/useDocuments', () => ({
  useDocument: vi.fn()
}));

vi.mock('../api/documentsApi', async () => {
  const actual = await vi.importActual<typeof import('../api/documentsApi')>('../api/documentsApi');
  return {
    ...actual,
    getDocumentFile: vi.fn(),
    downloadDocument: vi.fn()
  };
});

const useDocumentMock = vi.mocked(useDocument);

describe('DocumentDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStorage.clearToken();
    useDocumentMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: createDocument()
    } as unknown as ReturnType<typeof useDocument>);
  });

  it('hides technical file metadata for public users', () => {
    renderDetailsPage();

    expect(screen.getByRole('heading', { name: 'Матеріал для перевірки' })).toBeInTheDocument();
    expect(screen.getByText('Клас: 7')).toBeInTheDocument();
    expect(screen.getByText('Тема: Геометрія')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завантажити файл' })).toBeInTheDocument();
    expect(screen.queryByText(/Формат:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Розмір файлу:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Кількість завантажень:/)).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Навігаційний шлях' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Головна' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Матеріали' })).toHaveAttribute('href', '/materials');
    expect(screen.getByRole('link', { name: 'Морозова Тетяна Володимирівна' })).toHaveAttribute('href', '/about');
  });

  it('shows technical file metadata for authenticated admin users', () => {
    authStorage.setToken(createValidToken());

    renderDetailsPage();

    expect(screen.getByText('Формат: PDF')).toBeInTheDocument();
    expect(screen.getByText('Розмір файлу: 2 КБ')).toBeInTheDocument();
    expect(screen.getByText('Кількість завантажень: 12')).toBeInTheDocument();
  });

  it('loads a preview through the preview API and keeps explicit download separate', async () => {
    const user = userEvent.setup();
    const previewBlob = new Blob(['preview'], { type: 'application/pdf' });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.mocked(getDocumentFile).mockResolvedValue(previewBlob);
    vi.mocked(downloadDocument).mockResolvedValue(undefined);
    useDocumentMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: { ...createDocument(), contentType: 'application/pdf' }
    } as unknown as ReturnType<typeof useDocument>);

    renderDetailsPage();

    await waitFor(() => expect(getDocumentFile).toHaveBeenCalledWith('document-id', expect.any(AbortSignal)));
    expect(createObjectUrl).toHaveBeenCalledWith(previewBlob);

    await user.click(screen.getByRole('button', { name: 'Завантажити файл' }));
    expect(downloadDocument).toHaveBeenCalledWith('document-id');
  });

  it('preserves material filters when returning from details', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/materials?class=7&topic=геом']}>
        <Routes>
          <Route path="/materials" element={<><DocumentCard document={createDocument()} /><LocationProbe /></>} />
          <Route path="/materials/:id" element={<DocumentDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('link', { name: 'Переглянути' }));
    await user.click(screen.getByRole('link', { name: 'Назад до матеріалів' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/materials?class=7&topic=геом');
  });

  it('falls back to the unfiltered materials page for direct details navigation', () => {
    renderDetailsPage();

    expect(screen.getByRole('link', { name: 'Назад до матеріалів' })).toHaveAttribute('href', '/materials');
  });
});

function renderDetailsPage() {
  return render(
    <MemoryRouter initialEntries={['/materials/document-id']}>
      <Routes>
        <Route path="/materials/:id" element={<DocumentDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function createDocument(): DocumentDto {
  return {
    id: 'document-id',
    title: 'Матеріал для перевірки',
    description: 'Опис матеріалу',
    grade: 7,
    topic: 'Геометрія',
    documentType: 'Theory',
    originalFileName: 'geometry.pdf',
    contentType: 'application/octet-stream',
    fileSize: 2048,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    downloadCount: 12
  };
}

function createValidToken() {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `header.${payload}.signature`;
}
