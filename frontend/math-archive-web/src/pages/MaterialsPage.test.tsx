import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialsPage } from './MaterialsPage';
import { useInfiniteDocuments } from '../hooks/useDocuments';
import type { DocumentDto, PagedResult } from '../types/documents';

vi.mock('../hooks/useDocuments', () => ({
  useInfiniteDocuments: vi.fn()
}));

const useInfiniteDocumentsMock = vi.mocked(useInfiniteDocuments);
let intersectionObserverCallback: IntersectionObserverCallback | undefined;

describe('MaterialsPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    intersectionObserverCallback = undefined;
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      writable: true,
      value: vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
        intersectionObserverCallback = callback;
        return {
          observe: vi.fn(),
          unobserve: vi.fn(),
          disconnect: vi.fn(),
          takeRecords: vi.fn(() => [])
        };
      })
    });

    useInfiniteDocumentsMock.mockReturnValue(createInfiniteDocumentsResult({
      isLoading: false,
      isError: false,
      data: {
        pages: [createPage({ page: 1, totalPages: 1 })],
        pageParams: [1]
      },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn()
    }));
  });

  it('initializes class and topic filters from URL query parameters', () => {
    renderMaterialsPage('/materials?class=7&topic=Алгебра');

    expect(useInfiniteDocumentsMock).toHaveBeenLastCalledWith(expect.objectContaining({
      grade: '7',
      search: 'Алгебра',
      topic: '',
      documentType: ''
    }));
    expect(screen.getByLabelText('Пошук за темою')).toHaveValue('Алгебра');
    expect(screen.queryByLabelText('Тема')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Тип матеріалу')).not.toBeInTheDocument();
  });

  it('shows grade and topic on cards without the material type', () => {
    useInfiniteDocumentsMock.mockReturnValue(createInfiniteDocumentsResult({
      data: {
        pages: [createPage({ page: 1, totalPages: 1, items: [createDocument('first')] })],
        pageParams: [1]
      }
    }));

    renderMaterialsPage('/materials');

    expect(screen.getByText('7 клас')).toBeInTheDocument();
    expect(screen.getByText('Алгебра')).toBeInTheDocument();
    expect(screen.queryByText('Теоретичний матеріал')).not.toBeInTheDocument();
  });

  it('debounces topic text changes and preserves selected class', async () => {
    renderMaterialsPage('/materials?class=7&topic=Алгебра');

    const topicInput = screen.getByLabelText('Пошук за темою');
    fireEvent.change(topicInput, { target: { value: 'Геометрія' } });

    expect(new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('topic')).toBe('Алгебра');

    await waitForDebounce();

    await waitFor(() => {
      const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
      expect(params.get('class')).toBe('7');
      expect(params.get('topic')).toBe('Геометрія');
    });

    await waitFor(() => {
      expect(useInfiniteDocumentsMock).toHaveBeenLastCalledWith(expect.objectContaining({
        grade: '7',
        search: 'Геометрія',
        topic: ''
      }));
    });
  });

  it('trims topic text before storing it in the URL', async () => {
    renderMaterialsPage('/materials?class=7');

    fireEvent.change(screen.getByLabelText('Пошук за темою'), { target: { value: '  геом  ' } });
    await waitForDebounce();

    await waitFor(() => {
      const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
      expect(params.get('topic')).toBe('геом');
    });
  });

  it('treats whitespace-only topic text as no topic filter', async () => {
    renderMaterialsPage('/materials?class=7&topic=Алгебра');

    const topicInput = screen.getByLabelText('Пошук за темою');
    fireEvent.change(topicInput, { target: { value: '   ' } });
    await waitForDebounce();

    await waitFor(() => {
      const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
      expect(params.get('class')).toBe('7');
      expect(params.has('topic')).toBe(false);
    });
  });

  it('does not publish stale topic values during rapid typing', async () => {
    renderMaterialsPage('/materials?class=7');

    const topicInput = screen.getByLabelText('Пошук за темою');
    fireEvent.change(topicInput, { target: { value: 'г' } });
    await waitForDebounce(250);
    fireEvent.change(topicInput, { target: { value: 'геом' } });
    await waitForDebounce(350);

    expect(new URLSearchParams(screen.getByTestId('location').textContent ?? '').has('topic')).toBe(false);

    await waitForDebounce(100);

    await waitFor(() => {
      const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
      expect(params.get('topic')).toBe('геом');
    });
  });

  it('loads the next page when the sentinel enters the viewport', async () => {
    const fetchNextPage = vi.fn();
    useInfiniteDocumentsMock.mockReturnValue(createInfiniteDocumentsResult({
      isLoading: false,
      isError: false,
      data: {
        pages: [createPage({ page: 1, totalPages: 2, items: [createDocument('first')] })],
        pageParams: [1]
      },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage
    }));

    renderMaterialsPage('/materials?class=7');

    await triggerIntersection();

    expect(useInfiniteDocumentsMock).toHaveBeenLastCalledWith(expect.objectContaining({
      grade: '7',
      search: '',
      topic: '',
      page: 1
    }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps URL topic mapped to search for lazy pagination requests', async () => {
    const fetchNextPage = vi.fn();
    useInfiniteDocumentsMock.mockReturnValue(createInfiniteDocumentsResult({
      isLoading: false,
      isError: false,
      data: {
        pages: [createPage({ page: 1, totalPages: 2, items: [createDocument('first')] })],
        pageParams: [1]
      },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage
    }));

    renderMaterialsPage('/materials?class=7&topic=геом');

    expect(useInfiniteDocumentsMock).toHaveBeenLastCalledWith(expect.objectContaining({
      grade: '7',
      search: 'геом',
      topic: '',
      page: 1
    }));

    await triggerIntersection();

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not request another page while a next-page request is already in flight', async () => {
    const fetchNextPage = vi.fn();
    useInfiniteDocumentsMock.mockReturnValue(createInfiniteDocumentsResult({
      isLoading: false,
      isError: false,
      data: {
        pages: [createPage({ page: 1, totalPages: 2, items: [createDocument('first')] })],
        pageParams: [1]
      },
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage
    }));

    renderMaterialsPage('/materials?class=7');

    await triggerIntersection();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('stops observing when there are no more result pages', () => {
    const fetchNextPage = vi.fn();
    useInfiniteDocumentsMock.mockReturnValue(createInfiniteDocumentsResult({
      isLoading: false,
      isError: false,
      data: {
        pages: [createPage({ page: 1, totalPages: 1, items: [createDocument('first')] })],
        pageParams: [1]
      },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage
    }));

    renderMaterialsPage('/materials?class=7');

    expect(intersectionObserverCallback).toBeUndefined();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});

function renderMaterialsPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/materials" element={<><MaterialsPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function createInfiniteDocumentsResult(overrides: Record<string, unknown>) {
  return {
    isLoading: false,
    isError: false,
    error: null,
    data: {
      pages: [createPage({ page: 1, totalPages: 1 })],
      pageParams: [1]
    },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides
  } as unknown as ReturnType<typeof useInfiniteDocuments>;
}

function createPage(options: { page: number; totalPages: number; items?: DocumentDto[] }): PagedResult<DocumentDto> {
  return {
    items: options.items ?? [],
    page: options.page,
    pageSize: 12,
    totalCount: options.items?.length ?? 0,
    totalPages: options.totalPages
  };
}

function createDocument(id: string): DocumentDto {
  return {
    id,
    title: `Матеріал ${id}`,
    description: null,
    grade: 7,
    topic: 'Алгебра',
    documentType: 'Theory',
    originalFileName: 'material.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    downloadCount: 0
  };
}

async function triggerIntersection() {
  await waitFor(() => expect(intersectionObserverCallback).toBeDefined());
  intersectionObserverCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
}

async function waitForDebounce(milliseconds = 450) {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  });
}
