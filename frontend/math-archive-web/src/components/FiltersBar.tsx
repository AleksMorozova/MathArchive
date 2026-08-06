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
}

export function FiltersBar({ filters, topics, onChange, onClear }: FiltersBarProps) {
  return (
    <Stack className="filters-bar" direction={{ xs: 'column', md: 'row' }} gap={2}>
      <TextField
        label="Пошук матеріалів"
        placeholder="Введіть назву або тему"
        value={filters.search ?? ''}
        onChange={(event) => onChange({ search: event.target.value })}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
      />
      <TextField select label="Клас" value={filters.grade ?? ''} onChange={(event) => onChange({ grade: event.target.value })}>
        <MenuItem value="">Усі класи</MenuItem>
        {Array.from({ length: 11 }, (_, index) => index + 1).map((grade) => (
          <MenuItem key={grade} value={grade}>{grade} клас</MenuItem>
        ))}
      </TextField>
      <TextField select label="Тема" value={filters.topic ?? ''} onChange={(event) => onChange({ topic: event.target.value })}>
        <MenuItem value="">Усі теми</MenuItem>
        {topics.map((topic) => <MenuItem key={topic} value={topic}>{topic}</MenuItem>)}
      </TextField>
      <TextField select label="Тип матеріалу" value={filters.documentType ?? ''} onChange={(event) => onChange({ documentType: event.target.value })}>
        <MenuItem value="">Усі типи</MenuItem>
        {documentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
      </TextField>
      <Button startIcon={<ClearIcon />} onClick={onClear}>Очистити фільтри</Button>
    </Stack>
  );
}
