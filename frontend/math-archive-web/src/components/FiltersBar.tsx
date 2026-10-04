import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import { Button, InputAdornment, MenuItem, Stack, TextField } from '@mui/material';
import { documentTypeOptions } from '../constants/documentTypes';
import { schoolGrades } from '../constants/grades';
import type { DocumentFilters } from '../types/documents';

interface FiltersBarProps {
  filters: DocumentFilters;
  topics: string[];
  onChange: (next: Partial<DocumentFilters>) => void;
  onClear: () => void;
  showSearch?: boolean;
  showGrade?: boolean;
  showTopic?: boolean;
  showDocumentType?: boolean;
  showCreatedDate?: boolean;
  compact?: boolean;
  gradeOptions?: number[];
  topicMode?: 'select' | 'text';
}

export function FiltersBar({
  filters,
  topics,
  onChange,
  onClear,
  showSearch = true,
  showGrade = true,
  showTopic = true,
  showDocumentType = true,
  showCreatedDate = false,
  compact = false,
  gradeOptions = [...schoolGrades],
  topicMode = 'select'
}: FiltersBarProps) {
  const hasSelectedFilters = Boolean(
    (showSearch && filters.search) ||
    (showGrade && filters.grade) ||
    (showTopic && filters.topic?.trim()) ||
    (showDocumentType && filters.documentType) ||
    (showCreatedDate && (filters.createdFrom || filters.createdTo))
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
        <div className="grade-control">
        <TextField
          className={filters.grade ? 'grade-selector grade-selector-selected' : 'grade-selector'}
          select label="Клас" value={filters.grade ?? ''}
          onChange={(event) => onChange({ grade: String(event.target.value) })}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, MenuProps: { transitionDuration: 160, slotProps: { paper: { className: 'grade-filter-menu' } } }, renderValue: value => (
            <span key={String(value)} className="grade-selection-value">
              {value === 'general' ? 'Загальні' : value ? `${value} клас` : 'Усі класи'}
            </span>
          ) } }}
        >
          <MenuItem value="">Усі класи</MenuItem>
          {gradeOptions.map((grade) => (
            <MenuItem key={grade} value={grade}>{grade} клас</MenuItem>
          ))}
          <MenuItem value="general">Загальні</MenuItem>
        </TextField>
        </div>
      )}
      {showTopic && topicMode === 'select' && (
        <TextField select label="Тема" value={filters.topic ?? ''} onChange={(event) => onChange({ topic: event.target.value })}>
          <MenuItem value="">Оберіть тему</MenuItem>
          {topics.map((topic) => <MenuItem key={topic} value={topic}>{topic}</MenuItem>)}
        </TextField>
      )}
      {showTopic && topicMode === 'text' && (
        <TextField
          className="math-search-field"
          label="Пошук за темою"
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          placeholder="геом, прогрес, ймов..."
          value={filters.topic ?? ''}
          onChange={(event) => onChange({ topic: event.target.value })}
        />
      )}
      {showDocumentType && (
        <TextField select label="Тип матеріалу" value={filters.documentType ?? ''} onChange={(event) => onChange({ documentType: event.target.value })}>
          <MenuItem value="">Оберіть тип матеріалу</MenuItem>
          {documentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
      )}
      {showCreatedDate && (
        <>
          <TextField
            label="Від"
            type="date"
            value={filters.createdFrom ?? ''}
            onChange={(event) => onChange({ createdFrom: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="До"
            type="date"
            value={filters.createdTo ?? ''}
            onChange={(event) => onChange({ createdTo: event.target.value })}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: filters.createdFrom || undefined } }}
          />
        </>
      )}
      <Button startIcon={<ClearIcon />} onClick={onClear} disabled={compact && !hasSelectedFilters}>Очистити фільтри</Button>
    </Stack>
  );
}
