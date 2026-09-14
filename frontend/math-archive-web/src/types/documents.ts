export type DocumentType =
  | 'Formula'
  | 'Test'
  | 'IndependentWork'
  | 'Homework'
  | 'Theory'
  | 'MethodicalMaterial'
  | 'Other'
  | 'Memo';

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
  createdFrom?: string;
  createdTo?: string;
  sort?: 'CreatedAtDescending';
  page: number;
  pageSize: number;
}
