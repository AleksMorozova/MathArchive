import type { StorageAuditReport, StorageCleanupResult } from '../types/storageAudit';
import { httpClient } from './httpClient';

export async function getStorageAudit(signal?: AbortSignal) {
  const response = await httpClient.get<StorageAuditReport>('/api/admin/storage/audit', { signal });
  return response.data;
}

export async function cleanupOrphanedFiles() {
  const response = await httpClient.post<StorageCleanupResult>('/api/admin/storage/cleanup-orphans', {
    confirmation: 'DELETE ORPHANS'
  });
  return response.data;
}
