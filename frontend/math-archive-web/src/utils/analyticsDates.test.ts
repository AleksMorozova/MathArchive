import { describe, expect, it } from 'vitest';
import { analyticsBoundaries, localDateValue, presetDates } from './analyticsDates';

describe('analytics calendar dates', () => {
  it('uses today and the previous six calendar days across month boundaries', () => {
    const now = new Date(2026, 8, 2, 23, 59);
    expect(presetDates(1, now)).toEqual({ from: '2026-09-02', to: '2026-09-02' });
    expect(presetDates(7, now)).toEqual({ from: '2026-08-27', to: '2026-09-02' });
  });
  it('converts local midnight and the next local midnight independently to UTC', () => {
    for (const [month, day] of [[2, 29], [9, 25]]) {
      const start = new Date(2026, month, day);
      const end = new Date(2026, month, day + 1);
      expect(analyticsBoundaries(localDateValue(start), localDateValue(start))).toEqual({ from: start.toISOString(), to: end.toISOString() });
    }
  });
  it('rejects empty, invalid, and reversed dates', () => {
    expect(analyticsBoundaries('', '2026-08-31')).toBeNull();
    expect(analyticsBoundaries('2026-09-01', '2026-08-31')).toBeNull();
    expect(analyticsBoundaries('2026-02-30', '2026-03-01')).toBeNull();
  });
});
