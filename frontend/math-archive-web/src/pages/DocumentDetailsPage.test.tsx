import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authStorage } from '../api/authStorage';
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

    expect(screen.getByText('Матеріал для перевірки')).toBeInTheDocument();
    expect(screen.getByText('Клас: 7')).toBeInTheDocument();
    expect(screen.getByText('Тема: Геометрія')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завантажити файл' })).toBeInTheDocument();
    expect(screen.queryByText(/Формат:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Розмір файлу:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Кількість завантажень:/)).not.toBeInTheDocument();
  });

  it('shows technical file metadata for authenticated admin users', () => {
    authStorage.setToken(createValidToken());

    renderDetailsPage();

    expect(screen.getByText('Формат: PDF')).toBeInTheDocument();
    expect(screen.getByText('Розмір файлу: 2 КБ')).toBeInTheDocument();
    expect(screen.getByText('Кількість завантажень: 12')).toBeInTheDocument();
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
