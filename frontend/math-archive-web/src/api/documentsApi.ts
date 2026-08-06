import type { DocumentDto, DocumentFilters, PagedResult } from '../types/documents';
import { buildApiUrl } from './apiConfig';
import { httpClient } from './httpClient';

export async function getDocuments(filters: DocumentFilters) {
  const response = await httpClient.get<PagedResult<DocumentDto>>('/api/documents', {
    params: {
      search: filters.search || undefined,
      grade: filters.grade || undefined,
      topic: filters.topic || undefined,
      documentType: filters.documentType || undefined,
      page: filters.page,
      pageSize: filters.pageSize
    }
  });
  return response.data;
}

export async function getTopics() {
  const response = await httpClient.get<string[]>('/api/documents/topics');
  return response.data;
}

export async function getDocument(id: string) {
  const response = await httpClient.get<DocumentDto>(`/api/documents/${id}`);
  return response.data;
}

export function downloadDocument(id: string) {
  window.location.assign(buildApiUrl(`/api/documents/${id}/download`));
}

export async function createDocument(formData: FormData, onUploadProgress?: (progress: number) => void) {
  const response = await httpClient.post<DocumentDto>('/api/admin/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && onUploadProgress) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    }
  });
  return response.data;
}

export async function updateDocument(id: string, formData: FormData, onUploadProgress?: (progress: number) => void) {
  const response = await httpClient.put<DocumentDto>(`/api/admin/documents/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && onUploadProgress) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    }
  });
  return response.data;
}

export async function deleteDocument(id: string) {
  await httpClient.delete(`/api/admin/documents/${id}`);
}
