import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import { Alert, Box, Button, Chip, Container, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiErrorMessage, isApiError } from '../api/apiErrors';
import { downloadDocument, getDocumentFile } from '../api/documentsApi';
import { ErrorState, LoadingState } from '../components/StateView';
import { documentTypeLabels } from '../constants/documentTypes';
import { useDocument } from '../hooks/useDocuments';
import { fileExtension, formatDate, formatFileSize } from '../utils/format';

export function DocumentDetailsPage() {
  const { id } = useParams();
  const query = useDocument(id ?? '');
  const document = query.data;
  const canPreview = Boolean(document && (document.contentType === 'application/pdf' || document.contentType.startsWith('image/')));
  const [downloadError, setDownloadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!document || !canPreview) {
      setPreviewUrl('');
      setPreviewError('');
      return;
    }

    let objectUrl = '';
    let isActive = true;
    setPreviewError('');

    getDocumentFile(document.id)
      .then((blob) => {
        if (!isActive) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((error) => {
        if (!isActive) return;
        setPreviewUrl('');
        setPreviewError(getApiErrorMessage(error, 'Не вдалося завантажити попередній перегляд.'));
      });

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [canPreview, document]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <DocumentErrorState error={query.error} />;
  if (!document) return <ErrorState />;

  const handleDownload = async () => {
    setDownloadError('');
    setIsDownloading(true);
    try {
      await downloadDocument(document.id);
    } catch (error) {
      setDownloadError(getApiErrorMessage(error, 'Не вдалося завантажити файл.'));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Container maxWidth="lg" className="page-section">
      <Stack gap={3}>
        <Button component={Link} to="/materials" startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start' }}>
          Назад до матеріалів
        </Button>
        <Box className="content-panel">
          <Stack gap={2}>
            <Typography variant="h3">{document.title}</Typography>
            {document.description && <Typography color="text.secondary">{document.description}</Typography>}
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Chip label={`Клас: ${document.grade}`} />
              <Chip label={`Тема: ${document.topic}`} />
              <Chip label={`Тип матеріалу: ${documentTypeLabels[document.documentType]}`} />
              <Chip label={`Формат: ${fileExtension(document.originalFileName)}`} />
              <Chip label={`Розмір файлу: ${formatFileSize(document.fileSize)}`} />
              <Chip label={`Дата додавання: ${formatDate(document.createdAt)}`} />
              <Chip label={`Кількість завантажень: ${document.downloadCount}`} />
            </Stack>
            {downloadError && <Alert severity="error">{downloadError}</Alert>}
            <Button startIcon={<DownloadIcon />} variant="contained" onClick={handleDownload} disabled={isDownloading} sx={{ alignSelf: 'flex-start' }}>
              Завантажити файл
            </Button>
          </Stack>
        </Box>
        {previewError && <Alert severity="error">{previewError}</Alert>}
        {canPreview && previewUrl && (
          <Box className="preview-frame">
            {document.contentType === 'application/pdf' ? (
              <iframe title={document.title} src={previewUrl} />
            ) : (
              <img alt={document.title} src={previewUrl} />
            )}
          </Box>
        )}
      </Stack>
    </Container>
  );
}

function DocumentErrorState({ error }: { error: unknown }) {
  if (isApiError(error) && error.status === 404) {
    return (
      <Container maxWidth="md" className="page-section">
        <Box className="state-box">
          <Typography variant="h5">Матеріал не знайдено</Typography>
          <Typography color="text.secondary">Можливо, його було видалено або посилання є неправильним.</Typography>
        </Box>
      </Container>
    );
  }

  return <ErrorState message={getApiErrorMessage(error)} />;
}