import { Alert, Box, Button, MenuItem, Pagination, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { StudentGoogleButton } from "../../components/testing/StudentGoogleButton";
import { studentApi, type StudentHistory } from "../../api/studentApi";
import type { PublicTestSummary } from "../../types/testing";
import { testingApi } from "../../api/testingApi";
import { ApiError, getApiErrorMessage } from "../../api/apiErrors";
import { StudentCompletion, StudentTestLayout } from "../../components/testing/StudentExperience";
import { TestImageContext } from "../../components/testing/RichTestContent";
import { studentSessionKey, useStudentSession } from "../../components/testing/useStudentSession";
import { ErrorState, LoadingState } from "../../components/StateView";
import { schoolGrades } from "../../constants/grades";
import { Seo } from "../../seo/Seo";

function validationError(message: string) { return new ApiError(message, { status: 400, problem: { title: "Тестування", status: 400, detail: message } }); }
const identity = z.object({
  firstName: z.string().trim().min(1, "Введіть ім’я").max(100, "До 100 символів"),
  lastName: z.string().trim().min(1, "Введіть прізвище").max(100, "До 100 символів"),
  grade: z.number().min(5).max(11),
  pin: z.string().min(1, "Введіть PIN-код").max(64, "До 64 символів"),
  confirmPin: z.string(),
});
export function StudentLoginPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const cache = useQueryClient();
  const [register, setRegister] = useState(false);
  const returnPath = params.get("returnTo");
  const destination = returnPath && /^\/(tests(?:\/|$)|student(?:\/|$))/.test(returnPath) ? returnPath : "/student";
  const form = useForm({ resolver: zodResolver(identity), defaultValues: { firstName: "", lastName: "", grade: 5, pin: "", confirmPin: "" } });
  const auth = useMutation({ mutationFn: async (v: z.infer<typeof identity>) => {
    if (register && (v.pin.length < 8 || /\s/.test(v.pin) || new Set(v.pin).size < 3)) throw validationError("PIN-код: 8–64 символи без пробілів, щонайменше 3 різні символи.");
    if (register && v.pin !== v.confirmPin) { form.setError("confirmPin", { message: "PIN-коди не збігаються" }); throw validationError("PIN-коди не збігаються"); }
    return register ? studentApi.register(v) : studentApi.login(v);
  }, onSuccess: async s => {
    await cache.cancelQueries({ queryKey: studentSessionKey });
    await cache.cancelQueries({ queryKey: ["student"] }); cache.removeQueries({ queryKey: ["student"] });
    cache.setQueryData(studentSessionKey, s); form.reset(); navigate(destination, { replace: true });
  } });
  return <StudentTestLayout><Seo title="Вхід для учнів | MathArchive" description="Особистий простір учня" canonicalPath="/student/login" noIndex />
    <div className="student-welcome student-enter"><section className="student-welcome-intro"><span className="student-eyebrow">МТВ · ОСОБИСТИЙ ПРОСТІР</span><Typography component="h1" className="student-welcome-title">Вхід для учнів</Typography><p className="student-welcome-description">Проходь тести, повертайся до своїх результатів і спостерігай за власним поступом.</p><p className="student-account-note">Навчальні матеріали залишаються відкритими для всіх. Обліковий запис потрібен лише для тестування.</p></section>
    <Box component="form" className="student-welcome-form" onSubmit={form.handleSubmit(v => auth.mutate(v))}>
      <StudentGoogleButton onSuccess={async result => {
        if (result.requiresProfile) { navigate('/student/google/profile?returnTo=' + encodeURIComponent(destination)); return; }
        await cache.cancelQueries({ queryKey: studentSessionKey });
        await cache.cancelQueries({ queryKey: ['student'] }); cache.removeQueries({ queryKey: ['student'] });
        cache.setQueryData(studentSessionKey, result.student); navigate(destination, { replace: true });
      }} /><Typography textAlign="center" color="text.secondary" sx={{ my: 2 }}>або</Typography>
      <Tabs value={register ? 1 : 0} onChange={(_, v) => { setRegister(v === 1); auth.reset(); form.clearErrors(); form.setValue("pin", ""); form.setValue("confirmPin", ""); }} variant="fullWidth" sx={{ mb: 3 }}><Tab label="Вхід без Google" /><Tab label="Зареєструватися" /></Tabs>
      <div className="student-form-fields"><div className="student-form-name-row">
        <TextField label="Ім'я" autoComplete="given-name" {...form.register("firstName")} error={!!form.formState.errors.firstName} helperText={form.formState.errors.firstName?.message} />
        <TextField label="Прізвище" autoComplete="family-name" {...form.register("lastName")} error={!!form.formState.errors.lastName} helperText={form.formState.errors.lastName?.message} />
      </div><Controller name="grade" control={form.control} render={({ field }) => <TextField select label="Клас" {...field} onChange={e => field.onChange(Number(e.target.value))}>{schoolGrades.map(g => <MenuItem key={g} value={g}>{g} клас</MenuItem>)}</TextField>} />
      <TextField label={register ? "Придумайте PIN-код" : "PIN-код"} type="password" autoComplete={register ? "new-password" : "current-password"} {...form.register("pin")} error={!!form.formState.errors.pin} helperText={form.formState.errors.pin?.message || (register ? "8–64 символи без пробілів. Використайте щонайменше 3 різні символи." : "Забули PIN-код? Зверніться до вчителя.")} inputProps={{ maxLength: 64 }} />
      {register && <TextField label="Підтвердіть PIN-код" type="password" autoComplete="new-password" {...form.register("confirmPin")} error={!!form.formState.errors.confirmPin} helperText={form.formState.errors.confirmPin?.message} inputProps={{ maxLength: 64 }} />}
      {auth.isError && <Alert severity="error">{getApiErrorMessage(auth.error)}</Alert>}
      <Button className="student-primary-button" variant="contained" type="submit" disabled={auth.isPending}>{auth.isPending ? "Зачекайте…" : register ? "Зареєструватися" : "Увійти"}</Button></div>
    </Box></div></StudentTestLayout>;
}
export function StudentArea({ children }: { children: ReactNode }) {
  const session = useStudentSession();
  return <StudentTestLayout><Seo title="Мої тести | MathArchive" description="Особиста історія тестування" canonicalPath="/student" noIndex />
    {session.isPending ? <LoadingState /> : session.isError ? <ErrorState message={getApiErrorMessage(session.error)} /> : !session.data ? <div className="student-welcome-form"><Typography component="h1" variant="h4">Увійдіть до свого простору</Typography><p>Історія та результати доступні лише власнику облікового запису.</p><Button component={Link} to="/student/login" className="student-primary-button">Вхід для учнів</Button></div> : children}
  </StudentTestLayout>;
}
function HistoryCards({ rows }: { rows: StudentHistory[] }) {
  return !rows.length ? <Alert severity="info">Твоя історія почнеться з першого тесту.</Alert> : <div className="student-history-list">{rows.map(a => <article className="student-dashboard-card" key={a.id}>
    <div><span className="student-eyebrow">Спроба №{a.attemptNumber}</span><h3>{a.testTitle}</h3><p className="student-account-note">{new Date(a.completedAt ?? a.startedAt).toLocaleString("uk-UA")} · {a.status === "InProgress" ? "Триває" : a.status === "Expired" ? "Час завершено" : "Завершено"}</p></div>
    <div className="student-history-result">{a.earnedPoints !== null && <strong>{a.earnedPoints} / {a.maximumPoints} <span>балів</span></strong>}{a.percentage !== null && <span>{a.percentage}%</span>}{a.passed !== null && <span>{a.passed ? "Тест складено" : "Тест не складено"}</span>}
      <Button component={Link} to={a.status === "InProgress" ? `/tests/${a.testId}?attempt=${a.id}` : `/student/attempts/${a.id}`} className="student-secondary-button">{a.status === "InProgress" ? "Продовжити" : "Переглянути"}</Button>
    </div></article>)}</div>;
}
function AvailableTestCard({ test, studentId, attempts }: { test: PublicTestSummary; studentId: string; attempts: StudentHistory[] }) {
  const access = useQuery({ queryKey: ["student", studentId, "access", test.id], queryFn: ({ signal }) => studentApi.access(test.id, signal) });
  const completed = attempts.some(a => a.testId === test.id && a.status !== "InProgress");
  const data = access.data;
  return <article className="student-dashboard-card student-available-card">
    <span className="student-eyebrow">{test.grade} клас · {test.questionCount} питань</span><h3>{test.title}</h3>{test.description && <p>{test.description}</p>}
    {access.isPending ? <Typography role="status" variant="body2">Перевіряємо доступ…</Typography> : access.isError ? <><Alert severity="error">{getApiErrorMessage(access.error)}</Alert><Button onClick={() => void access.refetch()}>Спробувати ще раз</Button></> : <>
      <span className="student-test-status">{data?.resumeAttemptId ? "Триває" : completed ? "Пройдено" : data?.canStart ? "Ще не розпочато" : "Зараз недоступний"}</span>
      <div className="student-test-actions">
        {data?.resumeAttemptId ? <Button component={Link} to={`/tests/${test.id}?attempt=${data.resumeAttemptId}`} className="student-secondary-button">Продовжити</Button> : data?.canStart ? <Button component={Link} to={`/tests/${test.id}`} className="student-secondary-button">{completed ? "Пройти ще раз" : "Розпочати тест"}</Button> : !data?.previousAttemptId && <Typography variant="body2">Тест зараз недоступний.</Typography>}
        {!data?.resumeAttemptId && data?.previousAttemptId && <Button component={Link} to={`/student/attempts/${data.previousAttemptId}`} className="student-secondary-button">Переглянути результат</Button>}
      </div>
    </>}
  </article>;
}
export function StudentDashboardPage() {
  const session = useStudentSession(); const s = session.data;
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab"); const tab = requestedTab === "history" || requestedTab === "statistics" ? requestedTab : "available";
  const history = useQuery({ queryKey: ["student", s?.id, "history"], queryFn: ({ signal }) => studentApi.history(signal), enabled: !!s });
  const tests = useQuery({ queryKey: ["tests", { grade: s?.grade }], queryFn: () => testingApi.list(false, s!.grade), enabled: !!s && tab === "available" });
  const rows = [...(history.data ?? [])].sort((a, b) => Date.parse(b.completedAt ?? b.startedAt) - Date.parse(a.completedAt ?? a.startedAt) || b.attemptNumber - a.attemptNumber);
  const completed = rows.filter(a => a.status !== "InProgress");
  const visibleScores = completed.filter(a => a.percentage !== null);
  const average = visibleScores.length ? visibleScores.reduce((sum, a) => sum + a.percentage!, 0) / visibleScores.length : null;
  const pageSize = 10; const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const requestedPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
  const latest = completed[0];
  return <StudentArea><div className="student-dashboard student-enter"><span className="student-eyebrow">МТВ · ТВІЙ ОСОБИСТИЙ ПРОСТІР</span><Typography component="h1" className="student-session-title">Мої тести</Typography>
    {s && <p className="student-dashboard-greeting">{s.firstName} {s.lastName} <span>· {s.grade} клас</span></p>}
    <Tabs className="student-dashboard-tabs" value={tab} onChange={(_, value: string) => { const next = new URLSearchParams(params); next.set("tab", value); next.delete("page"); setParams(next); }} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Розділи особистого простору">
      <Tab id="student-tab-available" aria-controls="student-panel-available" value="available" label="Доступні тести" />
      <Tab id="student-tab-history" aria-controls="student-panel-history" value="history" label="Історія проходжень" />
      <Tab id="student-tab-statistics" aria-controls="student-panel-statistics" value="statistics" label="Моя статистика" />
    </Tabs>
    <section key={tab} id={`student-panel-${tab}`} aria-labelledby={`student-tab-${tab}`} role="tabpanel" tabIndex={0} className="student-dashboard-panel student-enter">
    {history.isPending ? <LoadingState /> : history.isError ? <ErrorState message={getApiErrorMessage(history.error)} /> : tab === "available" ? <>
      <h2>Доступні тести · {s?.grade} клас</h2>{tests.isPending ? <LoadingState /> : tests.isError ? <ErrorState message={getApiErrorMessage(tests.error)} /> : !tests.data.length ? <Alert severity="info">Тестів для твого класу поки немає.</Alert> : <div className="student-available-tests">{tests.data.map(t => <AvailableTestCard key={t.id} test={t} studentId={s!.id} attempts={rows} />)}</div>}
    </> : tab === "history" ? <>
      <h2>Історія проходжень</h2><HistoryCards rows={rows.slice((page - 1) * pageSize, page * pageSize)} />
      {pageCount > 1 && <Pagination className="student-history-pagination" count={pageCount} page={page} onChange={(_, value) => { const next = new URLSearchParams(params); next.set("page", String(value)); setParams(next); }} size="small" siblingCount={0} />}
    </> : <>
      <h2>Моя статистика</h2>{!rows.length ? <Alert severity="info">Пройди свій перший тест — тут з’явиться твій поступ.</Alert> : <>
        <div className="student-dashboard-metrics">
          <div><strong>{completed.length}</strong><span>Завершених спроб</span></div>
          <div><strong>{new Set(completed.map(a => a.testId)).size}</strong><span>Пройдених тестів</span></div>
          <div><strong>{average === null ? "—" : average.toLocaleString("uk-UA", { maximumFractionDigits: 1 }) + "%"}</strong><span>Середній результат</span></div>
          <div><strong>{latest?.percentage == null ? "—" : latest.percentage + "%"}</strong><span>Останній результат</span>{latest && <p>{latest.testTitle} · {new Date(latest.completedAt ?? latest.startedAt).toLocaleDateString("uk-UA")}</p>}</div>
        </div>
        <p className="student-account-note">Середній результат враховує лише спроби з відкритими оцінками. {latest && latest.percentage === null ? "Останній результат приховано налаштуваннями тесту." : !completed.length ? "Результати з’являться після завершення тесту." : ""}</p>
      </>}
    </>}
    </section>
  </div></StudentArea>;
}

export function StudentHistoricalAttemptPage() {
  const { attemptId = "" } = useParams(); const session = useStudentSession();
  const query = useQuery({ queryKey: ["student", session.data?.id, "historical-attempt", attemptId], queryFn: ({ signal }) => testingApi.attempt({ id: attemptId, token: "" }, signal), enabled: !!session.data, retry: false });
  return <StudentArea><Button component={Link} to="/student?tab=history" sx={{ mb: 3 }}>← Історія проходжень</Button>{query.isPending ? <LoadingState /> : query.isError ? <ErrorState message={getApiErrorMessage(query.error)} /> : query.data.status === "InProgress" ? <Alert severity="info">Ця спроба ще триває. Продовж її зі сторінки «Мої тести».</Alert> : <TestImageContext.Provider value={{ id: attemptId, token: "" }}><StudentCompletion attempt={query.data} /></TestImageContext.Provider>}</StudentArea>;
}


