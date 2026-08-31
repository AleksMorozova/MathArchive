import type { DocumentFilters } from '../types/documents';

export const queryKeys = {
  documents: (filters: DocumentFilters) => ['documents', filters] as const,
  infiniteDocuments: (filters: DocumentFilters) => ['documents', 'infinite', filters] as const,
  document: (id: string) => ['document', id] as const,
  topics: ['topics'] as const,
  storageAudit: ['admin', 'storage-audit'] as const,
  analytics: (from: string, to: string) => ['admin', 'analytics', from, to] as const
};
