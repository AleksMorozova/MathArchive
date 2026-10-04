import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { getAssistantDailyBudget, getAssistantSettings, getRagStatus, reindexRag, saveAssistantSettings, saveRagText, getRagText, extractRagVision, scheduleRagIndexing } from '../../api/aiApi';
import { getApiErrorMessage } from '../../api/apiErrors';
import { LoadingState } from '../../components/StateView';
import type { AssistantSettings } from '../../types/assistant';

const labels: Record<keyof AssistantSettings, string> = {
  enabled: 'Публічний AI-помічник увімкнений', ragEnabled: 'RAG / автоматична індексація', tutorEnabled: 'Пояснення', exerciseEnabled: 'Вправи', verifierEnabled: 'Перевірка відповідей', generalKnowledgeFallback: 'Загальні математичні знання', llmRouterEnabled: 'AI-маршрутизація',
  tutorModel: 'Модель пояснень', exerciseModel: 'Модель вправ', verifierModel: 'Модель перевірки', routerModel: 'Модель маршрутизації', embeddingModel: 'Модель embeddings', visionModel: 'Модель OCR (порожня — OpenAI:Model)',
  topK: 'Кількість фрагментів', minimumRelevance: 'Мінімальна релевантність (0–1)', chunkCharacters: 'Символів у фрагменті', chunkOverlapCharacters: 'Перекриття, символів', maxDocumentCharacters: 'Максимум символів документа',
  maxPromptLength: 'Максимум символів запитання', maxInputTokens: 'Максимум вхідних токенів', maxOutputTokens: 'Вихідних токенів за виклик', maxAgentCalls: 'Максимум викликів агентів', maxLlmCalls: 'Максимум викликів LLM', maxRetries: 'Максимум повторів', timeoutSeconds: 'Час запиту, секунд',
  maxRequestCostUsd: 'Бюджет запиту, USD', dailyBudgetUsd: 'Денний бюджет, USD', requestsPerIdentityPerMinute: 'Запитів з адреси/користувача за хвилину', globalRequestsPerMinute: 'Запитів сайту за хвилину', maxConcurrentRequests: 'Одночасних запитів', retentionDays: 'Зберігати запитання та відповіді, днів'
};
const money = (n: number) => `$${n.toFixed(6)}`;
const toggleDescriptions: Partial<Record<keyof AssistantSettings, string>> = {
  enabled: 'Дозволяє учням користуватися AI-помічником на сайті. Вимкнення не змінює підготовлений індекс.',
  ragEnabled: 'Дозволяє платну обробку матеріалів, OCR зображень, індексацію та пошук у матеріалах. Працює без публічного помічника.',
};
export function AssistantAdminPage() {
  const client = useQueryClient();
  const [draft, setDraft] = useState<AssistantSettings | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [visionConfirmation, setVisionConfirmation] = useState<string | null>(null);
  const [material, setMaterial] = useState('');
  const [text, setText] = useState('');
  const settings = useQuery({ queryKey: ['assistant-admin', 'settings'], queryFn: ({ signal }) => getAssistantSettings(signal) });
  useEffect(() => { if (settings.data && draft === null) setDraft(settings.data); }, [settings.data, draft]);
  const daily = useQuery({ queryKey: ['assistant-admin', 'daily'], queryFn: ({ signal }) => getAssistantDailyBudget(signal), refetchInterval: 30000 });
  const rag = useQuery({ queryKey: ['assistant-admin', 'rag'], queryFn: ({ signal }) => getRagStatus(signal), refetchInterval: 3000 });
  const extraction = useQuery({ queryKey: ['assistant-admin', 'text', material], queryFn: ({ signal }) => getRagText(material, signal), enabled: !!material });
  const [hydratedMaterial, setHydratedMaterial] = useState('');
  useEffect(() => { if (extraction.data && hydratedMaterial !== material) { setText(extraction.data.text); setHydratedMaterial(material); } }, [extraction.data, hydratedMaterial, material]);
  const refresh = () => { void client.invalidateQueries({ queryKey: ['assistant-admin'] }); void client.invalidateQueries({ queryKey: ['assistant'] }); };
  const save = useMutation({ mutationFn: saveAssistantSettings, onSuccess: refresh, retry: false });
  const reindex = useMutation({ mutationFn: reindexRag, onSettled: refresh, retry: false });
  const vision = useMutation({ mutationFn: (id: string) => extractRagVision(id || undefined), onSettled: refresh, retry: false });
  const schedule = useMutation({ mutationFn: (id?: string) => scheduleRagIndexing(id), onSettled: refresh, retry: false });
  const processing = reindex.isPending || vision.isPending || schedule.isPending;
  const approved = useMutation({ mutationFn: () => saveRagText(material, text), onSuccess: refresh, retry: false });
  return <Stack gap={3}>
    <Typography variant="h3">Керування AI-помічником</Typography>
    {[settings, daily, rag].filter(q => q.isError).map((q, i) => <Alert key={i} severity="error">{getApiErrorMessage(q.error)}</Alert>)}
    {settings.isLoading && <LoadingState />}
    {daily.data && <Card><CardContent><Stack gap={1}><Typography variant="h6">Денний бюджет (UTC)</Typography><Typography>Бюджет: {money(daily.data.budgetUsd)} · Орієнтовно використано/зарезервовано: {money(daily.data.estimatedCommittedUsd)} · Залишок: {money(daily.data.remainingUsd)}</Typography><LinearProgress variant="determinate" value={daily.data.percentConsumed} />{daily.data.exhausted && <Alert severity="warning">Нові платні виклики заблоковані: денний бюджет вичерпано.</Alert>}<Typography variant="body2">Це оцінка застосунку, включно з незавершеними викликами, а не фактичний рахунок OpenAI.</Typography></Stack></CardContent></Card>}
    {draft && <Card><CardContent><Stack component="form" gap={2} onSubmit={e => { e.preventDefault(); if (!save.isPending) save.mutate(draft); }}>
      <Typography variant="h6">Налаштування</Typography><Typography variant="body2">Порожня модель використовує OpenAI:Model. Тарифи задаються на сервері. Зміна моделі embeddings або фрагментів потребує переіндексації.</Typography>
      <Typography variant="body2">Щоб зупинити всі платні операції помічника та RAG, вимкни обидва перемикачі й збережи налаштування. Це не видаляє матеріали, текст або індекс.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {(Object.keys(labels) as (keyof AssistantSettings)[]).map(key => typeof draft[key] === 'boolean'
          ? <Stack key={key}><FormControlLabel label={labels[key]} control={<Switch checked={Boolean(draft[key])} disabled={save.isPending} slotProps={{ input: { 'aria-describedby': toggleDescriptions[key] ? `assistant-setting-${key}` : undefined } }} onChange={e => setDraft({ ...draft, [key]: e.target.checked })} />} />{toggleDescriptions[key] && <Typography id={`assistant-setting-${key}`} variant="body2" color="text.secondary">{toggleDescriptions[key]}</Typography>}</Stack>
          : <TextField key={key} label={labels[key]} type={typeof draft[key] === 'number' ? 'number' : 'text'} value={draft[key]} disabled={save.isPending} inputProps={{ step: 'any' }} onChange={e => setDraft({ ...draft, [key]: typeof draft[key] === 'number' ? Number(e.target.value) : e.target.value })} />)}
      </Box>
      {save.isError && <Alert severity="error">{getApiErrorMessage(save.error)}</Alert>}{save.isSuccess && <Alert severity="success">Налаштування збережено.</Alert>}
      <Button type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Зберігаємо…' : 'Зберегти налаштування'}</Button>
    </Stack></CardContent></Card>}
    <Stack direction="row" alignItems="center" gap={2}><Typography variant="h5">Індекс RAG</Typography><Button onClick={refresh}>Оновити</Button></Stack>
    <Typography variant="body2">Нові та змінені матеріали індексуються автоматично, коли RAG увімкнений. Зображення використовують платне OCR. Публічного помічника можна залишити вимкненим. Вимкнення RAG зупиняє індексацію.</Typography>
    <Button disabled={processing || approved.isPending || !draft?.ragEnabled} onClick={() => schedule.mutate(undefined)}>Індексувати відсутні / повторити невдалі</Button>
    {schedule.isSuccess && <Alert severity="info">Матеріали очікують індексації. Обробка послідовна та обмежена денним бюджетом.</Alert>}
    {schedule.isError && <Alert severity="error">{getApiErrorMessage(schedule.error)}</Alert>}
    {rag.data && <Stack gap={2}>
      <Typography>Індексуються зараз: {rag.data.materials.filter(r => r.status === 'Indexing').length}</Typography>
      <Typography>Усього: {rag.data.totalMaterials} · Індексованих: {rag.data.indexedMaterials} · Фрагментів: {rag.data.totalChunks} · Потребують тексту: {rag.data.needsTextMaterials} · На перевірку: {rag.data.needsReviewMaterials} · Очікують: {rag.data.pendingMaterials} · Помилок: {rag.data.failedMaterials}</Typography>
      <Typography>Остання індексація: {rag.data.lastIndexingTime ? new Date(rag.data.lastIndexingTime).toLocaleString('uk-UA') : '—'} · Остання повна переіндексація: {rag.data.lastFullReindex ? new Date(rag.data.lastFullReindex).toLocaleString('uk-UA') : '—'}</Typography>
      <Typography>Embeddings: {rag.data.embedding?.calls ?? 0} викликів · {rag.data.embedding?.tokens ?? 0} токенів · {money(rag.data.embedding?.costUsd ?? 0)}</Typography>
      <Box sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow>{['Файл', 'Усього', 'Нативний текст', 'Індексовані', 'Потрібен текст', 'На перевірку', 'Помилки', 'Очікують'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{rag.data.distribution.map(row => <TableRow key={row.fileType}><TableCell>{row.fileType || 'Без розширення'}</TableCell>{[row.total, row.nativeExtracted, row.indexed, row.needsText, row.needsReview, row.failed, row.pending].map((n, i) => <TableCell key={i}>{n}</TableCell>)}</TableRow>)}</TableBody></Table></Box>
      <Button disabled={processing || approved.isPending || !draft?.ragEnabled} onClick={() => setConfirmation(true)}>{reindex.isPending ? 'Індексуємо…' : 'Переіндексувати RAG'}</Button>
      <Typography>Кандидатів для платного OCR: {rag.data.visionCandidates}. Фактична придатність перевіряється перед викликом. PDF: до 5 сторінок; файли: до 10 МБ; Office: до 5 вбудованих зображень. Великі або непідтримувані джерела потребують ручного тексту.</Typography>
      <Button disabled={processing || approved.isPending || !rag.data.visionCandidates || !draft?.ragEnabled} onClick={() => setVisionConfirmation('')}>{vision.isPending ? 'Розпізнаємо…' : 'Розпізнати матеріали, що потребують тексту'}</Button>
      {processing && <><LinearProgress /><Typography>Результати оновлюються під час обробки. Повторний запуск використовує збережений текст та embeddings.</Typography></>}
      <Typography variant="body2">OCR лише переписує вміст. Придатний текст індексується автоматично. Перевір формули та за потреби збережи виправлений текст — він матиме пріоритет.</Typography>
      <TextField select label="Матеріал для перевіреного тексту" disabled={processing || approved.isPending} value={material} onChange={e => { setMaterial(e.target.value); setText(''); setHydratedMaterial(''); }}><MenuItem value="">Оберіть матеріал</MenuItem>{rag.data.materials.map(r => <MenuItem key={r.materialId} value={r.materialId}>{r.title} · {r.status}</MenuItem>)}</TextField>
      {extraction.isLoading && <LoadingState />}
      {extraction.isError && <Alert severity="error">{getApiErrorMessage(extraction.error)}</Alert>}
      {extraction.data && <Typography>Спосіб: {extraction.data.extractionMethod || '—'} · Статус: {extraction.data.extractionStatus || '—'} · Час: {extraction.data.extractedAt ? new Date(extraction.data.extractedAt).toLocaleString('uk-UA') : '—'}{extraction.data.extractionError ? ` · Помилка: ${extraction.data.extractionError}` : ''}</Typography>}
      {material && <Button component="a" href={`/materials/${material}`} target="_blank" rel="noopener noreferrer">Переглянути матеріал</Button>}
      {material && <Typography>Стан індексації: {rag.data.materials.find(r => r.materialId === material)?.status || 'Pending'}</Typography>}
      <Button disabled={!rag.data.materials.find(r => r.materialId === material)?.visionEligible || processing || approved.isPending || !draft?.ragEnabled} onClick={() => setVisionConfirmation(material)}>Розпізнати вибраний матеріал</Button>
      <Button disabled={!material || processing || approved.isPending || !draft?.ragEnabled || rag.data.materials.find(r => r.materialId === material)?.status === 'Indexing'} onClick={() => schedule.mutate(material)}>Повторити індексацію</Button>
      <Button disabled={!material || extraction.isFetching || approved.isPending || processing} onClick={() => { if (extraction.data) { setText(extraction.data.text); setHydratedMaterial(material); } }}>Завантажити збережений текст</Button>
      {extraction.data?.approvedText && extraction.data.extractedText && <Button disabled={approved.isPending || processing} onClick={() => setText(extraction.data!.extractedText!)}>Завантажити початковий текст ({extraction.data.originalExtractionMethod})</Button>}
      <TextField multiline minRows={6} label="Перевірений текст" value={text} disabled={approved.isPending || processing || extraction.isLoading} onChange={e => setText(e.target.value)} />
      <Button disabled={!material || !text.trim() || approved.isPending || processing || extraction.isLoading} onClick={() => approved.mutate()}>{approved.isPending ? 'Зберігаємо та індексуємо…' : 'Зберегти текст та індексувати'}</Button>
    </Stack>}
    {vision.isError && <Alert severity="error">{getApiErrorMessage(vision.error)}</Alert>}
    <Dialog open={visionConfirmation !== null} onClose={() => setVisionConfirmation(null)}><DialogTitle>Запустити платне розпізнавання?</DialogTitle><DialogContent>Матеріалів-кандидатів: {visionConfirmation ? 1 : rag.data?.visionCandidates ?? 0}. Модель: {draft?.visionModel || 'OpenAI:Model'}. Максимальний бюджет на матеріал: {money(draft?.maxRequestCostUsd ?? 0)}. Денний залишок: {money(daily.data?.remainingUsd ?? 0)}. Нативний текст має пріоритет. Збережений OCR не повторюється. Придатний текст індексується автоматично; учитель може перевірити й виправити його.</DialogContent><DialogActions><Button onClick={() => setVisionConfirmation(null)}>Скасувати</Button><Button onClick={() => { const id = visionConfirmation!; setVisionConfirmation(null); vision.mutate(id); }}>Підтвердити платне OCR</Button></DialogActions></Dialog>
    {reindex.isError && <Alert severity="error">{getApiErrorMessage(reindex.error)}</Alert>}{approved.isError && <Alert severity="error">{getApiErrorMessage(approved.error)}</Alert>}
    <Dialog open={confirmation} onClose={() => setConfirmation(false)}><DialogTitle>Переіндексувати матеріали?</DialogTitle><DialogContent>Операція може витратити бюджет OCR та embeddings. Незмінені джерела й фрагменти використовують збережений текст та embeddings.</DialogContent><DialogActions><Button onClick={() => setConfirmation(false)}>Скасувати</Button><Button onClick={() => { setConfirmation(false); reindex.mutate(); }}>Підтвердити</Button></DialogActions></Dialog>

  </Stack>;
}
