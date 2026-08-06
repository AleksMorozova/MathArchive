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
        <Stack gap={2} className="document-card-body">
          <Box className="document-card-heading">
            <Typography variant="h6" className="card-title">{document.title}</Typography>
          </Box>
          <Stack direction="row" gap={1} flexWrap="wrap" className="document-tags">
            <Chip label={`${document.grade} клас`} />
            <Chip label={document.topic} />
            <Chip label={documentTypeLabels[document.documentType]} />
          </Stack>
          <Box className="card-spacer" />
          <Stack direction="row" gap={1} className="card-actions">
            <Button startIcon={<DownloadIcon />} variant="contained" onClick={() => downloadDocument(document.id)}>
              Завантажити
            </Button>
            <Button startIcon={<VisibilityIcon />} component={Link} to={`/materials/${document.id}`}>
              Переглянути
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}