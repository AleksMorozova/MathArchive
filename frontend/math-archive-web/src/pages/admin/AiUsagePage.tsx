import { Alert, Box, Button, Card, CardContent, MenuItem, Pagination, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getAiUsageHistory, getAiUsageSummary } from '../../api/aiApi';
import { getApiErrorMessage } from '../../api/apiErrors';
import { ErrorState, LoadingState } from '../../components/StateView';
import type { AiUsageFilters } from '../../types/ai';
import { analyticsBoundaries, localDateValue, presetDates } from '../../utils/analyticsDates';

const statusLabels = { Succeeded: 'Успішно', Failed: 'Помилка', TimedOut: 'Час вичерпано', Cancelled: 'Скасовано' } as const;
const initialFilters: AiUsageFilters = { page: 1, pageSize: 20 };
const money = (value: number | null) => value === null ? 'Не розраховано' : `$${value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`;

export function AiUsagePage() {
  const [filters, setFilters] = useState(initialFilters);
  const summary = useQuery({ queryKey: ['ai-usage', 'summary'], queryFn: ({ signal }) => getAiUsageSummary(signal) });
  const history = useQuery({ queryKey: ['ai-usage', 'history', filters], queryFn: ({ signal }) => getAiUsageHistory(filters, signal) });
  const update = (next: Partial<AiUsageFilters>) => setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));
  const setPreset = (days?: number, currentMonth = false) => {
    const now = new Date();
    const dates = currentMonth ? { from: localDateValue(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDateValue(now) } : presetDates(days ?? 1, now);
    const range = analyticsBoundaries(dates.from, dates.to)!;
    update(range);
  };
  return <Stack gap={3}>
    <Typography variant="h3">Використання AI</Typography>
    {summary.isLoading && <LoadingState />}
    {summary.isError && <ErrorState message={getApiErrorMessage(summary.error)} />}
    {summary.data && <>
      {summary.data.limitUsagePercent >= 80 && <Alert severity={summary.data.limitReached ? 'error' : 'warning'}>{summary.data.limitReached ? 'Місячний ліміт використання AI вичерпано.' : 'Використано понад 80% місячного ліміту AI.'}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 2 }}>
        {[
          ['Запитів за сьогодні', summary.data.requestsToday], ['Запитів за місяць', summary.data.requestsThisMonth],
          ['Успішних', summary.data.succeeded], ['З помилкою', summary.data.failed], ['Вхідних токенів', summary.data.inputTokens],
          ['Вихідних токенів', summary.data.outputTokens], ['Усього токенів', summary.data.totalTokens],
          ['Орієнтовна вартість за місяць', money(summary.data.estimatedCostThisMonthUsd)],
          ['Середній час відповіді', summary.data.averageDurationMilliseconds === null ? '—' : `${Math.round(summary.data.averageDurationMilliseconds)} мс`]
        ].map(([label, value]) => <Card key={label}><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5">{value}</Typography></CardContent></Card>)}
      </Box>
      <Typography color="text.secondary">Вартість орієнтовна та залежить від актуальних тарифів OpenAI.</Typography>
    </>}
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} flexWrap="wrap"><Button onClick={() => setPreset(1)}>Сьогодні</Button><Button onClick={() => setPreset(7)}>Останні 7 днів</Button><Button onClick={() => setPreset(undefined, true)}>Поточний місяць</Button></Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
      <TextField type="date" label="Від" InputLabelProps={{ shrink: true }} value={filters.from ? localDateValue(new Date(filters.from)) : ''} onChange={(e) => update({ from: e.target.value ? analyticsBoundaries(e.target.value, e.target.value)?.from : undefined })} />
      <TextField type="date" label="До" InputLabelProps={{ shrink: true }} value={filters.to ? localDateValue(new Date(new Date(filters.to).getTime() - 1)) : ''} onChange={(e) => update({ to: e.target.value ? analyticsBoundaries(e.target.value, e.target.value)?.to : undefined })} />
      <TextField select label="Статус" value={filters.status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })} sx={{ minWidth: 180 }}><MenuItem value="">Усі</MenuItem>{Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <TextField label="Модель" value={filters.model ?? ''} onChange={(e) => update({ model: e.target.value || undefined })} />
      <TextField select label="Операція" value={filters.operation ?? ''} onChange={(e) => update({ operation: e.target.value || undefined })} sx={{ minWidth: 190 }}><MenuItem value="">Усі</MenuItem><MenuItem value="MaterialAnalysis">Аналіз матеріалу</MenuItem></TextField>
    </Stack>
    {history.isLoading && <LoadingState />}
    {history.isError && <ErrorState message={getApiErrorMessage(history.error)} />}
    {history.data && <Box sx={{ overflowX: 'auto' }}><Table className="admin-table"><TableHead><TableRow><TableCell>Дата і час</TableCell><TableCell>Операція</TableCell><TableCell>Модель</TableCell><TableCell>Статус</TableCell><TableCell>Вхідні</TableCell><TableCell>Вихідні</TableCell><TableCell>Усього</TableCell><TableCell>Тривалість</TableCell><TableCell>Вартість</TableCell></TableRow></TableHead><TableBody>{history.data.items.map((item) => <TableRow key={item.id}><TableCell>{new Date(item.startedAt).toLocaleString('uk-UA')}</TableCell><TableCell>{item.operation}</TableCell><TableCell>{item.model}</TableCell><TableCell>{statusLabels[item.status]}</TableCell><TableCell>{item.inputTokens ?? '—'}</TableCell><TableCell>{item.outputTokens ?? '—'}</TableCell><TableCell>{item.totalTokens ?? '—'}</TableCell><TableCell>{item.durationMilliseconds} мс</TableCell><TableCell>{money(item.estimatedCostUsd)}</TableCell></TableRow>)}</TableBody></Table></Box>}
    {history.data && history.data.totalPages > 1 && <Pagination page={history.data.page} count={history.data.totalPages} onChange={(_, page) => update({ page })} />}
  </Stack>;
}
