import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Analytics unavailable')));
    vi.clearAllMocks();
    authStorage.clearToken();
    useDocumentMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: createDocument()
    } as unknown as ReturnType<typeof useDocument>);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['card', 'details'] as const)('records one download from the %s download button even when analytics fails', async (location) => {
    const user = userEvent.setup();
    const document = { ...createDocument(), id: '078cbdd3-15e5-4871-9abc-9c0fadf6a594' };
    useDocumentMock.mockReturnValue({ isLoading: false, isError: false, data: document } as unknown as ReturnType<typeof useDocument>);
    vi.mocked(downloadDocument).mockReturnValue(new Promise(() => undefined));
    render(<StrictMode><MemoryRouter initialEntries={[`/materials/${document.id}`]}>
      {location === 'card' ? <DocumentCard document={document} /> : <Routes><Route path="/materials/:id" element={<DocumentDetailsPage />} /></Routes>}
    </MemoryRouter></StrictMode>);
    const button = screen.getByRole('button', { name: location === 'card' ? 'Завантажити' : 'Завантажити файл' });
    expect(fetch).not.toHaveBeenCalled();
    await user.dblClick(button);
    expect(downloadDocument).toHaveBeenCalledTimes(1);
    expect(downloadDocument).toHaveBeenCalledWith(document.id);
    expect(button).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({
      sessionId: expect.any(String), eventType: 'DocumentDownload', documentId: document.id
    });
  });

  it('dispatches the exact DocumentDownload POST synchronously from the regular open link without waiting for analytics', async () => {
    const documentId = '078cbdd3-15e5-4871-9abc-9c0fadf6a594';
    useDocumentMock.mockReturnValue({ isLoading: false, isError: false, data: { ...createDocument(), id: documentId } } as unknown as ReturnType<typeof useDocument>);
    // A pending analytics request must not prevent the anchor's normal new-tab navigation.
    vi.mocked(fetch).mockReturnValue(new Promise(() => undefined));
    const page = <StrictMode><MemoryRouter initialEntries={[`/materials/${documentId}`]}><Routes><Route path="/materials/:id" element={<DocumentDetailsPage />} /></Routes></MemoryRouter></StrictMode>;
    const rendered = render(page);
    expect(fetch).not.toHaveBeenCalled();
    const link = screen.getByRole('link', { name: 'Відкрити документ' });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    fireEvent(link, click);
    // These assertions run before yielding to any promise or browser navigation.
    expect(click.defaultPrevented).toBe(false);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', expect.stringContaining(`/api/documents/${documentId}/preview`));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toEqual(expect.stringMatching(/\/api\/analytics\/events$/));
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(options!.body as string)).toEqual({
      sessionId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      eventType: 'DocumentDownload', documentId
    });
    rendered.rerender(page);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(downloadDocument).not.toHaveBeenCalled();
  });

  it('keeps document opening and preview usable when analytics fails without duplicate preview events', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(getDocumentFile).mockResolvedValue(new Blob(['preview'], { type: 'application/pdf' }));
    const document = { ...createDocument(), contentType: 'application/pdf' };
    useDocumentMock.mockReturnValue({ isLoading: false, isError: false, data: document } as unknown as ReturnType<typeof useDocument>);
    const page = <StrictMode><MemoryRouter initialEntries={['/materials/document-id']}><Routes><Route path="/materials/:id" element={<DocumentDetailsPage />} /></Routes></MemoryRouter></StrictMode>;
    const rendered = render(page);
    await waitFor(() => expect(screen.getByTitle(document.title)).toHaveAttribute('src', 'blob:preview'));
    rendered.rerender(page);
    const events = () => vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(options!.body as string).eventType);
    expect(events()).toEqual(['DocumentPreview']);
    const link = screen.getByRole('link', { name: 'Відкрити документ' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/api/documents/document-id/preview'));
    expect(link).toHaveAttribute('target', '_blank');
    await userEvent.setup().click(link);
    expect(events()).toEqual(['DocumentPreview', 'DocumentDownload']);
    expect(screen.getByTitle(document.title)).toBeInTheDocument();
    expect(downloadDocument).not.toHaveBeenCalled();
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
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Головна' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Матеріали' })).toHaveAttribute('href', '/materials');
    expect(screen.getByRole('link', { name: 'Морозова Тетяна Володимирівна' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: 'Морозова Тетяна Володимирівна' })).toHaveAttribute('rel', 'author');
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
