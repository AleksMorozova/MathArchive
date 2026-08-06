import { useQuery } from '@tanstack/react-query';
import { getDocument, getDocuments, getTopics } from '../api/documentsApi';
import { queryKeys } from '../api/queryKeys';
import type { DocumentFilters } from '../types/documents';

export function useDocuments(filters: DocumentFilters) {
  return useQuery({
    queryKey: queryKeys.documents(filters),
    queryFn: () => getDocuments(filters)
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
