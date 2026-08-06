import type { DocumentFilters } from '../types/documents';

export const queryKeys = {
  documents: (filters: DocumentFilters) => ['documents', filters] as const,
  document: (id: string) => ['document', id] as const,
  topics: ['topics'] as const
};
