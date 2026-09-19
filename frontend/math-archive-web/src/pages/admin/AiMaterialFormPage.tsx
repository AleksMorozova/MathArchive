import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DragEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzeMaterial } from '../../api/aiApi';
import { getApiErrorMessage } from '../../api/apiErrors';
import { createDocument } from '../../api/documentsApi';
import { documentTypeOptions } from '../../constants/documentTypes';
import type { DocumentType } from '../../types/documents';
import { formatFileSize } from '../../utils/format';

const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
const maxFileSize = 20 * 1024 * 1024;
type Values = { title: string; description: string; grade: number | null; topic: string; documentType: DocumentType | '' };
const emptyValues: Values = { title: '', description: '', grade: null, topic: '', documentType: '' };

export const normalizeAiValue = (value?: string | null) =>
  value && !['null', 'undefined', 'n/a'].includes(value.trim().toLowerCase())
    ? value.trim()
    : '';

export function AiMaterialFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File>();
  const [values, setValues] = useState<Values>(emptyValues);
  const [analyzed, setAnalyzed] = useState(false);
  const [fileError, setFileError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const previewUrl = useMemo(() => file?.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined, [file]);
  useEffect(() => () => { if (previewUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const chooseFile = (next?: File) => {
    if (!next) return;
    const extension = next.name.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) return setFileError('Цей формат файлу не підтримується');
    if (next.size > maxFileSize) return setFileError('Розмір файлу не повинен перевищувати 20 МБ');
    setFileError(''); setFile(next); setAnalyzed(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); };

  const analysis = useMutation({
    mutationFn: () => analyzeMaterial(file!),
    onSuccess: (result) => {
      const documentType = documentTypeOptions.some((option) => option.value === result.documentType)
        ? result.documentType as DocumentType
        : '';
      setValues({ title: normalizeAiValue(result.title), description: normalizeAiValue(result.description), grade: result.grade,
        topic: normalizeAiValue(result.topic), documentType });
      setAnalyzed(true);
    }
  });
  const publish = useMutation({
    mutationFn: async (_mode: 'finish' | 'next') => {
      const data = new FormData();
      data.append('title', values.title); data.append('description', values.description);
      if (values.grade !== null) data.append('grade', String(values.grade));
      data.append('topic', values.topic); data.append('documentType', values.documentType); data.append('file', file!);
      return createDocument(data);
    },
    onSuccess: async (_document, mode) => {
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (mode === 'next') {
        setSuccessMessage('Матеріал успішно додано. Можна додати наступний.');
        setFile(undefined); setValues((current) => ({ ...current, title: '', description: '' }));
        setAnalyzed(false);
      } else navigate('/admin/documents', { state: { message: 'Матеріал успішно додано' } });
    }
  });
  const canPublish = !!file && values.title.trim().length > 0 && values.title.length <= 200 &&
    values.topic.trim().length > 0 && values.topic.length <= 150 && values.description.length <= 2000 &&
    documentTypeOptions.some((option) => option.value === values.documentType) &&
    values.grade !== null && values.grade >= 1 && values.grade <= 11;
  const set = (key: keyof Values, value: Values[keyof Values]) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <Box className="content-panel admin-form">
      <Stack gap={2.5}>
        <Typography variant="h3">Додавання матеріалу з AI</Typography>
        <Typography color="text.secondary">Завантажте матеріал, і AI запропонує назву, клас, тему, тип та опис.</Typography>
        {analysis.isError && <Alert severity="error">{getApiErrorMessage(analysis.error, 'Не вдалося проаналізувати матеріал. Ви можете повторити спробу або заповнити поля вручну.')}</Alert>}
        {successMessage && <Alert severity="success">{successMessage}</Alert>}
        {publish.isError && <Alert severity="error">{getApiErrorMessage(publish.error, 'Не вдалося зберегти матеріал.')}</Alert>}
        <Box onDrop={onDrop} onDragOver={(event) => event.preventDefault()} sx={{ border: '2px dashed', borderColor: 'divider', borderRadius: 3, p: 3, textAlign: 'center' }}>
          {previewUrl && <Box component="img" src={previewUrl} alt="Попередній перегляд вибраного матеріалу" sx={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain', mb: 2 }} />}
          {file && !previewUrl && <Typography sx={{ mb: 1 }}>{file.name} · {formatFileSize(file.size)}</Typography>}
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="center" gap={1}>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>{file ? 'Замінити файл' : 'Оберіть файл'}<input hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => chooseFile(e.target.files?.[0])} /></Button>
            {file && <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => { setFile(undefined); setAnalyzed(false); }}>Видалити</Button>}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>або перетягніть файл сюди</Typography>
        </Box>
        {fileError && <Typography color="error">{fileError}</Typography>}
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
          <Button variant="contained" startIcon={analysis.isPending ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />} disabled={!file || analysis.isPending || publish.isPending} onClick={() => analysis.mutate()}>{analysis.isPending ? 'Аналізуємо матеріал…' : analyzed ? 'Проаналізувати повторно' : 'Проаналізувати'}</Button>
          <Button onClick={() => navigate('/admin/documents/new', { state: { file } })} disabled={!file || analysis.isPending}>Заповнити вручну</Button>
          <Button component={Link} to="/admin/documents" disabled={analysis.isPending || publish.isPending}>Скасувати</Button>
        </Stack>
        {analyzed && <>
          <Alert severity="warning">Перевірте запропоновані дані перед публікацією.</Alert>
          <TextField label="Назва" value={values.title} onChange={(e) => set('title', e.target.value)} required inputProps={{ maxLength: 200 }}
            error={analyzed && !values.title.trim()} helperText={analyzed && !values.title.trim() ? 'AI не визначив назву. Введіть назву матеріалу.' : undefined} />
          <TextField label="Опис" multiline minRows={4} value={values.description} onChange={(e) => set('description', e.target.value)} inputProps={{ maxLength: 2000 }} />
          <TextField select label="Клас" value={values.grade ?? ''} onChange={(e) => set('grade', e.target.value === '' ? null : Number(e.target.value))} required>
            <MenuItem value="">Оберіть клас</MenuItem>{Array.from({ length: 11 }, (_, i) => i + 1).map((grade) => <MenuItem key={grade} value={grade}>{grade} клас</MenuItem>)}
          </TextField>
          <TextField label="Тема" value={values.topic} onChange={(e) => set('topic', e.target.value)} required inputProps={{ maxLength: 150 }} />
          <TextField select label="Тип матеріалу" value={values.documentType} onChange={(e) => set('documentType', e.target.value)} required
            error={analyzed && !values.documentType} helperText={analyzed && !values.documentType ? 'Оберіть тип матеріалу' : undefined}>
            <MenuItem value="">Оберіть тип матеріалу</MenuItem>{documentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <Button variant="contained" disabled={!canPublish || publish.isPending} onClick={() => publish.mutate('finish')}>{publish.isPending ? 'Публікуємо…' : 'Підтвердити та опублікувати'}</Button>
            <Button variant="outlined" disabled={!canPublish || publish.isPending} onClick={() => publish.mutate('next')}>Опублікувати й додати наступний</Button>
          </Stack>
        </>}
      </Stack>
    </Box>
  );
}
