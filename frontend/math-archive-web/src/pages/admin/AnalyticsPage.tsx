import { Alert, Box, Button, Card, CardContent, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getAnalytics } from '../../api/analyticsApi';
import { getApiErrorMessage } from '../../api/apiErrors';
import { queryKeys } from '../../api/queryKeys';
import { analyticsBoundaries, presetDates } from '../../utils/analyticsDates';
import { Seo } from '../../seo/Seo';

export function AnalyticsPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'custom'>('week');
  const [dates, setDates] = useState(() => presetDates(7));
  const range = analyticsBoundaries(dates.from, dates.to);
  const query = useQuery({
    queryKey: queryKeys.analytics(range?.from ?? '', range?.to ?? ''),
    queryFn: ({ signal }) => getAnalytics(range!.from, range!.to, signal),
    enabled: range !== null
  });
  const selectPeriod = (value: typeof period) => {
    setPeriod(value);
    if (value !== 'custom') setDates(presetDates(value === 'today' ? 1 : 7));
  };
  const report = range ? query.data : undefined;

  return <Stack gap={3}>
    <Seo title="Статистика | MathArchive" description="Анонімна статистика використання матеріалів." canonicalPath="/admin/analytics" noIndex />
    <Typography component="h1" variant="h4">Статистика</Typography>
    <Box className="content-panel">
      <Stack gap={2}>
        <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Період">
          {([['today', 'Сьогодні'], ['week', '7 днів'], ['custom', 'Вибрати дати']] as const).map(([value, label]) =>
            <Button key={value} variant={period === value ? 'contained' : 'outlined'} aria-pressed={period === value} onClick={() => selectPeriod(value)}>{label}</Button>)}
        </Stack>
        {period === 'custom' && <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          <TextField type="date" label="Від" value={dates.from} onChange={event => setDates({ ...dates, from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label="До" value={dates.to} onChange={event => setDates({ ...dates, to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>}
        <Typography variant="body2" color="text.secondary">{dates.from} — {dates.to} · Місцевий час ({Intl.DateTimeFormat().resolvedOptions().timeZone})</Typography>
      </Stack>
    </Box>
    {!range && <Alert severity="warning">Виберіть коректні дати: «Від» має бути не пізніше «До».</Alert>}
    {range && query.isFetching && <LinearProgress aria-label="Завантажуємо статистику" />}
    {range && query.isError && <Alert severity="error" action={<Button onClick={() => query.refetch()}>Повторити</Button>}>{getApiErrorMessage(query.error, 'Не вдалося завантажити статистику.')}</Alert>}
    {report && <>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        {([
          ['Відкриття сайту', report.summary.siteVisits],
          ['Прев’ю документів', report.summary.documentPreviews],
          ['Завантаження документів', report.summary.documentDownloads]
        ] as const).map(([label, value]) => <Card key={label} variant="outlined" sx={{ flex: 1 }}><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h4">{value}</Typography></CardContent></Card>)}
      </Stack>
      <Typography variant="body2" color="text.secondary">Це кількість дій, а не унікальних учнів. Завантаження — натискання «Завантажити», «Завантажити файл» або «Відкрити документ» у MathArchive, незалежно від подальших дій у PDF-переглядачі.</Typography>
      {report.documents.length === 0 ? <Alert severity="info">За вибраний період немає взаємодій із документами.</Alert> :
        <TableContainer className="admin-table"><Table aria-label="Статистика документів">
          <TableHead><TableRow><TableCell>Документ</TableCell><TableCell align="right">Прев’ю</TableCell><TableCell align="right">Завантаження</TableCell></TableRow></TableHead>
          <TableBody>{report.documents.map(document => <TableRow key={document.documentId}>
            <TableCell sx={{ overflowWrap: 'anywhere' }}>{document.title ?? 'Видалений матеріал'}</TableCell><TableCell align="right">{document.previewCount}</TableCell><TableCell align="right">{document.downloadCount}</TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>}
    </>}
  </Stack>;
}
