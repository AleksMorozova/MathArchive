import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { getAssistantDailyBudget, getAssistantRequest, getAssistantRequests, getAssistantSettings, getAssistantStatistics, getRagStatus, reindexRag, saveAssistantSettings, saveRagText, getRagText, extractRagVision } from '../../api/aiApi';
import { getApiErrorMessage } from '../../api/apiErrors';
import { LoadingState } from '../../components/StateView';
import { analyticsBoundaries, presetDates } from '../../utils/analyticsDates';
import type { AssistantSettings } from '../../types/assistant';

const labels: Record<keyof AssistantSettings, string> = {
  enabled: 'AI-помічник увімкнений', ragEnabled: 'RAG', tutorEnabled: 'Пояснення', exerciseEnabled: 'Вправи', verifierEnabled: 'Перевірка відповідей', generalKnowledgeFallback: 'Загальні математичні знання', llmRouterEnabled: 'AI-маршрутизація',
  tutorModel: 'Модель пояснень', exerciseModel: 'Модель вправ', verifierModel: 'Модель перевірки', routerModel: 'Модель маршрутизації', embeddingModel: 'Модель embeddings', visionModel: 'Модель OCR (порожня — OpenAI:Model)',
  topK: 'Кількість фрагментів', minimumRelevance: 'Мінімальна релевантність (0–1)', chunkCharacters: 'Символів у фрагменті', chunkOverlapCharacters: 'Перекриття, символів', maxDocumentCharacters: 'Максимум символів документа',
  maxPromptLength: 'Максимум символів запитання', maxInputTokens: 'Максимум вхідних токенів', maxOutputTokens: 'Вихідних токенів за виклик', maxAgentCalls: 'Максимум викликів агентів', maxLlmCalls: 'Максимум викликів LLM', maxRetries: 'Максимум повторів', timeoutSeconds: 'Час запиту, секунд',
  maxRequestCostUsd: 'Бюджет запиту, USD', dailyBudgetUsd: 'Денний бюджет, USD', requestsPerIdentityPerMinute: 'Запитів з адреси/користувача за хвилину', globalRequestsPerMinute: 'Запитів сайту за хвилину', maxConcurrentRequests: 'Одночасних запитів', retentionDays: 'Зберігати запитання та відповіді, днів'
};
const money = (n: number) => `$${n.toFixed(6)}`;
interface Execution { AgentName: string; Model: string; InputTokens: number; OutputTokens: number; CostUsd: number; DurationMs: number; Success: boolean; IsParallel: boolean; ErrorCategory?: string }
interface Source { MaterialId: string; Title: string }
export function AssistantAdminPage() {
  const client = useQueryClient();
  const [draft, setDraft] = useState<AssistantSettings | null>(null);
  const [dates, setDates] = useState(() => presetDates(1));
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [visionConfirmation, setVisionConfirmation] = useState<string | null>(null);
  const [material, setMaterial] = useState('');
  const [text, setText] = useState('');
  const range = analyticsBoundaries(dates.from, dates.to);
  const settings = useQuery({ queryKey: ['assistant-admin', 'settings'], queryFn: ({ signal }) => getAssistantSettings(signal) });
  useEffect(() => { if (settings.data && draft === null) setDraft(settings.data); }, [settings.data, draft]);
  const daily = useQuery({ queryKey: ['assistant-admin', 'daily'], queryFn: ({ signal }) => getAssistantDailyBudget(signal), refetchInterval: 30000 });
  const stats = useQuery({ queryKey: ['assistant-admin', 'stats', range], queryFn: ({ signal }) => getAssistantStatistics(range!, signal), enabled: !!range });
  const requests = useQuery({ queryKey: ['assistant-admin', 'requests', range, page], queryFn: ({ signal }) => getAssistantRequests(range!, page, signal), enabled: !!range });
  const rag = useQuery({ queryKey: ['assistant-admin', 'rag'], queryFn: ({ signal }) => getRagStatus(signal), refetchInterval: 3000 });
  const extraction = useQuery({ queryKey: ['assistant-admin', 'text', material], queryFn: ({ signal }) => getRagText(material, signal), enabled: !!material });
  const [hydratedMaterial, setHydratedMaterial] = useState('');
  useEffect(() => { if (extraction.data && hydratedMaterial !== material) { setText(extraction.data.text); setHydratedMaterial(material); } }, [extraction.data, hydratedMaterial, material]);
  const detail = useQuery({ queryKey: ['assistant-admin', 'detail', selected], queryFn: ({ signal }) => getAssistantRequest(selected!, signal), enabled: !!selected });
  const refresh = () => { void client.invalidateQueries({ queryKey: ['assistant-admin'] }); void client.invalidateQueries({ queryKey: ['assistant'] }); };
  const save = useMutation({ mutationFn: saveAssistantSettings, onSuccess: refresh, retry: false });
  const reindex = useMutation({ mutationFn: reindexRag, onSettled: refresh, retry: false });
  const vision = useMutation({ mutationFn: (id: string) => extractRagVision(id || undefined), onSettled: refresh, retry: false });
  const processing = reindex.isPending || vision.isPending;
  const approved = useMutation({ mutationFn: () => saveRagText(material, text), onSuccess: refresh, retry: false });
  return <Stack gap={3}>
    <Typography variant="h3">Керування AI-помічником</Typography>
    {[settings, daily, stats, requests, rag].filter(q => q.isError).map((q, i) => <Alert key={i} severity="error">{getApiErrorMessage(q.error)}</Alert>)}
    {settings.isLoading && <LoadingState />}
    {daily.data && <Card><CardContent><Stack gap={1}><Typography variant="h6">Денний бюджет (UTC)</Typography><Typography>Бюджет: {money(daily.data.budgetUsd)} · Орієнтовно використано/зарезервовано: {money(daily.data.estimatedCommittedUsd)} · Залишок: {money(daily.data.remainingUsd)}</Typography><LinearProgress variant="determinate" value={daily.data.percentConsumed} />{daily.data.exhausted && <Alert severity="warning">Нові платні виклики заблоковані: денний бюджет вичерпано.</Alert>}<Typography variant="body2">Це оцінка застосунку, включно з незавершеними викликами, а не фактичний рахунок OpenAI.</Typography></Stack></CardContent></Card>}
    {draft && <Card><CardContent><Stack component="form" gap={2} onSubmit={e => { e.preventDefault(); if (!save.isPending) save.mutate(draft); }}>
      <Typography variant="h6">Налаштування</Typography><Typography variant="body2">Порожня модель використовує OpenAI:Model. Тарифи задаються на сервері. Зміна моделі embeddings або фрагментів потребує переіндексації.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {(Object.keys(labels) as (keyof AssistantSettings)[]).map(key => typeof draft[key] === 'boolean'
          ? <FormControlLabel key={key} label={labels[key]} control={<Switch checked={Boolean(draft[key])} disabled={save.isPending} onChange={e => setDraft({ ...draft, [key]: e.target.checked })} />} />
          : <TextField key={key} label={labels[key]} type={typeof draft[key] === 'number' ? 'number' : 'text'} value={draft[key]} disabled={save.isPending} inputProps={{ step: 'any' }} onChange={e => setDraft({ ...draft, [key]: typeof draft[key] === 'number' ? Number(e.target.value) : e.target.value })} />)}
      </Box>
      {save.isError && <Alert severity="error">{getApiErrorMessage(save.error)}</Alert>}{save.isSuccess && <Alert severity="success">Налаштування збережено.</Alert>}
      <Button type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Зберігаємо…' : 'Зберегти налаштування'}</Button>
    </Stack></CardContent></Card>}
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
    <Typography variant="h5">Індекс RAG</Typography>
    {rag.data && <Stack gap={2}>
      <Typography>Усього: {rag.data.totalMaterials} · Індексованих: {rag.data.indexedMaterials} · Фрагментів: {rag.data.totalChunks} · Потребують тексту: {rag.data.needsTextMaterials} · На перевірку: {rag.data.needsReviewMaterials} · Очікують: {rag.data.pendingMaterials} · Помилок: {rag.data.failedMaterials}</Typography>
      <Typography>Остання індексація: {rag.data.lastIndexingTime ? new Date(rag.data.lastIndexingTime).toLocaleString('uk-UA') : '—'} · Остання повна переіндексація: {rag.data.lastFullReindex ? new Date(rag.data.lastFullReindex).toLocaleString('uk-UA') : '—'}</Typography>
      <Typography>Embeddings: {rag.data.embedding?.calls ?? 0} викликів · {rag.data.embedding?.tokens ?? 0} токенів · {money(rag.data.embedding?.costUsd ?? 0)}</Typography>
      <Box sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow>{['Файл', 'Усього', 'Нативний текст', 'Індексовані', 'Потрібен текст', 'На перевірку', 'Помилки', 'Очікують'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{rag.data.distribution.map(row => <TableRow key={row.fileType}><TableCell>{row.fileType || 'Без розширення'}</TableCell>{[row.total, row.nativeExtracted, row.indexed, row.needsText, row.needsReview, row.failed, row.pending].map((n, i) => <TableCell key={i}>{n}</TableCell>)}</TableRow>)}</TableBody></Table></Box>
      <Button disabled={processing || approved.isPending || !draft?.enabled || !draft?.ragEnabled} onClick={() => setConfirmation(true)}>{reindex.isPending ? 'Індексуємо…' : 'Переіндексувати RAG'}</Button>
      <Typography>Кандидатів для платного OCR: {rag.data.visionCandidates}. Фактична придатність перевіряється перед викликом. PDF: до 5 сторінок; файли: до 10 МБ; Office: до 5 вбудованих зображень. Великі або непідтримувані джерела потребують ручного тексту.</Typography>
      <Button disabled={processing || approved.isPending || !rag.data.visionCandidates || !draft?.enabled || !draft?.ragEnabled} onClick={() => setVisionConfirmation('')}>{vision.isPending ? 'Розпізнаємо…' : 'Розпізнати матеріали, що потребують тексту'}</Button>
      {processing && <><LinearProgress /><Typography>Результати оновлюються під час обробки. Повторний запуск використовує збережений текст та embeddings.</Typography></>}
      <Typography variant="body2">OCR не розв’язує завдання. Перевір формули й нерозбірливі місця та затвердь текст перед індексацією.</Typography>
      <TextField select label="Матеріал для перевіреного тексту" disabled={processing || approved.isPending} value={material} onChange={e => { setMaterial(e.target.value); setText(''); setHydratedMaterial(''); }}><MenuItem value="">Оберіть матеріал</MenuItem>{rag.data.materials.map(r => <MenuItem key={r.materialId} value={r.materialId}>{r.title} · {r.status}</MenuItem>)}</TextField>
      {extraction.isLoading && <LoadingState />}
      {extraction.isError && <Alert severity="error">{getApiErrorMessage(extraction.error)}</Alert>}
      {extraction.data && <Typography>Спосіб: {extraction.data.extractionMethod || '—'} · Статус: {extraction.data.extractionStatus || '—'} · Час: {extraction.data.extractedAt ? new Date(extraction.data.extractedAt).toLocaleString('uk-UA') : '—'}{extraction.data.extractionError ? ` · Помилка: ${extraction.data.extractionError}` : ''}</Typography>}
      {material && <Button component="a" href={`/materials/${material}`} target="_blank" rel="noopener noreferrer">Переглянути матеріал</Button>}
      <Button disabled={!rag.data.materials.find(r => r.materialId === material)?.visionEligible || processing || approved.isPending || !draft?.enabled || !draft?.ragEnabled} onClick={() => setVisionConfirmation(material)}>Розпізнати вибраний матеріал</Button>
      <Button disabled={!material || extraction.isFetching || approved.isPending || processing} onClick={() => { if (extraction.data) { setText(extraction.data.text); setHydratedMaterial(material); } }}>Завантажити збережений текст</Button>
      {extraction.data?.approvedText && extraction.data.extractedText && <Button disabled={approved.isPending || processing} onClick={() => setText(extraction.data!.extractedText!)}>Завантажити початковий текст ({extraction.data.originalExtractionMethod})</Button>}
      <TextField multiline minRows={6} label="Перевірений текст" value={text} disabled={approved.isPending || processing || extraction.isLoading} onChange={e => setText(e.target.value)} />
      <Button disabled={!material || !text.trim() || approved.isPending || processing || extraction.isLoading} onClick={() => approved.mutate()}>{approved.isPending ? 'Зберігаємо та індексуємо…' : 'Зберегти текст та індексувати'}</Button>
    </Stack>}
    {vision.isError && <Alert severity="error">{getApiErrorMessage(vision.error)}</Alert>}
    <Dialog open={visionConfirmation !== null} onClose={() => setVisionConfirmation(null)}><DialogTitle>Запустити платне розпізнавання?</DialogTitle><DialogContent>Матеріалів-кандидатів: {visionConfirmation ? 1 : rag.data?.visionCandidates ?? 0}. Модель: {draft?.visionModel || 'OpenAI:Model'}. Максимальний бюджет на матеріал: {money(draft?.maxRequestCostUsd ?? 0)}. Денний залишок: {money(daily.data?.remainingUsd ?? 0)}. Нативний текст має пріоритет. Збережений OCR не повторюється. Результати потребуватимуть перевірки вчителем.</DialogContent><DialogActions><Button onClick={() => setVisionConfirmation(null)}>Скасувати</Button><Button onClick={() => { const id = visionConfirmation!; setVisionConfirmation(null); vision.mutate(id); }}>Підтвердити платне OCR</Button></DialogActions></Dialog>
    {reindex.isError && <Alert severity="error">{getApiErrorMessage(reindex.error)}</Alert>}{approved.isError && <Alert severity="error">{getApiErrorMessage(approved.error)}</Alert>}
    <Dialog open={confirmation} onClose={() => setConfirmation(false)}><DialogTitle>Переіндексувати матеріали?</DialogTitle><DialogContent>Операція може витратити бюджет embeddings. Незмінені фрагменти використовують наявні embeddings.</DialogContent><DialogActions><Button onClick={() => setConfirmation(false)}>Скасувати</Button><Button onClick={() => { setConfirmation(false); reindex.mutate(); }}>Підтвердити</Button></DialogActions></Dialog>
    <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="md"><DialogTitle>Деталі запиту</DialogTitle><DialogContent>{detail.isLoading && <LoadingState />}{detail.isError && <Alert severity="error">{getApiErrorMessage(detail.error)}</Alert>}{detail.data && <Stack gap={2}><Typography sx={{ whiteSpace: 'pre-wrap' }}>{detail.data.query}</Typography><Typography>Намір: {detail.data.intent} · Статус: {detail.data.status} · Повторів: {detail.data.retries} · Фрагментів: {detail.data.retrievedChunks}</Typography>{(JSON.parse(detail.data.executionsJson) as Execution[]).map((e, i) => <Typography key={i}>{i+1}. {e.AgentName}{e.IsParallel ? ' (паралельно)' : ''} · {e.Model} · {e.InputTokens}/{e.OutputTokens} токенів · {money(e.CostUsd)} · {e.DurationMs} мс · {e.Success ? 'Успішно' : e.ErrorCategory}</Typography>)}<Typography variant="h6">Отримані матеріали</Typography>{(JSON.parse(detail.data.sourcesJson) as Source[]).map(s => <Typography key={s.MaterialId}>{s.Title}</Typography>)}<Typography variant="h6">Відповідь</Typography><Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail.data.answer || 'Відповіді немає.'}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>Закрити</Button></DialogActions></Dialog>
  </Stack>;
}
