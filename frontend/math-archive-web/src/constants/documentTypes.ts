import type { DocumentType } from '../types/documents';

export const documentTypeLabels: Record<DocumentType, string> = {
  Formula: 'Формули',
  Test: 'Контрольна робота',
  IndependentWork: 'Самостійна робота',
  Homework: 'Домашнє завдання',
  Theory: 'Теоретичний матеріал',
  MethodicalMaterial: 'Методичний матеріал',
  Other: 'Інше',
  Memo: 'Пам’ятка'
};

export const documentTypeOptions = Object.entries(documentTypeLabels).map(([value, label]) => ({
  value: value as DocumentType,
  label
}));
