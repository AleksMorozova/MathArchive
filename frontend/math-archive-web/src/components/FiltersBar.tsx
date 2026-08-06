import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import { Button, InputAdornment, MenuItem, Stack, TextField } from '@mui/material';
import { documentTypeOptions } from '../constants/documentTypes';
import type { DocumentFilters } from '../types/documents';

interface FiltersBarProps {
  filters: DocumentFilters;
  topics: string[];
  onChange: (next: Partial<DocumentFilters>) => void;
  onClear: () => void;
  showSearch?: boolean;
  showGrade?: boolean;
  compact?: boolean;
}

export function FiltersBar({
  filters,
  topics,
  onChange,
  onClear,
  showSearch = true,
  showGrade = true,
  compact = false
}: FiltersBarProps) {
  const hasSelectedFilters = Boolean(
    (showSearch && filters.search) ||
    (showGrade && filters.grade) ||
    filters.topic ||
    filters.documentType
  );

  return (
    <Stack className={`filters-bar${compact ? ' filters-bar-compact' : ''}`} direction={{ xs: 'column', md: 'row' }} gap={compact ? 1.25 : 2}>
      {showSearch && (
        <TextField
          label="Пошук матеріалів"
          placeholder="Введіть назву або тему"
          value={filters.search ?? ''}
          onChange={(event) => onChange({ search: event.target.value })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        />
      )}
      {showGrade && (
        <TextField select label="Клас" value={filters.grade ?? ''} onChange={(event) => onChange({ grade: event.target.value })}>
          <MenuItem value="">Усі класи</MenuItem>
          {Array.from({ length: 11 }, (_, index) => index + 1).map((grade) => (
            <MenuItem key={grade} value={grade}>{grade} клас</MenuItem>
          ))}
        </TextField>
      )}
      <TextField select label="Тема" value={filters.topic ?? ''} onChange={(event) => onChange({ topic: event.target.value })}>
        <MenuItem value="">Оберіть тему</MenuItem>
        {topics.map((topic) => <MenuItem key={topic} value={topic}>{topic}</MenuItem>)}
      </TextField>
      <TextField select label="Тип матеріалу" value={filters.documentType ?? ''} onChange={(event) => onChange({ documentType: event.target.value })}>
        <MenuItem value="">Оберіть тип матеріалу</MenuItem>
        {documentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
      </TextField>
      <Button startIcon={<ClearIcon />} onClick={onClear} disabled={compact && !hasSelectedFilters}>Очистити фільтри</Button>
    </Stack>
  );
}
