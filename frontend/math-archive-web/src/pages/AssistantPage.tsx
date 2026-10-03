import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, CardContent, Container, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { askAssistant, getAssistantStatus } from '../api/aiApi';
import { getApiErrorMessage } from '../api/apiErrors';
import { LoadingState, ErrorState } from '../components/StateView';
import { Seo } from '../seo/Seo';

export function AssistantPage() {
  const status = useQuery({ queryKey: ['assistant', 'status'], queryFn: ({ signal }) => getAssistantStatus(signal), staleTime: 15000, refetchInterval: 30000 });
  const [question, setQuestion] = useState('');
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const answer = useMutation({ mutationFn: async () => {
    controller.current = new AbortController();
    return askAssistant(question.trim(), grade ? Number(grade) : undefined, topic.trim() || undefined, controller.current.signal);
  }, retry: false, onSettled: () => { busy.current = false; } });
  const disabled = !status.data?.enabled || answer.isPending;
  return <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}><Stack gap={3}>
    <Seo title="AI-помічник | MathArchive" description="Пояснення, вправи та пошук навчальних матеріалів з математики." canonicalPath="/assistant" noIndex />
    <Typography variant="h3">Математичний AI-помічник</Typography>
    <Typography>Запитай про тему, знайди матеріал або потренуйся розв’язувати задачі.</Typography>
    <Typography variant="body2" color="text.secondary">AI-помічник може помилятися. Перевіряй важливі відповіді за навчальними матеріалами. Не надсилай особисті дані. Запитання й відповіді тимчасово зберігаються для перевірки якості вчителем.</Typography>
    {status.isLoading && <LoadingState />}
    {status.isError && <ErrorState message={getApiErrorMessage(status.error)} />}
    {status.data && !status.data.enabled && <Alert severity="info">AI-помічник тимчасово вимкнений. <Link to="/materials">Переглянути матеріали</Link></Alert>}
    <Stack direction="row" gap={1} flexWrap="wrap">{['Поясни тему', 'Знайди матеріал', 'Дай мені завдання', 'Перевір моє розв’язання'].map(label => <Button key={label} disabled={disabled} onClick={() => setQuestion(`${label}: `)}>{label}</Button>)}</Stack>
    <Stack component="form" gap={2} onSubmit={event => {
      event.preventDefault();
      if (disabled || busy.current || !question.trim()) return;
      busy.current = true;
      answer.mutate();
    }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
        <TextField select label="Клас" value={grade} disabled={disabled} onChange={e => setGrade(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Усі класи</MenuItem>{[5,6,7,8,9,10,11].map(n => <MenuItem key={n} value={n}>{n} клас</MenuItem>)}</TextField>
        <TextField label="Тема (необов’язково)" value={topic} disabled={disabled} onChange={e => setTopic(e.target.value)} inputProps={{ maxLength: 150 }} fullWidth />
      </Stack>
      <TextField label="Твоє запитання" multiline minRows={3} value={question} disabled={disabled} onChange={e => setQuestion(e.target.value)} inputProps={{ maxLength: status.data?.maxPromptLength ?? 2000 }} helperText={`${question.length}/${status.data?.maxPromptLength ?? 2000}`} />
      <Stack direction="row" gap={1}><Button type="submit" variant="contained" disabled={disabled || !question.trim()}>{answer.isPending ? 'Готуємо відповідь…' : 'Запитати'}</Button>{answer.isPending && <Button onClick={() => controller.current?.abort()}>Скасувати</Button>}</Stack>
    </Stack>
    {answer.isError && <Alert severity="warning">{getApiErrorMessage(answer.error)}</Alert>}
    {answer.isPending && <LoadingState text="Шукаємо матеріали та перевіряємо відповідь…" />}
    {answer.data && !answer.isPending && <Card><CardContent><Stack gap={2}>
      {answer.data.generalKnowledge && <Alert severity="info">Загальне математичне пояснення: відповідних матеріалів MathArchive не знайдено.</Alert>}
      <Typography component="div" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{answer.data.answer}</Typography>
      {answer.data.sources.length > 0 && <><Typography variant="h6">Матеріали MathArchive</Typography>{answer.data.sources.map(source => <Button key={source.materialId} component={Link} to={source.url} sx={{ justifyContent: 'flex-start', textAlign: 'left' }}>{source.title} · {source.grade ? `${source.grade} клас` : 'Загальні матеріали'}</Button>)}</>}
    </Stack></CardContent></Card>}
  </Stack></Container>;
}
