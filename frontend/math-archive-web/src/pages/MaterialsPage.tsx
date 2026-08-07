import { Box, Container, Grid, Pagination, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DocumentCard } from '../components/DocumentCard';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { FiltersBar } from '../components/FiltersBar';
import { useDocuments } from '../hooks/useDocuments';
import type { DocumentFilters } from '../types/documents';

export function MaterialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo<DocumentFilters>(() => ({
    search: '',
    grade: searchParams.get('grade') ?? '',
    topic: '',
    documentType: searchParams.get('documentType') ?? '',
    page: Number(searchParams.get('page') ?? 1),
    pageSize: 12
  }), [searchParams]);

  const documents = useDocuments(filters);

  const updateFilters = (next: Partial<DocumentFilters>) => {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.grade) {
      params.set('grade', String(merged.grade));
    }
    if (merged.documentType) {
      params.set('documentType', merged.documentType);
    }
    if (merged.page && merged.page > 1) {
      params.set('page', String(merged.page));
    }
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  return (
    <Container maxWidth="lg" className="page-section materials-page">
      <Stack gap={2.5}>
        <Box className="materials-hero">
          <Stack gap={1.25}>
            <Typography variant="h3">Навчальні матеріали</Typography>
            <Typography color="text.secondary" className="materials-subtitle">
              Знайдіть контрольні, самостійні роботи та теоретичні матеріали.
            </Typography>
          </Stack>
          <FiltersBar
            filters={filters}
            topics={[]}
            onChange={(next) => updateFilters({ ...next, page: 1 })}
            onClear={clearFilters}
            showSearch={false}
            showGrade
            showTopic={false}
            compact
          />
        </Box>
        {documents.isLoading && <LoadingState />}
        {documents.isError && <ErrorState />}
        {documents.data && (
          <>
            <Typography color="text.secondary" className="materials-count">Знайдено матеріалів: {documents.data.totalCount}</Typography>
            {documents.data.items.length === 0 ? (
              <EmptyState />
            ) : (
              <Grid container spacing={2.25} alignItems="flex-start" className="materials-grid">
                {documents.data.items.map((document) => (
                  <Grid key={document.id} size={{ xs: 12, md: 6, lg: 4 }} sx={{ display: 'flex' }}>
                    <DocumentCard document={document} />
                  </Grid>
                ))}
              </Grid>
            )}
            {documents.data.totalPages > 1 && (
              <Pagination
                count={documents.data.totalPages}
                page={documents.data.page}
                onChange={(_, page) => updateFilters({ page })}
                color="primary"
              />
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
