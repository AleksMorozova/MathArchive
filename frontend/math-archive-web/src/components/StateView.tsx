import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';

export function LoadingState({ text = 'Завантажуємо матеріали…' }: { text?: string }) {
  return (
    <Stack alignItems="center" gap={2} sx={{ py: 8 }}>
      <CircularProgress />
      <Typography color="text.secondary">{text}</Typography>
    </Stack>
  );
}

export function EmptyState() {
  return (
    <Box className="state-box">
      <Typography variant="h5">Матеріалів не знайдено</Typography>
      <Typography color="text.secondary">Спробуйте змінити параметри пошуку або очистити фільтри.</Typography>
    </Box>
  );
}

export function ErrorState() {
  return (
    <Alert severity="error">
      <strong>Не вдалося завантажити матеріали</strong>
      <br />
      Спробуйте оновити сторінку.
    </Alert>
  );
}
