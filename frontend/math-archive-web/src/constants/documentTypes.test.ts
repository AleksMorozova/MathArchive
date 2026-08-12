import { describe, expect, it } from 'vitest';
import { documentTypeLabels } from './documentTypes';

describe('documentTypeLabels', () => {
  it('maps API enum values to Ukrainian labels', () => {
    expect(documentTypeLabels.Formula).toBe('Формули');
    expect(documentTypeLabels.Test).toBe('Контрольна робота');
    expect(documentTypeLabels.IndependentWork).toBe('Самостійна робота');
    expect(documentTypeLabels.Homework).toBe('Домашнє завдання');
    expect(documentTypeLabels.Theory).toBe('Теоретичний матеріал');
    expect(documentTypeLabels.MethodicalMaterial).toBe('Методичний матеріал');
    expect(documentTypeLabels.Other).toBe('Інше');
    expect(documentTypeLabels.Memo).toBe('Пам’ятка');
  });
});
