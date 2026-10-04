import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { getAssistantRequest, getAssistantRequests, getAssistantStatistics } from '../../api/aiApi';
import { getApiErrorMessage } from '../../api/apiErrors';
import { LoadingState } from '../../components/StateView';
import { analyticsBoundaries, presetDates } from '../../utils/analyticsDates';
const money = (n: number) => `$${n.toFixed(6)}`;
interface Execution { AgentName: string; Model: string; InputTokens: number; OutputTokens: number; CostUsd: number; DurationMs: number; Success: boolean; IsParallel: boolean; ErrorCategory?: string }
interface Source { MaterialId: string; Title: string }
export function AssistantStatisticsPage() {
  const client = useQueryClient();
  const [dates, setDates] = useState(() => presetDates(1));
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const range = analyticsBoundaries(dates.from, dates.to);
  const stats = useQuery({ queryKey: ['assistant-admin', 'stats', range], queryFn: ({ signal }) => getAssistantStatistics(range!, signal), enabled: !!range });
  const requests = useQuery({ queryKey: ['assistant-admin', 'requests', range, page], queryFn: ({ signal }) => getAssistantRequests(range!, page, signal), enabled: !!range });
  const detail = useQuery({ queryKey: ['assistant-admin', 'detail', selected], queryFn: ({ signal }) => getAssistantRequest(selected!, signal), enabled: !!selected });
  const refresh = () => { for (const key of ['stats', 'requests', 'detail']) void client.invalidateQueries({ queryKey: ['assistant-admin', key] }); };
  return <Stack gap={3}>
    <Typography variant="h3">Статистика AI-помічника</Typography>
    {[stats, requests].filter(q => q.isError).map((q, i) => <Alert key={i} severity="error">{getApiErrorMessage(q.error)}</Alert>)}
    <Typography variant="h5">Статистика за період</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button onClick={() => { setDates(presetDates(1)); setPage(1); }}>Сьогодні</Button><Button onClick={() => { setDates(presetDates(7)); setPage(1); }}>Останні 7 днів</Button><TextField type="date" label="Від" value={dates.from} InputLabelProps={{ shrink: true }} onChange={e => { setDates({ ...dates, from: e.target.value }); setPage(1); }} /><TextField type="date" label="До" value={dates.to} InputLabelProps={{ shrink: true }} onChange={e => { setDates({ ...dates, to: e.target.value }); setPage(1); }} /><Button onClick={refresh}>Оновити</Button></Stack>
    {!range && <Alert severity="warning">Перевір дати періоду.</Alert>}
    {stats.isLoading && <LoadingState />}
    {stats.data && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 2 }}>{[
        ['Запитів', stats.data.requests], ['Успішних', stats.data.succeeded], ['Неуспішних', stats.data.failed], ['Обмежено частоту', stats.data.rateLimited], ['Вичерпано бюджет', stats.data.budgetRejected], ['Викликів LLM', stats.data.llmCalls], ['Пошуків RAG', stats.data.ragSearches], ['Вхідних токенів', stats.data.inputTokens], ['Вихідних токенів', stats.data.outputTokens], ['Усього токенів', stats.data.inputTokens + stats.data.outputTokens], ['Орієнтовна вартість', money(stats.data.costUsd)], ['Вартість/запит', money(stats.data.requests ? stats.data.costUsd / stats.data.requests : 0)], ['Середній час', `${Math.round(stats.data.averageDurationMs)} мс`], ['Активних денних ідентифікаторів', stats.data.activeUsers], ['Пік одночасних запитів', stats.data.peakConcurrency ?? 0], ['Повторів', stats.data.retries], ['Отримано фрагментів', stats.data.retrievedChunks]
      ].map(([label, value]) => <Card key={label}><CardContent><Typography variant="body2">{label}</Typography><Typography variant="h5">{value}</Typography></CardContent></Card>)}</Box>
      <Box sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow>{['Агент', 'Викликів', 'Помилок', 'Токенів', 'Вартість', 'Середній час'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{stats.data.agents.map(a => <TableRow key={a.agentName}><TableCell>{a.agentName}</TableCell><TableCell>{a.calls}</TableCell><TableCell>{a.failures}</TableCell><TableCell>{a.inputTokens + a.outputTokens}</TableCell><TableCell>{money(a.costUsd)}</TableCell><TableCell>{Math.round(a.averageDurationMs)} мс</TableCell></TableRow>)}</TableBody></Table></Box>
    </>}
    {stats.data && <Stack gap={1}><Typography>Поширені наміри: {stats.data.intents?.map(x => `${x.label}: ${x.requests}`).join(' · ') || '—'}</Typography><Typography>Поширені теми: {stats.data.topics?.map(x => `${x.label}: ${x.requests}`).join(' · ') || '—'}</Typography><Typography>Запити за годинами UTC: {stats.data.hoursUtc?.map(x => `${x.label}: ${x.requests}`).join(' · ') || '—'}</Typography></Stack>}
    <Typography variant="h5">Останні запити</Typography>
    {requests.isLoading && <LoadingState />}
    <Box sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow>{['Час', 'Запитання', 'Клас', 'Намір', 'Токенів', 'Вартість', 'Тривалість', 'Статус'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{requests.data?.map(r => <TableRow key={r.id}><TableCell>{new Date(r.createdAt).toLocaleString('uk-UA')}</TableCell><TableCell><Button onClick={() => setSelected(r.id)}>{r.queryPreview}</Button></TableCell><TableCell>{r.grade ?? '—'}</TableCell><TableCell>{r.intent}</TableCell><TableCell>{r.inputTokens + r.outputTokens}</TableCell><TableCell>{money(r.costUsd)}</TableCell><TableCell>{r.durationMs} мс</TableCell><TableCell>{r.status}</TableCell></TableRow>)}</TableBody></Table></Box>
    {requests.data?.length === 0 && <Typography>Запитів за цей період немає.</Typography>}
    <Stack direction="row"><Button disabled={page === 1 || requests.isFetching} onClick={() => setPage(page - 1)}>Назад</Button><Typography sx={{ p: 1 }}>Сторінка {page}</Typography><Button disabled={requests.data?.length !== 20 || requests.isFetching} onClick={() => setPage(page + 1)}>Далі</Button></Stack>
    <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="md"><DialogTitle>Деталі запиту</DialogTitle><DialogContent>{detail.isLoading && <LoadingState />}{detail.isError && <Alert severity="error">{getApiErrorMessage(detail.error)}</Alert>}{detail.data && <Stack gap={2}><Typography sx={{ whiteSpace: 'pre-wrap' }}>{detail.data.query}</Typography><Typography>Намір: {detail.data.intent} · Статус: {detail.data.status} · Повторів: {detail.data.retries} · Фрагментів: {detail.data.retrievedChunks}</Typography>{(JSON.parse(detail.data.executionsJson) as Execution[]).map((e, i) => <Typography key={i}>{i+1}. {e.AgentName}{e.IsParallel ? ' (паралельно)' : ''} · {e.Model} · {e.InputTokens}/{e.OutputTokens} токенів · {money(e.CostUsd)} · {e.DurationMs} мс · {e.Success ? 'Успішно' : e.ErrorCategory}</Typography>)}<Typography variant="h6">Отримані матеріали</Typography>{(JSON.parse(detail.data.sourcesJson) as Source[]).map(s => <Typography key={s.MaterialId}>{s.Title}</Typography>)}<Typography variant="h6">Відповідь</Typography><Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail.data.answer || 'Відповіді немає.'}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>Закрити</Button></DialogActions></Dialog>
  </Stack>;
}
