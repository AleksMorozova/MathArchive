export type DocumentType =
  | 'Formula'
  | 'Test'
  | 'IndependentWork'
  | 'Homework'
  | 'Theory'
  | 'MethodicalMaterial'
  | 'Other';

export interface DocumentDto {
  id: string;
  title: string;
  description?: string | null;
  grade: number | null;
  topic: string;
  documentType: DocumentType;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  downloadCount: number;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface DocumentFilters {
  search?: string;
  grade?: string;
  topic?: string;
  documentType?: string;
  page: number;
  pageSize: number;
}
