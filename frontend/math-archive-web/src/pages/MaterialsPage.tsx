import { Box, Container, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/apiErrors';
import { DocumentCard } from '../components/DocumentCard';
import { EmptyState, ErrorState } from '../components/StateView';
import { FiltersBar } from '../components/FiltersBar';
import { useInfiniteDocuments } from '../hooks/useDocuments';
import type { DocumentFilters } from '../types/documents';

const materialClassOptions = [5, 6, 7, 8, 9, 10, 11];

export function MaterialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const classFilter = searchParams.get('class') ?? searchParams.get('grade') ?? '';
  const topicFilter = searchParams.get('topic') ?? '';
  const [topicInput, setTopicInput] = useState(topicFilter);
  const filters = useMemo<DocumentFilters>(() => ({
    search: topicFilter,
    grade: classFilter,
    topic: '',
    documentType: '',
    page: 1,
    pageSize: 12
  }), [classFilter, topicFilter]);

  const documents = useInfiniteDocuments(filters);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadedDocuments = useMemo(
    () => documents.data?.pages.flatMap((page) => page.items) ?? [],
    [documents.data]
  );
  const totalCount = documents.data?.pages[0]?.totalCount ?? 0;

  const updateFilters = (next: Partial<DocumentFilters>) => {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.grade) {
      params.set('class', String(merged.grade));
    }
    const topic = (next.topic ?? topicInput).trim();
    if (topic) {
      params.set('topic', topic);
    }
    setSearchParams(params);
  };

  const clearFilters = () => {
    setTopicInput('');
    setSearchParams(new URLSearchParams());
  };

  useEffect(() => {
    setTopicInput(topicFilter);
  }, [topicFilter]);

  useEffect(() => {
    const nextTopic = topicInput.trim();
    if (nextTopic === topicFilter) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (filters.grade) {
        params.set('class', String(filters.grade));
      }
      if (nextTopic) {
        params.set('topic', nextTopic);
      }
      setSearchParams(params);
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [filters.grade, setSearchParams, topicInput, topicFilter]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !documents.hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && documents.hasNextPage && !documents.isFetchingNextPage) {
          void documents.fetchNextPage();
        }
      },
      { rootMargin: '360px 0px' }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [documents.fetchNextPage, documents.hasNextPage, documents.isFetchingNextPage]);

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
            filters={{ ...filters, topic: topicInput }}
            topics={[]}
            onChange={(next) => {
              if ('topic' in next) {
                setTopicInput(next.topic ?? '');
                return;
              }

              updateFilters({ ...next, page: 1 });
            }}
            onClear={clearFilters}
            showSearch={false}
            showGrade
            showTopic
            showDocumentType={false}
            gradeOptions={materialClassOptions}
            topicMode="text"
            compact
          />
        </Box>
        {documents.isLoading && (
          <Grid container spacing={2.25} alignItems="flex-start" className="materials-grid">
            {Array.from({ length: 6 }, (_, index) => (
              <Grid key={index} size={{ xs: 12, md: 6, lg: 4 }} sx={{ display: 'flex' }}>
                <MaterialCardSkeleton />
              </Grid>
            ))}
          </Grid>
        )}
        {documents.isError && <ErrorState message={getApiErrorMessage(documents.error)} />}
        {documents.data && (
          <>
            <Typography color="text.secondary" className="materials-count">Знайдено матеріалів: {totalCount}</Typography>
            {loadedDocuments.length === 0 ? (
              <EmptyState />
            ) : (
              <Grid container spacing={2.25} alignItems="flex-start" className="materials-grid">
                {loadedDocuments.map((document) => (
                  <Grid key={document.id} size={{ xs: 12, md: 6, lg: 4 }} sx={{ display: 'flex' }}>
                    <DocumentCard document={document} />
                  </Grid>
                ))}
                {documents.isFetchingNextPage && Array.from({ length: 3 }, (_, index) => (
                  <Grid key={`next-page-skeleton-${index}`} size={{ xs: 12, md: 6, lg: 4 }} sx={{ display: 'flex' }}>
                    <MaterialCardSkeleton />
                  </Grid>
                ))}
              </Grid>
            )}
            <Box ref={loadMoreRef} sx={{ minHeight: 1 }} aria-hidden="true" />
            {!documents.hasNextPage && loadedDocuments.length > 0 && (
              <Typography color="text.secondary" textAlign="center">Усі матеріали завантажено</Typography>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}

function MaterialCardSkeleton() {
  return (
    <Box className="document-card material-card-skeleton" aria-label="Завантаження матеріалу">
      <Stack gap={2}>
        <Stack direction="row" gap={1.5} alignItems="flex-start">
          <Skeleton variant="rounded" width={34} height={34} />
          <Skeleton variant="text" width="72%" height={32} />
        </Stack>
        <Stack direction="row" gap={0.75}>
          <Skeleton variant="rounded" width={64} height={26} />
          <Skeleton variant="rounded" width={86} height={26} />
          <Skeleton variant="rounded" width={96} height={26} />
        </Stack>
        <Skeleton variant="rounded" width="100%" height={56} />
      </Stack>
    </Box>
  );
}
