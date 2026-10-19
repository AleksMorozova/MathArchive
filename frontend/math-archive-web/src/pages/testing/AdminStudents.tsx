import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { studentApi } from "../../api/studentApi";
import { getApiErrorMessage } from "../../api/apiErrors";
import { ErrorState, LoadingState } from "../../components/StateView";
import { schoolGrades } from "../../constants/grades";
export function AdminStudentsPage() {
  const [search, setSearch] = useState(""); const [grade, setGrade] = useState(""); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["admin-students", search, grade, page], queryFn: () => studentApi.students({ search: search || undefined, grade: grade || undefined, page }) });
  return <Stack gap={3}><Typography variant="h4">Учні</Typography><Stack direction={{ xs: "column", sm: "row" }} gap={2}>
    <TextField label="Пошук за ім’ям та прізвищем" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
    <TextField select label="Клас" value={grade} onChange={e => { setGrade(e.target.value); setPage(1); }} sx={{ minWidth: 150 }}><MenuItem value="">Усі класи</MenuItem>{schoolGrades.map(g => <MenuItem key={g} value={g}>{g} клас</MenuItem>)}</TextField>
  </Stack>{query.isPending ? <LoadingState /> : query.isError ? <ErrorState message={getApiErrorMessage(query.error)} /> : <>
    <Typography>Зареєстровано за фільтрами: {query.data.totalCount}</Typography>
    {!query.data.items.length && <Alert severity="info">Учнів за цими фільтрами немає.</Alert>}
    {query.data.items.map(s => <Stack key={s.id} direction={{ xs: "column", sm: "row" }} gap={2} alignItems="center" sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Typography sx={{ flex: 1 }}>{s.lastName} {s.firstName} · {s.grade} клас · {s.isActive ? "Активний" : "Вимкнений"} · {(s.authenticationMethods ?? ["PIN"]).join(" · ")}</Typography><Button component={Link} to={`/admin/students/${s.id}`}>Профіль та результати</Button>
    </Stack>)}<Pagination count={query.data.totalPages} page={page} onChange={(_, p) => setPage(p)} /></>}
  </Stack>;
}
export function AdminStudentPage() {
  const { studentId = "" } = useParams(); const cache = useQueryClient(); const [page, setPage] = useState(1);
  const [reset, setReset] = useState(false); const [toggle, setToggle] = useState(false); const [pin, setPin] = useState(""); const [notice, setNotice] = useState("");
  const summary = useQuery({ queryKey: ["admin-student", studentId], queryFn: () => studentApi.summary(studentId) });
  const attempts = useQuery({ queryKey: ["admin-student-attempts", studentId, page], queryFn: () => studentApi.attempts(studentId, page) });
  const mutation = useMutation({ mutationFn: async (kind: "pin" | "active") => {
    if (kind === "pin") await studentApi.resetPin(studentId, pin);
    else await studentApi.setActive(studentId, !summary.data!.student.isActive);
  }, onSuccess: (_, kind) => { setReset(false); setToggle(false); setPin(""); setNotice(kind === "pin" ? "PIN-код змінено. Попередні сеанси завершено. Передайте новий код учню особисто." : "Стан облікового запису змінено. Попередні сеанси завершено."); void cache.invalidateQueries({ queryKey: ["admin-student", studentId] }); void cache.invalidateQueries({ queryKey: ["admin-students"] }); } });
  if (summary.isPending) return <LoadingState />;
  if (summary.isError) return <ErrorState message={getApiErrorMessage(summary.error)} />;
  const { student: s, completedAttempts, completedTests, averagePercentage } = summary.data;
  return <Stack gap={3}><Button component={Link} to="/admin/students" sx={{ alignSelf: "flex-start" }}>← Учні</Button><Typography variant="h4">{s.lastName} {s.firstName} · {s.grade} клас</Typography>
    <Typography>{s.isActive ? "Активний обліковий запис" : "Обліковий запис вимкнено"} · Зареєстровано {new Date(s.createdAt).toLocaleDateString("uk-UA")} · Останній вхід: {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString("uk-UA") : "—"}</Typography>
    <Typography>Способи входу: {(s.authenticationMethods ?? ["PIN"]).join(" · ")}</Typography>
    <Typography>Завершених спроб: {completedAttempts} · Пройдених тестів: {completedTests} · Середній результат: {averagePercentage === null ? "—" : averagePercentage.toFixed(2) + "%"}</Typography>
    {notice && <Alert severity="success">{notice}</Alert>}{mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}
    <Stack direction="row" gap={2} flexWrap="wrap"><Button variant="outlined" onClick={() => { setReset(true); mutation.reset(); }}>Скинути PIN-код</Button><Button color={s.isActive ? "warning" : "primary"} onClick={() => { setToggle(true); mutation.reset(); }}>{s.isActive ? "Вимкнути обліковий запис" : "Увімкнути обліковий запис"}</Button><Button component={Link} to={`/admin/tests/statistics?studentId=${s.id}`}>Статистика учня</Button></Stack>
    <Typography variant="h5">Усі спроби</Typography>{attempts.isPending ? <LoadingState /> : attempts.isError ? <ErrorState message={getApiErrorMessage(attempts.error)} /> : <>{!attempts.data.items.length && <Alert severity="info">Учень ще не проходив тести.</Alert>}{attempts.data.items.map(a => <Stack key={a.id} sx={{ border: "1px solid", borderColor: "divider", p: 2, borderRadius: 2 }} gap={1}><Typography>{a.testTitle} · Спроба №{a.attemptNumber}</Typography><Typography>{a.status === "InProgress" ? "Триває" : `${a.earnedPoints} / ${a.maximumPoints} · ${a.percentage}%`} · {new Date(a.completedAt ?? a.startedAt).toLocaleString("uk-UA")}</Typography><Button component={Link} to={`/admin/tests/attempts/${a.id}`}>Переглянути відповіді</Button></Stack>)}<Pagination count={attempts.data.totalPages} page={page} onChange={(_, p) => setPage(p)} /></>}
    <Dialog open={reset} onClose={() => { if (!mutation.isPending) { setReset(false); setPin(""); } }}><DialogTitle>Скинути PIN-код?</DialogTitle><DialogContent><Typography sx={{ mb: 2 }}>Попередні сеанси учня буде завершено. Історія збережеться. Новий PIN потрібно передати учню особисто.</Typography><TextField label="Новий PIN-код" type="password" autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value)} helperText="8–64 символи без пробілів, щонайменше 3 різні символи." inputProps={{ maxLength: 64 }} fullWidth />{mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}</DialogContent><DialogActions><Button disabled={mutation.isPending} onClick={() => { setReset(false); setPin(""); }}>Скасувати</Button><Button disabled={mutation.isPending || pin.length < 8} onClick={() => mutation.mutate("pin")}>{mutation.isPending ? "Зберігаємо…" : "Змінити PIN-код"}</Button></DialogActions></Dialog>
    <Dialog open={toggle} onClose={() => !mutation.isPending && setToggle(false)}><DialogTitle>{s.isActive ? "Вимкнути обліковий запис?" : "Увімкнути обліковий запис?"}</DialogTitle><DialogContent>Історія результатів залишиться збереженою.{mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}</DialogContent><DialogActions><Button disabled={mutation.isPending} onClick={() => setToggle(false)}>Скасувати</Button><Button disabled={mutation.isPending} onClick={() => mutation.mutate("active")}>Підтвердити</Button></DialogActions></Dialog>
  </Stack>;
}
