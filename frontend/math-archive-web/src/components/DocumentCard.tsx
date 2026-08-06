import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { downloadDocument } from '../api/documentsApi';
import { documentTypeLabels } from '../constants/documentTypes';
import type { DocumentDto } from '../types/documents';

export function DocumentCard({ document }: { document: DocumentDto }) {
  return (
    <Card className="document-card">
      <CardContent className="document-card-content">
        <Stack className="document-card-body">
          <Stack direction="row" alignItems="flex-start" gap={1.5} className="document-card-heading">
            <Box className="document-card-icon" aria-hidden="true"><DescriptionOutlinedIcon fontSize="small" /></Box>
            <Typography variant="h6" className="card-title">{document.title}</Typography>
          </Stack>
          <Stack direction="row" gap={0.75} flexWrap="wrap" className="document-tags">
            <Chip label={`${document.grade} клас`} size="small" />
            <Chip label={document.topic} size="small" />
            <Chip label={documentTypeLabels[document.documentType]} size="small" />
          </Stack>
          <Stack direction="row" gap={1} className="card-actions">
            <Button startIcon={<DownloadIcon />} variant="text" onClick={() => downloadDocument(document.id)}>
              Завантажити
            </Button>
            <Button startIcon={<VisibilityIcon />} variant="text" component={Link} to={`/materials/${document.id}`}>
              Переглянути
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
