import { Box, Container, Grid, Pagination, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DocumentCard } from '../components/DocumentCard';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { FiltersBar } from '../components/FiltersBar';
import { useDocuments, useTopics } from '../hooks/useDocuments';
import type { DocumentFilters } from '../types/documents';

export function MaterialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const filters = useMemo<DocumentFilters>(() => ({
    search: searchParams.get('search') ?? '',
    grade: searchParams.get('grade') ?? '',
    topic: searchParams.get('topic') ?? '',
    documentType: searchParams.get('documentType') ?? '',
    page: Number(searchParams.get('page') ?? 1),
    pageSize: 12
  }), [searchParams]);

  const documents = useDocuments(filters);
  const topics = useTopics();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchDraft !== filters.search) {
        updateFilters({ search: searchDraft, page: 1 });
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  const updateFilters = (next: Partial<DocumentFilters>) => {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value && key !== 'pageSize') {
        params.set(key, String(value));
      }
    });
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchDraft('');
    setSearchParams(new URLSearchParams());
  };

  return (
    <Container maxWidth="lg" className="page-section materials-page">
      <Stack gap={3}>
        <Box className="materials-hero">
          <Stack gap={1.25}>
            <Typography variant="h3">Навчальні матеріали</Typography>
            <Typography color="text.secondary" className="materials-subtitle">
              Знайдіть контрольні, самостійні роботи та теоретичні матеріали.
            </Typography>
          </Stack>
          <FiltersBar
            filters={{ ...filters, search: searchDraft }}
            topics={topics.data ?? []}
            onChange={(next) => {
              if ('search' in next) {
                setSearchDraft(next.search ?? '');
              } else {
                updateFilters({ ...next, page: 1 });
              }
            }}
            onClear={clearFilters}
          />
        </Box>
        {documents.isLoading && <LoadingState />}
        {documents.isError && <ErrorState />}
        {documents.data && (
          <>
            <Typography color="text.secondary">Знайдено матеріалів: {documents.data.totalCount}</Typography>
            {documents.data.items.length === 0 ? (
              <EmptyState />
            ) : (
              <Grid container spacing={2} alignItems="stretch">
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