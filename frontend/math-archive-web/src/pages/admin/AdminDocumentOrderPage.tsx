import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type DragEvent } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { getApiErrorMessage } from '../../api/apiErrors';
import { getDocumentOrder, saveDocumentOrder } from '../../api/documentsApi';
import { queryKeys } from '../../api/queryKeys';
import { ErrorState, LoadingState } from '../../components/StateView';
import type { DocumentDto } from '../../types/documents';

export function AdminDocumentOrderPage() {
  const [grade, setGrade] = useState<number | ''>('');
  const [items, setItems] = useState<DocumentDto[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const queryClient = useQueryClient();
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname);
  const orderQuery = useQuery({
    queryKey: grade === '' ? ['admin', 'document-order', 'none'] : queryKeys.documentOrder(grade),
    queryFn: () => getDocumentOrder(grade as number),
    enabled: grade !== ''
  });
  const saveMutation = useMutation({
    mutationFn: () => saveDocumentOrder(grade as number, items.map(item => item.id)),
    onSuccess: async savedItems => {
      setItems(savedItems);
      setIsDirty(false);
      setSuccessMessage('Порядок матеріалів успішно збережено');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (grade !== '') {
        queryClient.setQueryData(queryKeys.documentOrder(grade), savedItems);
      }
    }
  });

  useEffect(() => {
    if (orderQuery.data) {
      setItems(orderQuery.data);
      setIsDirty(false);
    }
  }, [orderQuery.data]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const setSelectedGrade = (nextGrade: number) => {
    if (isDirty && !window.confirm('Незбережені зміни порядку буде втрачено. Продовжити?')) {
      return;
    }
    setGrade(nextGrade);
    setItems([]);
    setIsDirty(false);
    setSuccessMessage('');
    saveMutation.reset();
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= items.length) return;
    setItems(current => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setIsDirty(true);
    setSuccessMessage('');
  };

  const dropOn = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const draggedIndex = items.findIndex(item => item.id === draggedId);
    const targetIndex = items.findIndex(item => item.id === targetId);
    reorder(draggedIndex, targetIndex);
    setDraggedId(null);
  };

  return (
    <Stack gap={3}>
      <Box>
        <Button component={Link} to="/admin/documents" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>
          До матеріалів
        </Button>
        <Typography variant="h3">Порядок матеріалів</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Оберіть клас і розташуйте матеріали в тому порядку, у якому вони мають відображатися на сайті.
        </Typography>
      </Box>

      <FormControl fullWidth sx={{ maxWidth: 360 }}>
        <InputLabel id="order-grade-label">Клас</InputLabel>
        <Select
          labelId="order-grade-label"
          label="Клас"
          value={grade}
          onChange={event => setSelectedGrade(event.target.value as number)}
        >
          {[5, 6, 7, 8, 9, 10, 11].map(value => <MenuItem key={value} value={value}>{value} клас</MenuItem>)}
        </Select>
      </FormControl>

      {grade === '' && <Typography color="text.secondary">Оберіть клас, щоб налаштувати порядок.</Typography>}
      {orderQuery.isLoading && <LoadingState />}
      {orderQuery.isError && <ErrorState message={getApiErrorMessage(orderQuery.error, 'Не вдалося завантажити порядок матеріалів.')} />}
      {saveMutation.isError && <Alert severity="error">{getApiErrorMessage(saveMutation.error, 'Не вдалося зберегти порядок.')}</Alert>}
      {successMessage && <Alert severity="success">{successMessage}</Alert>}

      {grade !== '' && orderQuery.data && (
        <Typography color="text.secondary">Матеріалів у класі: {items.length}</Typography>
      )}
      {grade !== '' && orderQuery.data && items.length === 0 && (
        <Typography color="text.secondary">У цьому класі немає матеріалів.</Typography>
      )}

      {items.length > 0 && (
        <Stack gap={1} aria-label="Порядок матеріалів">
          {items.map((document, index) => (
            <Stack key={document.id} gap={1}>
              {!isDirty && index === 0 && document.displayOrder > 0 && <Typography variant="subtitle2">Впорядковані</Typography>}
              {!isDirty && document.displayOrder === 0 && (index === 0 || items[index - 1].displayOrder > 0) && (
                <Typography variant="subtitle2">Без порядку</Typography>
              )}
              {isDirty && index === 0 && <Typography variant="subtitle2">Новий порядок</Typography>}
              <Card
                variant="outlined"
                draggable
                onDragStart={(event: DragEvent) => {
                  setDraggedId(document.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={event => event.preventDefault()}
                onDrop={() => dropOn(document.id)}
                onDragEnd={() => setDraggedId(null)}
                sx={{ opacity: draggedId === document.id ? 0.55 : 1 }}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" gap={{ xs: 1, sm: 1.5 }}>
                    <Box aria-label="Перетягнути матеріал" sx={{ display: 'flex', cursor: 'grab', color: 'text.secondary' }}>
                      <DragIndicatorIcon />
                    </Box>
                    <Typography sx={{ minWidth: 28, fontWeight: 700 }}>{index + 1}.</Typography>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{document.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{document.topic}</Typography>
                    </Box>
                    {document.displayOrder === 0 && <Chip label="Без порядку" size="small" />}
                    <Stack direction="row">
                      <IconButton
                        aria-label={`Перемістити вище: ${document.title}`}
                        onClick={() => reorder(index, index - 1)}
                        disabled={index === 0}
                        size="small"
                      ><ArrowUpwardIcon /></IconButton>
                      <IconButton
                        aria-label={`Перемістити нижче: ${document.title}`}
                        onClick={() => reorder(index, index + 1)}
                        disabled={index === items.length - 1}
                        size="small"
                      ><ArrowDownwardIcon /></IconButton>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          ))}
        </Stack>
      )}

      {grade !== '' && orderQuery.data && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            py: 2,
            bgcolor: 'background.default',
            borderTop: 1,
            borderColor: 'divider'
          }}
        >
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="flex-end" gap={1}>
            <Button component={Link} to="/admin/documents" disabled={saveMutation.isPending}>Скасувати</Button>
            <Button
              variant="contained"
              onClick={() => saveMutation.mutate()}
              disabled={orderQuery.isLoading || orderQuery.isError || saveMutation.isPending || !isDirty}
            >
              {saveMutation.isPending ? 'Зберігаємо…' : 'Зберегти порядок'}
            </Button>
          </Stack>
        </Box>
      )}

      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()}>
        <DialogTitle>Вийти без збереження?</DialogTitle>
        <DialogContent>Незбережені зміни порядку буде втрачено.</DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Залишитися</Button>
          <Button color="warning" variant="contained" onClick={() => blocker.proceed?.()}>Вийти</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
