import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import { Box, Button, Chip, Container, Stack, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { buildApiUrl } from '../api/apiConfig';
import { downloadDocument } from '../api/documentsApi';
import { ErrorState, LoadingState } from '../components/StateView';
import { documentTypeLabels } from '../constants/documentTypes';
import { useDocument } from '../hooks/useDocuments';
import { fileExtension, formatDate, formatFileSize } from '../utils/format';

export function DocumentDetailsPage() {
  const { id } = useParams();
  const query = useDocument(id ?? '');

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <NotFoundState />;
  if (!query.data) return <ErrorState />;

  const document = query.data;
  const canPreview = document.contentType === 'application/pdf' || document.contentType.startsWith('image/');

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
            <Button startIcon={<DownloadIcon />} variant="contained" onClick={() => downloadDocument(document.id)} sx={{ alignSelf: 'flex-start' }}>
              Завантажити файл
            </Button>
          </Stack>
        </Box>
        {canPreview && (
          <Box className="preview-frame">
            {document.contentType === 'application/pdf' ? (
              <iframe title={document.title} src={buildApiUrl(`/api/documents/${document.id}/download`)} />
            ) : (
              <img alt={document.title} src={buildApiUrl(`/api/documents/${document.id}/download`)} />
            )}
          </Box>
        )}
      </Stack>
    </Container>
  );
}

function NotFoundState() {
  return (
    <Container maxWidth="md" className="page-section">
      <Box className="state-box">
        <Typography variant="h5">Матеріал не знайдено</Typography>
        <Typography color="text.secondary">Можливо, його було видалено або посилання є неправильним.</Typography>
      </Box>
    </Container>
  );
}
