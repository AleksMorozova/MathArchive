export function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function presetDates(days: number, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days + 1);
  return { from: localDateValue(start), to: localDateValue(now) };
}

export function analyticsBoundaries(from: string, to: string) {
  if (!from || !to || from > to) return null;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || localDateValue(start) !== from || localDateValue(end) !== to) return null;
  // Calendar arithmetic, not +24 hours: a daylight-saving transition can change day length.
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
