import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { cleanupOrphanedFiles, getStorageAudit } from '../../api/storageApi';
import { queryKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/apiErrors';
import { formatFileSize } from '../../utils/format';
import { Seo } from '../../seo/Seo';

export function StorageAuditPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const queryClient = useQueryClient();
  const audit = useQuery({
    queryKey: queryKeys.storageAudit,
    queryFn: ({ signal }) => getStorageAudit(signal)
  });
  const cleanup = useMutation({
    mutationFn: cleanupOrphanedFiles,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.storageAudit, result.currentState);
      setSuccessMessage(`Видалено файлів: ${result.deletedFileCount}. Звільнено: ${formatFileSize(result.reclaimedBytes)}.`);
      setConfirmOpen(false);
    }
  });

  if (audit.isError) {
    return <Alert severity="error" action={<Button onClick={() => audit.refetch()}>Повторити</Button>}>
      {getApiErrorMessage(audit.error, 'Не вдалося перевірити сховище.')}
    </Alert>;
  }

  const report = audit.data;
  return (
    <Stack gap={3}>
      <Seo title="Аудит сховища | MathArchive" description="Перевірка цілісності сховища матеріалів." canonicalPath="/admin/storage" noIndex />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="h4" component="h1">Аудит сховища</Typography>
          <Typography color="text.secondary">Зіставлення матеріалів у базі даних із файлами на диску.</Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} variant="outlined" disabled={audit.isFetching} onClick={() => audit.refetch()}>
          Перевірити знову
        </Button>
      </Stack>
      {audit.isFetching && <LinearProgress />}
      {successMessage && <Alert severity="success" onClose={() => setSuccessMessage(undefined)}>{successMessage}</Alert>}
      {cleanup.isError && <Alert severity="error">{getApiErrorMessage(cleanup.error, 'Не вдалося очистити сховище.')}</Alert>}
      {report && <>
        <Alert severity={report.isHealthy ? 'success' : report.missingFiles.length || report.sizeMismatches.length ? 'error' : 'warning'}>
          {report.isHealthy
            ? 'Сховище узгоджене: усі матеріали доступні, зайвих файлів немає.'
            : `Знайдено проблем: ${report.missingFiles.length + report.orphanedFiles.length + report.sizeMismatches.length}.`}
        </Alert>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
          <Metric label="Матеріалів у БД" value={report.referencedFileCount} />
          <Metric label="Файлів на диску" value={report.storedFileCount} />
          <Metric label="Обсяг сховища" value={formatFileSize(report.storedBytes)} />
          <Metric label="Можна звільнити" value={formatFileSize(report.reclaimableBytes)} />
        </Stack>
        <IssueSection title="Відсутні файли" count={report.missingFiles.length} severity="error"
          help="Запис існує в базі, але файл відсутній. Автоматичне видалення таких записів навмисно заборонене."
          rows={report.missingFiles.map(item => ({ key: item.documentId, primary: item.title, secondary: item.storedFileName }))} />
        <IssueSection title="Невідповідність розміру" count={report.sizeMismatches.length} severity="error"
          help="Фактичний розмір файлу відрізняється від збереженого в базі. Це може свідчити про пошкодження."
          rows={report.sizeMismatches.map(item => ({ key: item.documentId, primary: item.title, secondary: `${item.storedFileName}: очікується ${formatFileSize(item.expectedFileSize)}, фактично ${formatFileSize(item.actualFileSize)}` }))} />
        <IssueSection title="Осиротілі файли" count={report.orphanedFiles.length} severity="warning"
          help="Файли не використовуються жодним матеріалом. Їх можна безпечно видалити після перевірки списку."
          rows={report.orphanedFiles.map(item => ({ key: item.storedFileName, primary: item.storedFileName, secondary: `${formatFileSize(item.fileSize)} · ${new Date(item.lastModifiedAt).toLocaleString('uk-UA')}` }))} />
        {report.orphanedFiles.length > 0 && <Button color="warning" variant="contained" startIcon={<CleaningServicesIcon />} onClick={() => setConfirmOpen(true)}>
          Очистити {report.orphanedFiles.length} осиротілих файлів
        </Button>}
      </>}
      <Dialog open={confirmOpen} onClose={cleanup.isPending ? undefined : () => setConfirmOpen(false)}>
        <DialogTitle>Очистити осиротілі файли?</DialogTitle>
        <DialogContent><Typography>Файли без посилань у базі будуть остаточно видалені. Матеріали з відсутніми або пошкодженими файлами не зміняться.</Typography></DialogContent>
        <DialogActions>
          <Button disabled={cleanup.isPending} onClick={() => setConfirmOpen(false)}>Скасувати</Button>
          <Button color="warning" variant="contained" disabled={cleanup.isPending} onClick={() => cleanup.mutate()}>
            {cleanup.isPending ? 'Очищаємо…' : 'Очистити'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5">{value}</Typography></CardContent></Card>;
}

function IssueSection({ title, count, severity, help, rows }: { title: string; count: number; severity: 'error' | 'warning'; help: string; rows: { key: string; primary: string; secondary: string }[] }) {
  return <Card variant="outlined"><CardContent>
    <Stack direction="row" alignItems="center" gap={1}><Typography variant="h6">{title}</Typography><Chip size="small" color={count ? severity : 'success'} label={count} /></Stack>
    <Typography color="text.secondary" sx={{ mt: 0.5 }}>{help}</Typography>
    {rows.length > 0 && <><Divider sx={{ my: 2 }} /><TableContainer><Table size="small"><TableHead><TableRow><TableCell>Матеріал / файл</TableCell><TableCell>Деталі</TableCell></TableRow></TableHead><TableBody>{rows.map(row => <TableRow key={row.key}><TableCell>{row.primary}</TableCell><TableCell sx={{ wordBreak: 'break-all' }}>{row.secondary}</TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
  </CardContent></Card>;
}
