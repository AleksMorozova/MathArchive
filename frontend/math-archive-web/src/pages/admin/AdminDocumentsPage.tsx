import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Pagination, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, useMediaQuery } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '../../api/apiErrors';
import { deleteDocument } from '../../api/documentsApi';
import { queryKeys } from '../../api/queryKeys';
import { FiltersBar } from '../../components/FiltersBar';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateView';
import { documentTypeLabels } from '../../constants/documentTypes';
import { useDocuments, useTopics } from '../../hooks/useDocuments';
import type { DocumentDto, DocumentFilters } from '../../types/documents';
import { formatDate } from '../../utils/format';

function formatGradeLabel(grade: number | null) {
  return grade === null ? 'Загальний матеріал' : `${grade} клас`;
}

export function AdminDocumentsPage() {
  const [filters, setFilters] = useState<DocumentFilters>({ page: 1, pageSize: 12, search: '', grade: '', topic: '', documentType: '' });
  const [deleteTarget, setDeleteTarget] = useState<DocumentDto | null>(null);
  const [message, setMessage] = useState('');
  const isMobile = useMediaQuery('(max-width:760px)');
  const queryClient = useQueryClient();
  const documents = useDocuments(filters);
  const topics = useTopics();
  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: async (_data, deletedId) => {
      setMessage('Матеріал успішно видалено');
      setDeleteTarget(null);
      queryClient.removeQueries({ queryKey: queryKeys.document(deletedId) });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    }
  });

  const updateFilters = (next: Partial<DocumentFilters>) => setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Typography variant="h3">Матеріали</Typography>
        <Button component={Link} to="/admin/documents/new" startIcon={<AddIcon />} variant="contained">Додати матеріал</Button>
      </Stack>
      {message && <Box className="success-message">{message}</Box>}
      {deleteMutation.isError && <Box className="error-message">{getApiErrorMessage(deleteMutation.error, 'Не вдалося видалити матеріал.')}</Box>}
      <FiltersBar filters={filters} topics={topics.data ?? []} onChange={updateFilters} onClear={() => setFilters({ page: 1, pageSize: 12, search: '', grade: '', topic: '', documentType: '' })} />
      {documents.isLoading && <LoadingState />}
      {documents.isError && <ErrorState message={getApiErrorMessage(documents.error)} />}
      {documents.data && documents.data.items.length === 0 && <EmptyState />}
      {documents.data && documents.data.items.length > 0 && (
        <>
          {isMobile ? (
            <Stack gap={2}>
              {documents.data.items.map((document) => <AdminCard key={document.id} document={document} onDelete={setDeleteTarget} />)}
            </Stack>
          ) : (
            <Table className="admin-table">
              <TableHead>
                <TableRow>
                  <TableCell>Назва</TableCell>
                  <TableCell>Клас</TableCell>
                  <TableCell>Тема</TableCell>
                  <TableCell>Тип</TableCell>
                  <TableCell>Дата додавання</TableCell>
                  <TableCell>Завантаження</TableCell>
                  <TableCell>Дії</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.data.items.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>{document.title}</TableCell>
                    <TableCell>{formatGradeLabel(document.grade)}</TableCell>
                    <TableCell>{document.topic}</TableCell>
                    <TableCell>{documentTypeLabels[document.documentType]}</TableCell>
                    <TableCell>{formatDate(document.createdAt)}</TableCell>
                    <TableCell>{document.downloadCount}</TableCell>
                    <TableCell>
                      <Actions document={document} onDelete={setDeleteTarget} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {documents.data.totalPages > 1 && (
            <Pagination count={documents.data.totalPages} page={documents.data.page} onChange={(_, page) => updateFilters({ page })} color="primary" />
          )}
        </>
      )}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Видалити матеріал?</DialogTitle>
        <DialogContent>Цю дію неможливо скасувати. Файл також буде видалено зі сховища.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Скасувати</Button>
          <Button color="error" variant="contained" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Видалити</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function AdminCard({ document, onDelete }: { document: DocumentDto; onDelete: (document: DocumentDto) => void }) {
  return (
    <Card>
      <CardContent>
        <Stack gap={1}>
          <Typography variant="h6">{document.title}</Typography>
          <Typography color="text.secondary">{formatGradeLabel(document.grade)} · {document.topic} · {documentTypeLabels[document.documentType]}</Typography>
          <Actions document={document} onDelete={onDelete} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function Actions({ document, onDelete }: { document: DocumentDto; onDelete: (document: DocumentDto) => void }) {
  return (
    <Stack direction="row" gap={0.5}>
      <IconButton aria-label="Переглянути" component={Link} to={`/materials/${document.id}`}><VisibilityIcon /></IconButton>
      <IconButton aria-label="Редагувати" component={Link} to={`/admin/documents/${document.id}/edit`}><EditIcon /></IconButton>
      <IconButton aria-label="Видалити" onClick={() => onDelete(document)}><DeleteIcon /></IconButton>
    </Stack>
  );
}
