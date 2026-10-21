import { Alert, Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { httpClient } from '../api/httpClient';
import { queryKeys } from '../api/queryKeys';
import { ApiError, getApiErrorMessage } from '../api/apiErrors';
import { LoadingState } from './StateView';

export function TrainerFrame({ id, title }: { id: string; title: string }) {
  const query = useQuery({
    queryKey: queryKeys.trainer(id),
    queryFn: async ({ signal }) => {
      const response = await httpClient.get<{ url: string }>(`/api/documents/${id}/trainer`, { signal });
      const url = new URL(response.data.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.hostname === window.location.hostname || url.username || url.password)
        throw new ApiError('Тренажер потребує окремої адреси.', { status: 503, problem: {
          title: 'TrainerHostingNotConfigured',
          detail: 'Тренажер тимчасово недоступний. Адміністратор має налаштувати окрему адресу для тренажерів.'
        } });
      return url.href;
    },
    retry: false
  });
  if (query.isPending) return <LoadingState text="Завантажуємо тренажер…" />;
  if (query.isError) return <Alert severity="error">{getApiErrorMessage(query.error, 'Тренажер тимчасово недоступний. Перевірте налаштування окремого джерела.')}</Alert>;
  return <Box component="iframe" title={title} src={query.data} sandbox="allow-scripts" referrerPolicy="no-referrer"
    allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'"
    sx={{ width: '100%', height: { xs: '80dvh', md: '85dvh' }, minHeight: 480, border: '1px solid', borderColor: 'divider', borderRadius: 3, backgroundColor: 'white' }} />;
}
