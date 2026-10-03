import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Collapse, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useAssistantSession } from './AssistantSession';

import { AssistantMarkdown } from './AssistantMarkdown';
export function AssistantChat({ onNavigate }: { onNavigate?: () => void }) {
  const chat = useAssistantSession();
  const [filters, setFilters] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { const element = scroll.current; if (element) element.scrollTop = element.scrollHeight; }, [chat.messages, chat.pending]);
  const disabled = !chat.available || chat.pending;
  return <Stack sx={{ height: '100%', minHeight: 0, color: '#082B5C' }}>
    <Box ref={scroll} role="log" aria-label="Розмова з AI-помічником" aria-live="polite" aria-relevant="additions" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 2, sm: 2.5 }, bgcolor: '#FFFDF6' }}>
      {chat.status.isPending && <Typography role="status">Перевіряємо доступність помічника…</Typography>}
      {chat.status.isError && <Alert severity="info">Не вдалося перевірити доступність помічника. <Link to="/materials">Переглянути матеріали</Link></Alert>}
      {chat.status.data && !chat.status.data.enabled && <Alert severity="info">AI-помічник тимчасово вимкнений. <Link to="/materials">Переглянути матеріали</Link></Alert>}
      {chat.available && chat.messages.length === 0 && <Stack gap={1.5}>
        <Typography fontWeight={700}>Чим я можу допомогти?</Typography>
        <Stack direction="row" gap={0.5} flexWrap="wrap">{['Поясни тему', 'Знайди матеріал'].map(label => <Button key={label} size="small" disabled={disabled} onClick={() => chat.setQuestion(`${label}: `)} sx={{ color: '#082B5C', bgcolor: '#EAF5FC', borderRadius: 3 }}>{label}</Button>)}</Stack>
      </Stack>}
      <Stack gap={2} sx={{ mt: chat.messages.length ? 1 : 0 }}>{chat.messages.map(message => message.role === 'error'
        ? <Alert key={message.id} severity="warning">{message.text}</Alert>
        : <Box key={message.id} sx={{ bgcolor: message.role === 'student' ? '#EAF5FC' : '#FFFFFF', border: '1px solid #D6E1EC', borderRadius: 3, p: 2, minWidth: 0, ml: message.role === 'student' ? { xs: 2, sm: 5 } : 0 }}>
          <Typography variant="caption" fontWeight={700} component="p" sx={{ mb: 1 }}>{message.role === 'student' ? 'Ти' : 'AI-помічник'}</Typography>
          {message.role === 'student' ? <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</Typography> : <Stack gap={1.5}>
            {message.answer.generalKnowledge && <Alert severity="info">Загальне пояснення: відповідних матеріалів MathArchive не знайдено.</Alert>}
            <AssistantMarkdown text={message.answer.answer} />
            {message.answer.sources.length > 0 && <Box sx={{ borderTop: '1px solid #D6E1EC', pt: 1.5 }}><Typography fontWeight={700} variant="body2">Матеріали MathArchive</Typography><Stack component="ul" sx={{ pl: 2.5, mb: 0 }}>
              {message.answer.sources.map(source => <Box component="li" key={source.materialId}><Button component={Link} to={`/materials/${encodeURIComponent(source.materialId)}`} onClick={onNavigate} sx={{ color: '#082B5C', textAlign: 'left', justifyContent: 'flex-start', px: 0, fontSize: '0.85rem' }}>{source.title} · {source.grade ? `${source.grade} клас` : 'Загальні матеріали'}</Button></Box>)}
            </Stack></Box>}
          </Stack>}
        </Box>)}
      </Stack>
      {chat.pending && <Stack direction="row" alignItems="center" gap={1} role="status" sx={{ py: 2 }}><CircularProgress size={16} sx={{ color: '#082B5C' }} /><Typography variant="body2">Думаю…</Typography></Stack>}
    </Box>
    <Stack component="form" gap={1} onSubmit={event => { event.preventDefault(); chat.submit(); }} sx={{ p: 2, bgcolor: '#EAF5FC', borderTop: '1px solid #D6E1EC', flexShrink: 0, maxHeight: '75%', overflowY: 'auto', pb: 'max(16px, env(safe-area-inset-bottom))' }}>
      <Typography variant="caption" sx={{ lineHeight: 1.5 }}>AI може помилятися. Не надсилай особисті дані. Запитання й відповіді тимчасово зберігаються для перевірки вчителем.</Typography>
      <Button size="small" aria-expanded={filters} aria-controls="assistant-filters" onClick={() => setFilters(!filters)} sx={{ alignSelf: 'flex-start', color: '#082B5C' }}>Клас і тема{chat.grade ? ` · ${chat.grade} клас` : ''}</Button>
      <Collapse in={filters} id="assistant-filters"><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ pb: 1 }}>
        <TextField size="small" select label="Клас" value={chat.grade} disabled={disabled} onChange={event => chat.setGrade(event.target.value)} sx={{ minWidth: 120 }}><MenuItem value="">Усі класи</MenuItem>{[5, 6, 7, 8, 9, 10, 11].map(n => <MenuItem key={n} value={n}>{n} клас</MenuItem>)}</TextField>
        <TextField size="small" label="Тема (необов’язково)" value={chat.topic} disabled={disabled} onChange={event => chat.setTopic(event.target.value)} inputProps={{ maxLength: 150 }} fullWidth />
      </Stack></Collapse>
      <TextField label="Твоє запитання" multiline minRows={2} maxRows={4} value={chat.question} disabled={disabled} onChange={event => chat.setQuestion(event.target.value)} inputProps={{ maxLength: chat.maxPromptLength }} helperText={`${chat.question.length}/${chat.maxPromptLength}`} sx={{ bgcolor: '#FFFDF6', borderRadius: 2 }} />
      <Stack direction="row" gap={1}><Button type="submit" variant="contained" disabled={disabled || !chat.question.trim()} sx={{ bgcolor: '#082B5C', '&:hover': { bgcolor: '#164476' } }}>{chat.pending ? 'Думаю…' : 'Запитати'}</Button>{chat.pending && <Button onClick={chat.cancel} sx={{ color: '#082B5C' }}>Скасувати</Button>}</Stack>
    </Stack>
  </Stack>;
}
