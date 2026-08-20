import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getDocument, getDocuments, getTopics } from '../api/documentsApi';
import { queryKeys } from '../api/queryKeys';
import type { DocumentFilters } from '../types/documents';

export function useDocuments(filters: DocumentFilters) {
  return useQuery({
    queryKey: queryKeys.documents(filters),
    queryFn: ({ signal }) => getDocuments(filters, signal)
  });
}

export function useInfiniteDocuments(filters: DocumentFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.infiniteDocuments(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => getDocuments({ ...filters, page: pageParam }, signal),
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined)
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.document(id),
    queryFn: () => getDocument(id),
    enabled: Boolean(id)
  });
}

export function useTopics() {
  return useQuery({
    queryKey: queryKeys.topics,
    queryFn: getTopics
  });
}
