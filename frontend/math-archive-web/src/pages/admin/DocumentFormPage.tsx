import { zodResolver } from '@hookform/resolvers/zod';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Alert, Box, Button, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { fieldNameFromProblemDetails, getApiErrorMessage, hasValidationErrors, isApiError } from '../../api/apiErrors';
import { createDocument, updateDocument } from '../../api/documentsApi';
import { queryKeys } from '../../api/queryKeys';
import { ErrorState, LoadingState } from '../../components/StateView';
import { documentTypeOptions } from '../../constants/documentTypes';
import { useDocument } from '../../hooks/useDocuments';
import { formatFileSize } from '../../utils/format';

const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
const maxFileSize = 20 * 1024 * 1024;
const materialScopes = ['grade', 'general'] as const;

const schema = z.object({
  title: z.string().min(1, 'Введіть назву матеріалу').max(200, 'Назва не може містити більше ніж 200 символів'),
  description: z.string().max(2000, 'Опис не може містити більше ніж 2000 символів').optional(),
  materialScope: z.enum(materialScopes),
  grade: z.number().min(1, 'Оберіть клас').max(11, 'Оберіть клас').nullable(),
  topic: z.string().min(1, 'Вкажіть тему').max(150, 'Тема не може містити більше ніж 150 символів'),
  documentType: z.string().min(1, 'Оберіть тип матеріалу'),
  file: z.instanceof(File).optional()
});

type DocumentForm = z.infer<typeof schema>;

interface DocumentFormPageProps {
  mode: 'create' | 'edit';
}

export function DocumentFormPage({ mode }: DocumentFormPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const hydratedDocumentId = useRef<string | null>(null);
  const documentQuery = useDocument(id ?? '');
  const existing = mode === 'edit' ? documentQuery.data : undefined;

  const formSchema = schema.superRefine((value, context) => {
      if (value.materialScope === 'grade' && value.grade === null) {
        context.addIssue({ code: 'custom', path: ['grade'], message: 'Оберіть клас' });
      }
      if (mode === 'create' && !value.file) {
        context.addIssue({ code: 'custom', path: ['file'], message: 'Оберіть файл' });
      }
      if (value.file) {
        const extension = value.file.name.split('.').pop()?.toLowerCase();
        if (!extension || !allowedExtensions.includes(extension)) {
          context.addIssue({ code: 'custom', path: ['file'], message: 'Цей формат файлу не підтримується' });
        }
        if (value.file.size > maxFileSize) {
          context.addIssue({ code: 'custom', path: ['file'], message: 'Розмір файлу не повинен перевищувати 20 МБ' });
        }
      }
    });

  const form = useForm<DocumentForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      materialScope: 'grade',
      grade: null,
      topic: '',
      documentType: '',
      file: undefined
    }
  });

  useEffect(() => {
    if (existing && hydratedDocumentId.current !== existing.id) {
      form.reset({
        title: existing.title,
        description: existing.description ?? '',
        materialScope: existing.grade === null ? 'general' : 'grade',
        grade: existing.grade,
        topic: existing.topic,
        documentType: existing.documentType,
        file: undefined
      });
      hydratedDocumentId.current = existing.id;
    }
  }, [existing, form]);

  const materialScope = form.watch('materialScope');

  useEffect(() => {
    if (materialScope === 'general') {
      form.setValue('grade', null, { shouldValidate: true });
    }
  }, [form, materialScope]);

  const mutation = useMutation({
    mutationFn: async (values: DocumentForm) => {
      const data = new FormData();
      data.append('title', values.title);
      data.append('description', values.description ?? '');
      if (values.materialScope === 'grade' && values.grade !== null) {
        data.append('grade', String(values.grade));
      }
      data.append('topic', values.topic);
      data.append('documentType', values.documentType);
      if (values.file) data.append('file', values.file);
      return mode === 'create'
        ? createDocument(data, setProgress)
        : updateDocument(id!, data, setProgress);
    },
    onSuccess: async () => {
      setMessage(mode === 'create' ? 'Матеріал успішно додано' : 'Матеріал успішно оновлено');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (mode === 'edit' && id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.document(id) });
      }
      window.setTimeout(() => navigate('/admin/documents'), 600);
    },
    onError: (error) => {
      if (isApiError(error) && hasValidationErrors(error.problem)) {
        for (const [propertyName, messages] of Object.entries(error.problem.errors)) {
          form.setError(fieldNameFromProblemDetails(propertyName) as keyof DocumentForm, {
            type: 'server',
            message: messages[0]
          });
        }
      }
    }
  });

  if (mode === 'edit' && documentQuery.isLoading) {
    return <LoadingState text="Завантажуємо матеріал…" />;
  }

  if (mode === 'edit' && documentQuery.isError) {
    return <ErrorState message={getApiErrorMessage(documentQuery.error, 'Не вдалося завантажити матеріал.')} />;
  }

  if (mode === 'edit' && !existing) {
    return <ErrorState title="Матеріал не знайдено" message="Можливо, його було видалено або посилання є неправильним." />;
  }

  return (
    <Box component="form" className="content-panel admin-form" onSubmit={form.handleSubmit((values) => {
      if (!mutation.isPending) {
        mutation.mutate(values);
      }
    })}>
      <Stack gap={2}>
        <Typography variant="h3">{mode === 'create' ? 'Новий матеріал' : 'Редагування матеріалу'}</Typography>
        {message && <Alert severity="success">{message}</Alert>}
        {mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error, 'Не вдалося зберегти матеріал.')}</Alert>}
        {mode === 'edit' && existing && <Typography color="text.secondary">Поточний файл: {existing.originalFileName}</Typography>}
        <TextField label="Назва" {...form.register('title')} error={!!form.formState.errors.title} helperText={form.formState.errors.title?.message} />
        <TextField label="Опис" multiline minRows={4} {...form.register('description')} error={!!form.formState.errors.description} helperText={form.formState.errors.description?.message} />
        <Controller
          control={form.control}
          name="materialScope"
          render={({ field }) => (
            <TextField
              select
              label="Призначення"
              value={field.value}
              onChange={(event) => {
                field.onChange(event);
                if (event.target.value === 'general') {
                  form.setValue('grade', null, { shouldValidate: true });
                }
              }}
            >
              <MenuItem value="grade">Матеріал для класу</MenuItem>
              <MenuItem value="general">Загальний матеріал</MenuItem>
            </TextField>
          )}
        />
        {materialScope === 'grade' && (
          <Controller
            control={form.control}
            name="grade"
            render={({ field }) => (
              <TextField select label="Клас" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))} error={!!form.formState.errors.grade} helperText={form.formState.errors.grade?.message}>
                <MenuItem value="">Оберіть клас</MenuItem>
                {Array.from({ length: 11 }, (_, index) => index + 1).map((grade) => <MenuItem key={grade} value={grade}>{grade} клас</MenuItem>)}
              </TextField>
            )}
          />
        )}
        <TextField label="Тема" {...form.register('topic')} error={!!form.formState.errors.topic} helperText={form.formState.errors.topic?.message} />
        <TextField select label="Тип матеріалу" value={form.watch('documentType') ?? ''} {...form.register('documentType')} error={!!form.formState.errors.documentType} helperText={form.formState.errors.documentType?.message}>
          <MenuItem value="">Оберіть тип матеріалу</MenuItem>
          {documentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <Controller
          control={form.control}
          name="file"
          render={({ field: { onChange, value } }) => (
            <Stack gap={1}>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                {mode === 'edit' ? 'Замінити файл' : 'Оберіть файл'}
                <input hidden type="file" onChange={(event) => onChange(event.target.files?.[0])} />
              </Button>
              {value && <Typography color="text.secondary">{value.name} · {formatFileSize(value.size)}</Typography>}
              {form.formState.errors.file?.message && <Typography color="error">{form.formState.errors.file.message}</Typography>}
            </Stack>
          )}
        />
        {progress > 0 && progress < 100 && <LinearProgress variant="determinate" value={progress} />}
        <Stack direction="row" gap={1}>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {mutation.isPending ? 'Зберігаємо…' : mode === 'create' ? 'Зберегти' : 'Зберегти зміни'}
          </Button>
          <Button component={Link} to="/admin/documents">Скасувати</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
