import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import ReplayIcon from '@mui/icons-material/Replay';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Alert, Box, Button, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeMaterial, transformImagePoster } from '../../api/aiApi';
import { getApiErrorMessage } from '../../api/apiErrors';
import type { GeneratedPosterResult } from '../../types/ai';
import { formatFileSize } from '../../utils/format';

const supportedTypes = ['image/png', 'image/jpeg', 'image/webp'];
const maximumFileSize = 10 * 1024 * 1024;

export function ImagePosterPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<GeneratedPosterResult>();
  const [fileError, setFileError] = useState('');
  const transformationId = useRef(0);
  const activeTransformController = useRef<AbortController | null>(null);
  const originalUrl = useObjectUrl(file);
  const resultUrl = useObjectUrl(result?.image);
  const transformation = useMutation({
    mutationFn: async (nextFile: File) => {
      const requestId = ++transformationId.current;
      activeTransformController.current?.abort();
      const controller = new AbortController();
      activeTransformController.current = controller;

      try {
        const nextResult = await transformImagePoster(nextFile, controller.signal);
        if (requestId !== transformationId.current) {
          return undefined;
        }
        return nextResult;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return undefined;
        }
        throw error;
      }
    },
    onSuccess: (nextResult) => {
      if (nextResult) {
        setResult(nextResult);
      }
    }
  });
  const materialAnalysis = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error('Generated image is missing.');
      const generatedFile = new File([result.image], result.fileName, { type: 'image/png', lastModified: Date.now() });
      const analysis = await analyzeMaterial(generatedFile);
      return { generatedFile, analysis };
    },
    onSuccess: ({ generatedFile, analysis }) => navigate('/admin/documents/ai', {
      state: { file: generatedFile, analysis, fromImageTransformation: true }
    })
  });

  const handleTransform = () => {
    if (!file || transformation.isPending || materialAnalysis.isPending) {
      return;
    }
    transformation.mutate(file);
  };

  const chooseFile = (next?: File) => {
    if (!next) return;
    if (!supportedTypes.includes(next.type)) {
      setFileError('Підтримуються лише зображення PNG, JPEG та WEBP.');
      return;
    }
    if (next.size > maximumFileSize) {
      setFileError('Розмір зображення не повинен перевищувати 10 МБ.');
      return;
    }
    activeTransformController.current?.abort();
    transformationId.current += 1;
    transformation.reset();
    materialAnalysis.reset();
    setFileError('');
    setFile(next);
    setResult(undefined);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    chooseFile(event.dataTransfer.files[0]);
  };
  const download = () => {
    if (!resultUrl || !result) return;
    const link = document.createElement('a');
    link.href = resultUrl;
    link.download = result.fileName;
    link.click();
  };

  return (
    <Box className="content-panel">
      <Stack gap={3}>
        <Box>
          <Typography variant="h3">Переробити зображення</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Завантажте освітнє зображення, щоб створити новий україномовний постер у стилі MathArchive.
          </Typography>
        </Box>

        {transformation.isError && (
          <Alert severity="error">
            {getApiErrorMessage(transformation.error, 'Не вдалося створити постер. Спробуйте ще раз пізніше.')}
          </Alert>
        )}
        {materialAnalysis.isError && (
          <Alert severity="error">
            {getApiErrorMessage(materialAnalysis.error, 'Не вдалося проаналізувати матеріал. Спробуйте ще раз.')}
          </Alert>
        )}
        {fileError && <Alert severity="error">{fileError}</Alert>}

        {!result && (
          <Box
            onDrop={onDrop}
            onDragOver={(event) => event.preventDefault()}
            sx={{ border: '2px dashed', borderColor: 'divider', borderRadius: 3, p: { xs: 2, sm: 3 }, textAlign: 'center' }}
          >
            {originalUrl && (
              <Box component="img" src={originalUrl} alt="Оригінальне завантажене зображення"
                sx={{ display: 'block', maxHeight: 420, maxWidth: '100%', objectFit: 'contain', mx: 'auto', mb: 2 }} />
            )}
            {file && <Typography sx={{ mb: 2 }}>{file.name} · {formatFileSize(file.size)}</Typography>}
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="center" gap={1}>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={transformation.isPending}>
                {file ? 'Замінити зображення' : 'Обрати зображення'}
                <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
              </Button>
              {file && (
                <Button color="error" startIcon={<DeleteOutlineIcon />} disabled={transformation.isPending}
                  onClick={() => {
                    activeTransformController.current?.abort();
                    transformationId.current += 1;
                    setFile(undefined); setResult(undefined); transformation.reset(); materialAnalysis.reset();
                  }}>
                  Видалити
                </Button>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              або перетягніть PNG, JPEG чи WEBP сюди · до 10 МБ
            </Typography>
          </Box>
        )}

        {transformation.isPending && (
          <Stack alignItems="center" gap={1.5} role="status" aria-live="polite" sx={{ py: 4 }}>
            <CircularProgress />
            <Typography variant="h6">Створюємо матеріал у стилі MathArchive...</Typography>
            <Typography color="text.secondary">Це може тривати кілька хвилин. Не закривайте сторінку.</Typography>
          </Stack>
        )}

        {result && originalUrl && resultUrl && (
          <>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <PosterPreview title="Оригінал" src={originalUrl} alt="Оригінальне зображення" />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <PosterPreview title="Результат" src={resultUrl} alt="Згенерований постер MathArchive" />
              </Grid>
            </Grid>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
              <Button variant="contained" startIcon={materialAnalysis.isPending ? <CircularProgress size={18} color="inherit" /> : <AutoFixHighIcon />}
                disabled={materialAnalysis.isPending} onClick={() => materialAnalysis.mutate()}>
                {materialAnalysis.isPending ? 'Аналізуємо матеріал...' : 'Використати для матеріалу'}
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={download}>Завантажити PNG</Button>
              <Button variant="outlined" startIcon={<ReplayIcon />} disabled={transformation.isPending || materialAnalysis.isPending}
                onClick={handleTransform}>
                Спробувати ще раз
              </Button>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={transformation.isPending || materialAnalysis.isPending}>
                Обрати інше зображення
                <input hidden type="file" accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => chooseFile(event.target.files?.[0])} />
              </Button>
            </Stack>
          </>
        )}

        {!result && !transformation.isPending && (
          <Button variant="contained" startIcon={<AutoFixHighIcon />} disabled={!file || transformation.isPending}
            onClick={handleTransform} sx={{ alignSelf: { sm: 'flex-start' } }}>
            Переробити в стилі MathArchive
          </Button>
        )}
      </Stack>
    </Box>
  );
}

function PosterPreview({ title, src, alt }: { title: string; src: string; alt: string }) {
  return (
    <Stack gap={1} sx={{ height: '100%' }}>
      <Typography variant="h6">{title}</Typography>
      <Box sx={{ bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, flexGrow: 1 }}>
        <Box component="img" src={src} alt={alt} sx={{ display: 'block', width: '100%', maxHeight: 720, objectFit: 'contain' }} />
      </Box>
    </Stack>
  );
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('name' in error && error.name === 'AbortError') return true;
  if ('code' in error && error.code === 'ERR_CANCELED') return true;
  return false;
}

function useObjectUrl(value?: Blob) {
  const url = useMemo(() => value && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(value) : undefined, [value]);
  useEffect(() => () => { if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url); }, [url]);
  return url;
}
