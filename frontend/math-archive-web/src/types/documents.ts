export type DocumentType =
  | 'Formula'
  | 'Test'
  | 'IndependentWork'
  | 'Homework'
  | 'Theory'
  | 'MethodicalMaterial'
  | 'Other'
  | 'Memo'
  | 'InteractiveTrainer';

export interface DocumentDto {
  id: string;
  title: string;
  description?: string | null;
  grade: number | null;
  trainerGrades?: number[];
  trainerPublished?: boolean;
  topic: string;
  documentType: DocumentType;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  downloadCount: number;
  displayOrder: number;
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
