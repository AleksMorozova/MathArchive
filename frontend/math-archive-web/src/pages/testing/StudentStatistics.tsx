import { Alert, Autocomplete, Card, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { studentApi } from "../../api/studentApi";
import { getApiErrorMessage } from "../../api/apiErrors";
import { ErrorState, LoadingState } from "../../components/StateView";
export function StudentStatisticsFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const options = useQuery({ queryKey: ["admin-student-options", search], queryFn: () => studentApi.students({ search: search || undefined, pageSize: 100 }) });
  const selected = options.data?.items.find(s => s.id === value) ?? (value ? { id: value, firstName: "Обраний", lastName: "учень", grade: 0 } : null);
  return <Autocomplete options={options.data?.items ?? []} value={selected} isOptionEqualToValue={(a, b) => a.id === b.id} getOptionLabel={s => `${s.lastName} ${s.firstName}${s.grade ? " · " + s.grade + " клас" : ""}`} filterOptions={v => v} onInputChange={(_, text, reason) => { if (reason === "input") setSearch(text); }} onChange={(_, s) => onChange(s?.id ?? "")} loading={options.isPending} noOptionsText="Учнів не знайдено" renderInput={params => <TextField {...params} label="Учень" placeholder="Пошук за ім’ям та прізвищем" error={options.isError} helperText={options.isError ? getApiErrorMessage(options.error) : "Порожнє поле — усі учні"} />} />;
}
export function StudentStatisticsPanel({ filter }: { filter: object }) {
  const query = useQuery({ queryKey: ["student-testing-statistics", filter], queryFn: () => studentApi.statistics(filter) });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={getApiErrorMessage(query.error)} />;
  const s = query.data;
  return <Stack gap={2}><Typography variant="h5">Учні та повторні спроби</Typography><Stack direction="row" flexWrap="wrap" gap={2}>{[
    ["Зареєстрованих учнів · загалом", s.registeredStudents], ["Активних облікових записів · загалом", s.activeStudents], ["Унікальних учнів · за фільтрами", s.uniqueStudents], ["Завершених спроб · за фільтрами", s.completedAttempts], ["Середній результат · за фільтрами", s.averagePercentage.toFixed(2) + "%"]
  ].map(([label, value]) => <Card key={label}><CardContent><Typography variant="body2">{label}</Typography><Typography variant="h5">{value}</Typography></CardContent></Card>)}</Stack>
    <Typography variant="body2" color="text.secondary">Активні облікові записи — ті, які не вимкнено. Унікальні учні — власники завершених спроб у вибраному періоді. Анонімні історичні спроби враховуються в загальній кількості спроб, але не як зареєстровані учні.</Typography>
    {!s.performance.length ? <Alert severity="info">Немає завершених спроб зареєстрованих учнів за цими фільтрами.</Alert> : <TableContainer><Table size="small"><TableHead><TableRow>{["Учень", "Тест", "Спроб", "Перша · %", "Остання · %", "Найкраща · %"].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{s.performance.map(p => <TableRow key={p.studentId + ":" + p.testId}><TableCell><Link to={`/admin/students/${p.studentId}`}>{p.studentName}</Link></TableCell><TableCell>{p.testTitle}</TableCell><TableCell>{p.attempts}</TableCell><TableCell>{p.firstPercentage}</TableCell><TableCell>{p.latestPercentage}</TableCell><TableCell>{p.bestPercentage}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
    <Typography variant="caption">Перша, остання та найкраща спроби обчислюються серед спроб, що відповідають обраним фільтрам. Кожен рядок — один учень і один тест.</Typography>
  </Stack>;
}
