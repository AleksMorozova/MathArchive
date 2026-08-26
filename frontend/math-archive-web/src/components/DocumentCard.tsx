import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getApiErrorMessage } from '../api/apiErrors';
import { downloadDocument } from '../api/documentsApi';
import type { DocumentDto } from '../types/documents';

export function DocumentCard({ document }: { document: DocumentDto }) {
  const location = useLocation();
  const [downloadError, setDownloadError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

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
    <Card className="document-card">
      <CardContent className="document-card-content">
        <Stack className="document-card-body">
          <Stack direction="row" alignItems="flex-start" gap={1.5} className="document-card-heading">
            <Box className="document-card-icon" aria-hidden="true"><DescriptionOutlinedIcon fontSize="small" /></Box>
            <Typography variant="h6" className="card-title">{document.title}</Typography>
          </Stack>
          <Stack direction="row" gap={0.75} flexWrap="wrap" className="document-tags">
            <Chip label={document.grade === null ? 'Загальний матеріал' : `${document.grade} клас`} size="small" />
            <Chip label={document.topic} size="small" />
          </Stack>
          {downloadError && <Alert severity="error">{downloadError}</Alert>}
          <Stack direction="row" gap={1} className="card-actions">
            <Button startIcon={<DownloadIcon />} variant="text" onClick={handleDownload} disabled={isDownloading}>
              Завантажити
            </Button>
            <Button
              startIcon={<VisibilityIcon />}
              variant="text"
              component={Link}
              to={`/materials/${document.id}`}
              state={{ from: location.pathname + location.search }}
            >
              Переглянути
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
