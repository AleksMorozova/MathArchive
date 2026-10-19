import { outboxKey, outboxGeneration, readOutbox, writeOutbox } from "../../components/testing/attemptOutbox";
import { studentApi } from "../../api/studentApi";
import { useStudentSession } from "../../components/testing/useStudentSession";
import { StudentTestLayout, StudentWelcomeIntro, StudentAnswerCards, StudentProgress, StudentFeedback, StudentCompletion } from "../../components/testing/StudentExperience";
import {
  RichTestContent,
  TestImageContext,
} from "../../components/testing/RichTestContent";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/apiErrors";
import { testingApi } from "../../api/testingApi";
import type { Answer, Attempt, Credentials, Review } from "../../types/testing";
import { schoolGrades } from "../../constants/grades";
import { ErrorState, LoadingState } from "../../components/StateView";
import { Seo } from "../../seo/Seo";

export function TestCatalogPage() {
  const [params, setParams] = useSearchParams();
  const grade = params.get("grade");
  const query = useQuery({
    queryKey: ["tests", { grade }],
    queryFn: () => testingApi.list(false, grade ? Number(grade) : undefined),
  });
  return (
    <Container sx={{ py: 5 }}>
      <Seo
        title="Тести | MathArchive"
        description="Тести з математики для 5–11 класів"
        canonicalPath="/tests"
      />
      <Stack gap={3}>
        <Typography variant="h3">Тести</Typography>
        <TextField
          select
          label="Клас"
          value={grade ?? ""}
          onChange={(e) =>
            setParams(e.target.value ? { grade: e.target.value } : {})
          }
        >
          <MenuItem value="">Усі класи</MenuItem>
          {schoolGrades.map((g) => (
            <MenuItem key={g} value={g}>
              {g} клас
            </MenuItem>
          ))}
        </TextField>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={getApiErrorMessage(query.error)} />
        ) : query.data.length === 0 ? (
          <Alert severity="info">Тестів поки немає.</Alert>
        ) : (
          query.data.map((t) => (
            <Card key={t.id}>
              <CardContent>
                <Typography variant="h5">{t.title}</Typography>
                <Typography>{t.description}</Typography>
                <Typography color="text.secondary">
                  {t.grade} клас · {t.questionCount} питань
                  {t.timeLimitMinutes ? ` · ${t.timeLimitMinutes} хв` : ""}
                </Typography>
                <Button component={Link} to={`/tests/${t.id}`}>
                  Відкрити тест
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </Stack>
    </Container>
  );
}
export function AnswerControls({
  question,
  answer,
  disabled,
  onChange,
}: {
  question: Attempt["questions"][number];
  answer: Answer;
  disabled: boolean;
  onChange: (a: Answer) => void;
}) {
  if (question.type === "Text")
    return (
      <TextField
        label="Ваша відповідь"
        value={answer.text ?? ""}
        disabled={disabled}
        inputProps={{ maxLength: 1000 }}
        onChange={(e) => onChange({ ...answer, text: e.target.value })}
        fullWidth
      />
    );
  return (
    <Stack
      role={question.type === "SingleChoice" ? "radiogroup" : "group"}
      sx={{
        minWidth: 0,
        "& .MuiFormControlLabel-root": {
          alignItems: "flex-start",
          width: "100%",
          mx: 0,
        },
        "& .MuiFormControlLabel-label": { minWidth: 0, flex: 1 },
      }}
      aria-label="Варіанти відповідей"
    >
      {question.options.map((o) => (
        <FormControlLabel
          key={o.id}
          label={<RichTestContent text={o.text} content={o.content} />}
          control={
            question.type === "SingleChoice" ? (
              <Radio
                disabled={disabled}
                checked={answer.optionIds.includes(o.id)}
                onChange={() => onChange({ ...answer, optionIds: [o.id] })}
              />
            ) : (
              <Checkbox
                disabled={disabled}
                checked={answer.optionIds.includes(o.id)}
                onChange={(e) =>
                  onChange({
                    ...answer,
                    optionIds: e.target.checked
                      ? [...answer.optionIds, o.id]
                      : answer.optionIds.filter((id) => id !== o.id),
                  })
                }
              />
            )
          }
        />
      ))}
    </Stack>
  );
}
export function ReviewContent({
  question,
  review,
}: {
  question: Attempt["questions"][number];
  review: Review;
}) {
  return (
    <Alert severity={review.isCorrect ? "success" : "error"}>
      <Stack gap={1}>
        <Typography>
          {review.isCorrect ? "Правильно" : "Неправильно"} ·{" "}
          {review.earnedPoints} балів
        </Typography>
        <Typography>Правильна відповідь:</Typography>
        {question.type === "Text" ? (
          <Typography>{review.acceptedAnswers.join("; ")}</Typography>
        ) : (
          question.options
            .filter((o) => review.correctOptionIds.includes(o.id))
            .map((o) => (
              <RichTestContent key={o.id} text={o.text} content={o.content} />
            ))
        )}
        {review.explanation && <RichTestContent text={review.explanation} />}
      </Stack>
    </Alert>
  );
}
export function AttemptResult({ attempt }: { attempt: Attempt }) {
  return (
    <Stack gap={2}>
      <Typography variant="h4">
        {attempt.status === "InProgress"
          ? "Поточні відповіді"
          : "Тест завершено!"}
      </Typography>
      {attempt.status === "Expired" && (
        <Alert severity="info">
          Час тестування вичерпано. Збережені відповіді оцінено.
        </Alert>
      )}
      {attempt.earnedPoints !== null && (
        <>
          <Typography variant="h5">
            {attempt.earnedPoints} / {attempt.maximumPoints} балів ·{" "}
            {attempt.percentage}%
          </Typography>
          <Typography>Правильних відповідей: {attempt.correctCount}</Typography>
          {attempt.passed !== null && (
            <Alert severity={attempt.passed ? "success" : "warning"}>
              {attempt.passed ? "Тест складено" : "Тест не складено"}
            </Alert>
          )}
        </>
      )}
      {attempt.review.map((r) => {
        const q = attempt.questions.find((q) => q.id === r.questionId)!;
        const a = attempt.answers.find((a) => a.questionId === q.id);
        return (
          <Card key={q.id}>
            <CardContent>
              <Stack gap={2}>
                <RichTestContent text={q.text} content={q.content} />
                <Typography>Ваша відповідь:</Typography>
                {!a || (q.type === "Text" ? !a.text : !a.optionIds.length) ? (
                  <Typography>Без відповіді</Typography>
                ) : q.type === "Text" ? (
                  <Typography>{a.text}</Typography>
                ) : (
                  q.options
                    .filter((o) => a.optionIds.includes(o.id))
                    .map((o) => (
                      <RichTestContent
                        key={o.id}
                        text={o.text}
                        content={o.content}
                      />
                    ))
                )}
                <ReviewContent question={q} review={r} />
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
export function StudentTestPage() {
  const { id = "" } = useParams(); const session = useStudentSession();
  const info = useQuery({ queryKey: ["test", id], queryFn: () => testingApi.info(id) });
  return <StudentTestLayout>{session.isPending ? <LoadingState /> : session.isError ? <ErrorState message={getApiErrorMessage(session.error)} /> : !session.data ?
    info.isPending ? <LoadingState /> : info.isError ? <ErrorState message={getApiErrorMessage(info.error)} /> : <div className="student-welcome student-enter"><StudentWelcomeIntro info={info.data} /><section className="student-welcome-form"><span className="student-eyebrow">ОСОБИСТИЙ ПРОСТІР УЧНЯ</span><h2>Увійди, щоб розпочати</h2><p>Твої відповіді та результати збережуться в особистій історії.</p><Button component={Link} to={`/student/login?returnTo=${encodeURIComponent("/tests/" + id)}`} className="student-primary-button">Увійти для тестування</Button></section></div> :
    <StudentTestSession key={id + ":" + session.data.id} />}</StudentTestLayout>;
}
function StudentTestSession() {
  const { id = "" } = useParams();
  const session = useStudentSession();
  const student = session.data!;
  const [params, setParams] = useSearchParams();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const access = useQuery({ queryKey: ["student", student.id, "access", id], queryFn: ({ signal }) => studentApi.access(id, signal) });
  useEffect(() => {
    if (!access.data || credentials) return;
    const attemptId = params.get("attempt") ?? access.data.resumeAttemptId ?? (!access.data.canStart ? access.data.previousAttemptId : null);
    if (attemptId) setCredentials({ id: attemptId, token: "" });
  }, [access.data, credentials, params]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Answer>>({});
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const attemptRef = useRef<Attempt | null>(null);
  const activeAttemptId = useRef<string | null>(null); activeAttemptId.current = credentials?.id ?? null;
  const hydratedAttempt = useRef<string | null>(null);
  function receive(v: Attempt) { if (v.id !== activeAttemptId.current) return; attemptRef.current = v; setAttempt(v); if (v.serverTime) { const receivedAt = Date.now(); setNow(receivedAt); setServerOffset(Date.parse(v.serverTime) - receivedAt); } }
  const localGeneration = useRef(outboxGeneration());
  const localKey = credentials ? outboxKey(student.id, credentials.id) : null;
  function persistDrafts() { if (localKey && !writeOutbox(localKey, pending.current, localGeneration.current)) setError("Не вдалося зберегти локальну копію. Не закривай сторінку до підтвердження сервера."); }
  const questionFocus = useRef<HTMLDivElement>(null);
  useEffect(() => { questionFocus.current?.focus({ preventScroll: true }); questionFocus.current?.scrollIntoView?.({ block: "nearest" }); }, [index, attempt?.id, attempt?.status]);
  const pending = useRef<Record<string, Answer>>({});
  const chain = useRef<Promise<void>>(Promise.resolve());
  const saveError = useRef(false);
  const info = useQuery({
    queryKey: ["test", id],
    queryFn: () => testingApi.info(id),
  });
  const load = useQuery({
    queryKey: ["student", student.id, "attempt", credentials?.id],
    queryFn: ({ signal }) => testingApi.attempt(credentials!, signal),
    enabled: !!credentials,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (load.data && hydratedAttempt.current !== load.data.id) {
      hydratedAttempt.current = load.data.id;
      receive(load.data);
      const restoredIndex = load.data.questions.findIndex(q => q.id === load.data.currentQuestionId); if (restoredIndex >= 0) setIndex(restoredIndex);
      if (localKey && load.data.status === "InProgress") { const restored = readOutbox(localKey, load.data); pending.current = restored; setDrafts(restored); }
      else if (localKey) writeOutbox(localKey, {}, localGeneration.current);
    }
  }, [load.data]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const start = useMutation({
    mutationFn: () => testingApi.start(id),
    onSuccess: (c) => { setNow(Date.now()); setCredentials(c); void access.refetch(); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  // A single queue preserves answer ordering and final submission always drains it first.
  function flush() {
    if (!credentials) return chain.current;
    chain.current = chain.current.then(async () => {
      const batch = Object.values(pending.current);
      pending.current = {};
      if (!batch.length) return;
      setSaving(true);
      const remaining = [...batch];
      try {
        for (const a of batch) {
          const v = await testingApi.answer(credentials, a);
          receive(v);
          remaining.shift();
          setDrafts(d => { const next = { ...d }; if (next[a.questionId]?.operationId === a.operationId) delete next[a.questionId]; return next; });
        }
        saveError.current = false; setConflict(false);
        setError("");
      } catch (e) {
        for (const a of remaining)
          if (!pending.current[a.questionId]) pending.current[a.questionId] = a;
        saveError.current = true; setConflict((e as { status?: number }).status === 409);
        setError(getApiErrorMessage(e));
      } finally {
        persistDrafts();
        setSaving(false);
      }
    });
    return chain.current;
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const timer = window.setTimeout(() => { void flushRef.current(); }, 800);
    return () => window.clearTimeout(timer);
  }, [drafts]);
  useEffect(() => { const online = () => { void flushRef.current(); }; window.addEventListener("online", online); return () => window.removeEventListener("online", online); }, []);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || saving) e.preventDefault();
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [saving]);
  const submit = useMutation({
    mutationFn: async () => {
      await flush();
      if (saveError.current || Object.keys(pending.current).length)
        throw new Error("Не всі відповіді збережено. Повторіть спробу.");
      return testingApi.submit(credentials!);
    },
    onSuccess: (v) => {
      receive(v);
      if (localKey) writeOutbox(localKey, {}, localGeneration.current);
      setConfirm(false);
      setDrafts({});
      void access.refetch();
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const lock = useMutation({
    mutationFn: async (a: Answer) => {
      await flush();
      if (saveError.current) throw new Error("Спочатку збережіть відповіді.");
      return testingApi.answer(credentials!, { ...a, revision: attemptRef.current?.answers.find(saved => saved.questionId === a.questionId)?.revision ?? 0, operationId: crypto.randomUUID() }, true);
    },
    onSuccess: (v) => { receive(v); setDrafts(d => { const next = { ...d }; for (const answer of v.answers) if (answer.locked) delete next[answer.questionId]; return next; }); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const expired =
    attempt?.status === "InProgress" &&
    !!attempt.deadline &&
    now + serverOffset >= new Date(attempt.deadline).getTime();
  useEffect(() => {
    if (expired && credentials) {
      void testingApi
        .attempt(credentials)
        .then(receive)
        .catch((e) => setError(getApiErrorMessage(e)));
    }
  }, [expired, credentials]);
  async function moveQuestion(nextIndex: number) {
    setIndex(nextIndex); await flush();
    if (!credentials || !attemptRef.current || saveError.current) return;
    chain.current = chain.current.then(async () => {
      try { receive(await testingApi.progress(credentials, attemptRef.current!.questions[nextIndex].id, attemptRef.current!.progressRevision ?? 0)); }
      catch (e) { setError(getApiErrorMessage(e)); }
    });
  }
  if (access.isPending || (!credentials && info.isPending) || (credentials && load.isPending))
    return <LoadingState />;
  if (access.isError || (!credentials && info.isError && !access.data?.resumeAttemptId && !access.data?.previousAttemptId) || load.isError)
    return (
      <ErrorState message={getApiErrorMessage(access.error ?? info.error ?? load.error)} />
    );
  const q = attempt?.questions[index];
  const answer = q
    ? (drafts[q.id] ??
      attempt?.answers.find((a) => a.questionId === q.id) ?? {
      questionId: q.id,
      optionIds: [],
      text: null,
    })
    : null;
  const locked =
    q && attempt?.answers.some((a) => a.questionId === q.id && a.locked);
  const busy = submit.isPending || lock.isPending || saving;
  const review = attempt?.review.find((r) => r.questionId === q?.id);
  const remaining = Math.max(0, Math.ceil(((attempt?.deadline ? new Date(attempt.deadline).getTime() : now) - now - serverOffset) / 1000));
  const hasNext = !!attempt && index < attempt.questions.length - 1;
  return <TestImageContext.Provider value={credentials}>
    {attempt && attempt.status !== "InProgress" && info.data && !info.data.allowRepeats && <Alert severity="info" sx={{ mb: 3 }}>Ви вже проходили цей тест</Alert>}
    <Seo title="Тестування | MathArchive" description="Тестування з математики" canonicalPath={`/tests/${id}`} noIndex />
    {error && <Alert severity="error" action={<Button onClick={() => { if (conflict) setReloadConfirm(true); else void flush(); }}>{conflict ? "Завантажити збережену версію" : "Повторити"}</Button>}>{error}</Alert>}
    {!credentials && info.data ? <div className="student-welcome student-enter">
      <StudentWelcomeIntro info={info.data} />
      <section className="student-welcome-form">
        <div className="student-welcome-form-header"><span className="student-eyebrow">УСЕ ГОТОВО ДО ПОЧАТКУ</span><h2>{student.firstName}, зосередься на головному.</h2><p>{student.firstName} {student.lastName} · {student.grade} клас</p></div>
        <p>Відповіді зберігатимуться в особистому просторі. Уважно читай умови й рухайся у своєму темпі.</p>
        {access.data?.canStart ? <Button variant="contained" className="student-primary-button" disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? "Розпочинаємо…" : "Розпочати тест"}</Button> : <Alert severity="info">{access.data?.previousAttemptId ? "Ви вже проходили цей тест" : "Тест зараз недоступний."}</Alert>}
      </section>
    </div> : attempt && attempt.status !== "InProgress" ? <StudentCompletion attempt={attempt} onRepeat={info.data?.allowRepeats && access.data?.canStart && !saving && !lock.isPending && !submit.isPending ? () => {
      setParams({}); setCredentials(null); setAttempt(null); setIndex(0); setDrafts({});
    } : undefined} /> : q && answer && attempt ? <div className="student-session">
      <div className="student-session-heading">
        <div>
          <span className="student-eyebrow">МАТЕМАТИКА · ЧАС ЗОСЕРЕДИТИСЬ</span>
          <Typography component="h1" className="student-session-title">{attempt.title}</Typography>
        </div>
        {attempt.deadline && <div className="student-session-timer" role="timer">Залишилось {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</div>}
      </div>
      {attempt.trackAnswerChanges && <p className="student-account-note">У цьому тесті зберігається історія змін відповідей для вчителя. Для текстових відповідей — лише кількість змін і довжина тексту.</p>}
      <StudentProgress attempt={attempt} index={index} answers={drafts} />
      <section className="student-question-card student-enter" key={q.id} aria-label={`Питання ${index + 1}`}>
        <div className="student-question-topline">
          <span className="student-question-number">ПИТАННЯ {String(index + 1).padStart(2, "0")}</span>
          <span className="student-question-type">{q.type === "Text" ? "Введи коротку відповідь" : q.type === "MultipleChoice" ? "Обери всі правильні відповіді" : "Обери одну відповідь"}</span>
        </div>
        <div className="student-question-statement" role="heading" aria-level={2} tabIndex={-1} ref={questionFocus}>
          <RichTestContent text={q.text} content={q.content} />
        </div>
        <StudentAnswerCards question={q} answer={answer} disabled={!!locked || busy || !!expired} onChange={a => { const draft = { ...a, revision: attemptRef.current?.answers.find(saved => saved.questionId === q.id)?.revision ?? 0, operationId: crypto.randomUUID() }; pending.current[q.id] = draft; setDrafts(d => ({ ...d, [q.id]: draft })); persistDrafts(); }} />
        {review && <StudentFeedback question={q} review={review} />}
        {attempt.answerVisibility === "Immediate" && <div className="student-question-lock">
          <p>{locked ? "Відповідь зафіксовано. Можна рухатися далі." : "Зафіксуй відповідь. Якщо це дозволено налаштуваннями тесту, ти побачиш пояснення. Після цього змінити відповідь буде неможливо."}</p>{!locked && <Button className="student-secondary-button" variant="outlined" disabled={busy || saving || !!expired} onClick={() => lock.mutate(answer)}>{lock.isPending ? "Перевіряємо…" : "Відповісти та зафіксувати"}</Button>}</div>}
      </section>
      <nav className="student-test-navigation" aria-label="Навігація тестом">
        <Button className="student-nav-back" aria-label="Назад" disabled={index === 0 || busy} onClick={() => { void moveQuestion(index - 1); }}>←</Button>
        <span className="student-save-status" role="status">{saving ? "Збереження..." : saveError.current ? "Не вдалося зберегти" : Object.keys(pending.current).length ? "Очікуємо збереження…" : "Збережено"}</span>
        {hasNext && <Button className="student-nav-finish" disabled={busy || !!expired} onClick={() => setConfirm(true)}>Завершити тест</Button>}
        {hasNext ? <Button className="student-primary-button student-nav-next" variant="contained" disabled={busy || (attempt.answerVisibility === "Immediate" && !locked)} onClick={() => { void moveQuestion(index + 1); }}>Далі</Button> : <Button className="student-primary-button student-nav-next" variant="contained" disabled={busy || !!expired} onClick={() => setConfirm(true)}>Завершити тест</Button>}
      </nav>
      <Dialog open={reloadConfirm} onClose={() => setReloadConfirm(false)}><DialogTitle>Завантажити відповіді з сервера?</DialogTitle><DialogContent>Незбережені чернетки на цьому пристрої буде замінено збереженою версією. За потреби спочатку скопіюй свою відповідь. Інший сеанс міг змінити або завершити цю спробу.</DialogContent><DialogActions><Button onClick={() => setReloadConfirm(false)}>Повернутися</Button><Button onClick={async () => { try { await chain.current; const v = await testingApi.attempt(credentials!); receive(v); pending.current = {}; setDrafts({}); if (localKey) writeOutbox(localKey, {}, localGeneration.current); saveError.current = false; setConflict(false); setError(""); setReloadConfirm(false); } catch (e) { setError(getApiErrorMessage(e)); } }}>Використати версію сервера</Button></DialogActions></Dialog>
      <Dialog open={confirm} onClose={() => !busy && setConfirm(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 4, p: 1 } }}>
        <DialogTitle>Завершити тест?</DialogTitle>
        <DialogContent>Після завершення змінити відповіді неможливо.<div className="student-dialog-note">Без відповіді: {attempt.questions.filter(question => { const a = drafts[question.id] ?? attempt.answers.find(a => a.questionId === question.id); return !a || (question.type === "Text" ? !a.text?.trim() : !a.optionIds.length); }).length}. За них нараховується 0 балів.</div>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(false)}>Повернутися</Button>
          <Button disabled={busy} onClick={() => submit.mutate()}>{busy ? "Надсилаємо…" : "Завершити тест"}</Button>
        </DialogActions>
      </Dialog>
    </div> : null}
  </TestImageContext.Provider>;
}





