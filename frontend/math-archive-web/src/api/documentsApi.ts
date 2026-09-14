import type { DocumentDto, DocumentFilters, PagedResult } from '../types/documents';
import { httpClient } from './httpClient';

const generalGradeFilterValue = 'general';

export async function getDocuments(filters: DocumentFilters, signal?: AbortSignal) {
  const response = await httpClient.get<PagedResult<DocumentDto>>('/api/documents', {
    signal,
    params: {
      search: filters.search || undefined,
      grade: filters.grade && filters.grade !== generalGradeFilterValue ? filters.grade : undefined,
      generalOnly: filters.grade === generalGradeFilterValue ? true : undefined,
      topic: filters.topic || undefined,
      documentType: filters.documentType || undefined,
      createdFrom: filters.createdFrom || undefined,
      createdTo: filters.createdTo || undefined,
      sort: filters.sort || undefined,
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

export async function getDocumentFile(id: string, signal?: AbortSignal) {
  const response = await httpClient.get<Blob>(`/api/documents/${id}/preview`, {
    signal,
    responseType: 'blob'
  });

  return response.data;
}
export async function downloadDocument(id: string) {
  const response = await httpClient.get<Blob>(`/api/documents/${id}/download`, {
    responseType: 'blob'
  });

  saveBlob(response.data, getDownloadFileName(response.headers['content-disposition']) ?? 'material');
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

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getDownloadFileName(contentDisposition: string | undefined) {
  if (!contentDisposition) {
    return undefined;
  }

  const encodedFileName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFileName) {
    return decodeURIComponent(encodedFileName.replace(/['"]/g, ''));
  }

  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
}
