import "./adminTestEditor.css";
import { RichContentEditor } from "../../components/testing/RichContentEditor";
import {
  RichTestContent,
  contentSummary,
} from "../../components/testing/RichTestContent";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Tab,
  Tabs,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, type FieldErrors, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { testingApi } from "../../api/testingApi";
import { getDocuments } from "../../api/documentsApi";
import { ApiError, getApiErrorMessage } from "../../api/apiErrors";
import { schoolGrades } from "../../constants/grades";
import { ErrorState, LoadingState } from "../../components/StateView";
import type {
  Answer,
  Attempt,
  TestDefinition,
  TestQuestion,
  TestStatus,
} from "../../types/testing";
import { AnswerControls } from "./StudentTests";

export const questionLabels = {
  SingleChoice: "Одна правильна відповідь",
  MultipleChoice: "Кілька правильних відповідей",
  Text: "Вписати відповідь",
};
const statusLabels = {
  Draft: "Чернетка",
  Published: "Опубліковано",
  Archived: "Архів",
};
function question(): TestQuestion {
  return {
    id: crypto.randomUUID(),
    text: "",
    type: "SingleChoice",
    points: 1,
    explanation: "",
    options: [
      { id: crypto.randomUUID(), text: "", isCorrect: true },
      { id: crypto.randomUUID(), text: "", isCorrect: false },
    ],
    acceptedAnswers: [],
  };
}
const empty: TestDefinition = {
  title: "",
  description: "",
  grade: 5,
  documentId: null,
  questions: [],
  settings: {
    answerVisibility: "AfterCompletion",
    showScore: true,
    trackAnswerChanges: false,
    allowRepeats: true,
    shuffleQuestions: false,
    shuffleOptions: false,
    timeLimitMinutes: null,
    passingPercentage: null,
    availableFrom: null,
    availableTo: null,
  },
};
export function AdminTestsPage() {
  const cache = useQueryClient();
  const [remove, setRemove] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin-tests"],
    queryFn: () => testingApi.list(true),
  });
  const action = useMutation({
    mutationFn: async (r: {
      id: string;
      type: "delete" | "duplicate" | TestStatus;
    }) => {
      if (r.type === "delete") await testingApi.delete(r.id);
      else if (r.type === "duplicate") await testingApi.duplicate(r.id);
      else await testingApi.status(r.id, r.type);
    },
    onSuccess: (_, r) => {
      if (r.type === "delete") {
        cache.removeQueries({ queryKey: ["admin-test", r.id] });
        cache.removeQueries({ queryKey: ["test", r.id] });
      } else {
        void cache.invalidateQueries({ queryKey: ["admin-test", r.id] });
        void cache.invalidateQueries({ queryKey: ["test", r.id] });
      }
      setRemove(null);
      void cache.invalidateQueries({ queryKey: ["admin-tests"] });
      void cache.invalidateQueries({ queryKey: ["tests"] });
    },
  });
  return (
    <Stack gap={3}>
      <Typography variant="h4">Тести</Typography>
      <Stack direction="row" gap={2}>
        <Button component={Link} to="/admin/tests/new" variant="contained">
          Створити тест
        </Button>
        <Button component={Link} to="/admin/tests/statistics">
          Статистика тестів
        </Button>
      </Stack>
      {action.isError && (
        <Alert severity="error">{getApiErrorMessage(action.error)}</Alert>
      )}
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={getApiErrorMessage(query.error)} />
      ) : !query.data.length ? (
        <Alert severity="info">Створіть перший тест.</Alert>
      ) : (
        query.data.map((t) => (
          <Card key={t.id}>
            <CardContent>
              <Stack gap={1}>
                <Typography variant="h5">{t.title}</Typography>
                <Typography>
                  {t.grade} клас · {statusLabels[t.status]} · {t.questionCount}{" "}
                  питань · Завершених спроб: {t.completedAttempts}
                </Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button component={Link} to={`/admin/tests/${t.id}/edit`}>
                    Редагувати / Переглянути
                  </Button>
                  <Button
                    component={Link}
                    to={`/admin/tests/statistics?testId=${t.id}`}
                  >
                    Результати
                  </Button>
                  <Button
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        id: t.id,
                        type: t.status === "Published" ? "Draft" : "Published",
                      })
                    }
                  >
                    {t.status === "Published"
                      ? "Зняти з публікації"
                      : "Опублікувати"}
                  </Button>
                  <Button
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ id: t.id, type: "Archived" })
                    }
                  >
                    Архівувати
                  </Button>
                  <Button
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ id: t.id, type: "duplicate" })
                    }
                  >
                    Дублювати
                  </Button>
                  <Button
                    color="error"
                    disabled={action.isPending}
                    onClick={() => setRemove(t.id)}
                  >
                    Видалити тест
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
      <Dialog
        open={!!remove}
        onClose={() => !action.isPending && setRemove(null)}
      >
        <DialogTitle>Видалити тест?</DialogTitle>
        <DialogContent>
          Тест без спроб буде видалено назавжди. Якщо спроби існують, тест буде приховано, а історичні результати залишаться доступними у
          статистиці.
        </DialogContent>
        <DialogActions>
          <Button disabled={action.isPending} onClick={() => setRemove(null)}>
            Скасувати
          </Button>
          <Button
            color="error"
            disabled={action.isPending}
            onClick={() => action.mutate({ id: remove!, type: "delete" })}
          >
            Видалити
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
const contentSchema = z
  .array(
    z.object({
      kind: z.enum(["Text", "InlineMath", "BlockMath", "Image"]),
      text: z.string().max(4000).nullable().optional(),
      imageId: z.string().uuid().nullable().optional(),
      alignment: z.enum(["Left", "Center", "Right"]).optional(),
      description: z.string().max(500).nullable().optional(),
    }),
  )
  .max(40)
  .nullable()
  .optional();
const definitionSchema = z.object({
  title: z.string().trim().min(1, "Введіть назву").max(200, "До 200 символів"),
  description: z.string().max(2000, "Опис — до 2000 символів.").nullable(),
  grade: z.number().min(5, "Оберіть клас від 5 до 11.").max(11, "Оберіть клас від 5 до 11."),
  documentId: z.string().nullable(),
  settings: z.object({
    answerVisibility: z.enum(["Immediate", "AfterCompletion", "Never"]),
    showScore: z.boolean(),
    trackAnswerChanges: z.boolean().default(false),
    allowRepeats: z.boolean(),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    timeLimitMinutes: z.number().int("Ліміт часу має бути цілим числом.").min(1, "Ліміт часу — від 1 до 480 хвилин.").max(480, "Ліміт часу — від 1 до 480 хвилин.").nullable(),
    passingPercentage: z.number().int("Прохідний відсоток має бути цілим числом.").min(0, "Прохідний відсоток — від 0 до 100.").max(100, "Прохідний відсоток — від 0 до 100.").nullable(),
    availableFrom: z.string().nullable(),
    availableTo: z.string().nullable(),
  }),
  questions: z
    .array(
      z
        .object({
          id: z.string(),
          content: contentSchema,
          text: z.string().trim().min(1, "Введіть питання").max(4000),
          type: z.enum(["SingleChoice", "MultipleChoice", "Text"]),
          points: z.number().positive("Вкажіть додатну кількість балів.").max(1000, "Бали питання — не більше 1000."),
          explanation: z.string().max(4000).nullable(),
          options: z
            .array(
              z.object({
                id: z.string(),
                text: z.string().trim().min(1, "Введіть варіант").max(1000),
                isCorrect: z.boolean(),
                content: contentSchema,
              }),
            )
            .max(20),
          acceptedAnswers: z.array(z.string().trim().min(1, "Вкажіть прийнятну відповідь.").max(1000, "Прийнятна відповідь — до 1000 символів.")).max(20, "Дозволено до 20 прийнятних відповідей."),
        })
        .superRefine((q, c) => {
          if (
            q.type === "Text"
              ? !q.acceptedAnswers.length
              : q.options.length < 2 ||
                (q.type === "SingleChoice"
                  ? q.options.filter((o) => o.isCorrect).length !== 1
                  : q.options.filter((o) => o.isCorrect).length < 2)
          )
            c.addIssue({
              code: "custom",
              message: q.type === "Text" ? "Вкажіть прийнятну відповідь." : "Оберіть правильну відповідь відповідно до типу питання.",
              path: [q.type === "Text" ? "acceptedAnswers" : "options"],
            });
        }),
    )
    .max(100),
});
function firstEditorError(errors: unknown, path = ""): { path: string; message: string } | null {
  if (!errors || typeof errors !== "object") return null;
  if ("message" in errors && typeof errors.message === "string") return { path, message: errors.message };
  for (const [key, value] of Object.entries(errors)) {
    if (key === "ref" || key === "types") continue;
    const found = firstEditorError(value, path ? `${path}.${key}` : key); if (found) return found;
  }
  return null;
}

export function TestEditorPage() {
  const { id } = useParams();
  return <TestEditor key={id ?? "new"} />;
}
function TestEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const hydrated = useRef<string | null>(null);
  const allowSavedNavigation = useRef(false);
  const editorRoot = useRef<HTMLFormElement>(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "questions" ? "questions" : "settings";
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [validationNotice, setValidationNotice] = useState("");
  function selectTab(value: string) { const next = new URLSearchParams(params); next.set("tab", value); setParams(next); }
  function revealError(path: string, message: string) {
    selectTab(path.startsWith("questions") ? "questions" : "settings");
    const match = /^questions\.(\d+)/.exec(path);
    setValidationNotice(match ? `Питання ${Number(match[1]) + 1}: ${message}` : message);
    setFocusPath(path);
  }
  useEffect(() => {
    if (!focusPath) return;
    const frame = requestAnimationFrame(() => {
      const root = editorRoot.current; if (!root) return;
      const match = /^questions\.(\d+)/.exec(focusPath);
      const section = match ? root.querySelector<HTMLElement>(`[data-question-index="${match[1]}"]`) : root.querySelector<HTMLElement>(`[data-editor-panel="${tab}"]`);
      const names = [focusPath, focusPath.replace(/\.\d+$/, "")];
      const control = Array.from(root.querySelectorAll<HTMLElement>("[name]")).find(element => names.includes(element.getAttribute("name") ?? ""));
      const named = control?.getAttribute("type") === "hidden" ? control.closest(".MuiFormControl-root")?.querySelector<HTMLElement>('[role="combobox"]') : control;
      const editor = Array.from(root.querySelectorAll<HTMLElement>("[data-editor-field]")).find(element => element.dataset.editorField === focusPath || element.dataset.editorField === focusPath.replace(/\.root$/, ""));
      const target = named ?? editor?.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), button') ?? section?.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), [role="combobox"], button') ?? section;
      target?.scrollIntoView?.({ block: "center", behavior: "auto" }); target?.focus({ preventScroll: true }); setFocusPath(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPath, tab]);

  const [preview, setPreview] = useState(false);
  const [uploads, setUploads] = useState(0);
  const trackUpload = (busy: boolean) =>
    setUploads((n) => Math.max(0, n + (busy ? 1 : -1)));
  const [remove, setRemove] = useState<number | null>(null);
  const drag = useRef<number | null>(null);
  const form = useForm<TestDefinition>({
    resolver: zodResolver(definitionSchema),
    defaultValues: empty,
    shouldUnregister: false,
    shouldFocusError: false,
  });
  const {
    fields,
    append,
    remove: removeQuestion,
    move,
    insert,
  } = useFieldArray({
    control: form.control,
    name: "questions",
    keyName: "fieldKey",
  });
  const query = useQuery({
    queryKey: ["admin-test", id],
    queryFn: () => testingApi.admin(id!),
    enabled: !!id,
  });
  const [documentSearch, setDocumentSearch] = useState("");
  const documents = useQuery({
    queryKey: ["documents", { search: documentSearch, page: 1, pageSize: 100 }],
    queryFn: () =>
      getDocuments({ search: documentSearch, page: 1, pageSize: 100 }),
  });
  useEffect(() => {
    if (query.data && hydrated.current !== query.data.id) {
      form.reset(query.data.definition);
      hydrated.current = query.data.id;
    }
  }, [query.data, form]);
  const save = useMutation({
    mutationFn: async ({
      d,
      publish,
    }: {
      d: TestDefinition;
      publish: boolean;
    }) => {
      const t = await testingApi.save(id, d, publish);
      return t;
    },
    onSuccess: (t) => {
      form.reset(form.getValues()); setValidationNotice("");
      void cache.invalidateQueries({ queryKey: ["admin-tests"] });
      void cache.invalidateQueries({ queryKey: ["tests"] });
      void cache.invalidateQueries({ queryKey: ["test", t.id] });
      void cache.invalidateQueries({ queryKey: ["admin-test", t.id] });
      if (!id) { allowSavedNavigation.current = true; navigate(`/admin/tests/${t.id}/edit?tab=${tab}`, { replace: true }); }
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || error.status !== 400) return;
      const messages = error.problem?.errors ?? {};
      let first: { path: string; message: string } | null = null;
      for (const [name, details] of Object.entries(messages)) {
        const path = name.replace(/\[(\d+)\]/g, ".$1").split(".").map(part => part.charAt(0).toLowerCase() + part.slice(1)).join(".");
        if (!/^(title|description|grade|documentId|settings|questions)(\.|$)/.test(path) || !details[0]) continue;
        form.setError(path as FieldPath<TestDefinition>, { type: "server", message: details[0] }); first ??= { path, message: details[0] };
      }
      if (!first) { const message = Object.values(messages).flat()[0] ?? getApiErrorMessage(error); const path = /доступност|доступн/i.test(message) ? "settings.availableTo" : /матеріал/i.test(message) ? "documentId" : /назв/i.test(message) ? "title" : /питан|відповід|зображ|бал[иі]/i.test(message) ? "questions.root" : "settings.root"; form.setError(path as FieldPath<TestDefinition>, { type: "server", message }); first = { path, message }; }
      revealError(first.path, first.message);
    },
  });
  const values = form.watch();
  const disabled = save.isPending || uploads > 0;
  const isDirty = form.formState.isDirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowSavedNavigation.current && (isDirty || disabled) && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (isDirty || disabled) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, disabled]);
  const persist = (publish: boolean) => {
    if (disabled) return;
    return form.handleSubmit(d => {
      if ((publish || query.data?.status === "Published") && !d.questions.length) {
        const message = "Додайте щонайменше одне питання для публікації."; form.setError("questions", { type: "manual", message }); revealError("questions", message); return;
      }
      save.mutate({ d, publish });
    }, (errors: FieldErrors<TestDefinition>) => { const first = firstEditorError(errors); if (first) revealError(first.path, first.message); })();
  };
  if (id && query.isPending) return <LoadingState />;
  if (query.isError)
    return <ErrorState message={getApiErrorMessage(query.error)} />;
  return (
    <Stack
      gap={3}
      component="form"
      className="admin-test-editor"
      ref={editorRoot}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void persist(false);
      }}
    >
      <Stack className="admin-test-editor-header" direction={{ xs: "column", sm: "row" }} gap={2} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }}>
        <Box sx={{ minWidth: 0 }}><Typography variant="h4">{id ? "Редагування тесту" : "Новий тест"}</Typography><Typography className="admin-test-editor-title">{values.title || "Без назви"}</Typography></Box>
        <Chip label={statusLabels[query.data?.status ?? "Draft"]} variant="outlined" />
      </Stack>
      <Tabs className="admin-test-editor-tabs" value={tab} onChange={(_, value: string) => selectTab(value)} variant="fullWidth" aria-label="Розділи редактора тесту">
        <Tab id="test-editor-settings-tab" aria-controls="test-editor-settings" value="settings" label={<span>Налаштування{Object.keys(form.formState.errors).some(key => key !== "questions") && <span aria-label="Є помилки" className="admin-test-tab-error"> ●</span>}</span>} />
        <Tab id="test-editor-questions-tab" aria-controls="test-editor-questions" value="questions" label={<span>Питання ({fields.length}){form.formState.errors.questions && <span aria-label="Є помилки" className="admin-test-tab-error"> ●</span>}</span>} />
      </Tabs>
      {save.isError && (
        <Alert severity="error">{getApiErrorMessage(save.error)}</Alert>
      )}
      {save.isSuccess && <Alert severity="success">Збережено</Alert>}
      {Object.keys(form.formState.errors).length > 0 && (
        <Alert severity="error">
          {validationNotice || "Перевірте назву, питання, правильні відповіді та налаштування."}
        </Alert>
      )}
      <Box
        component="fieldset"
        disabled={disabled}
        sx={{ border: 0, p: 0, m: 0 }}
      >
        <Box role="tabpanel" id="test-editor-settings" aria-labelledby="test-editor-settings-tab" data-editor-panel="settings" hidden={tab !== "settings"}><Stack gap={3}>
          <Typography variant="h5">Загальні відомості</Typography>
          <Typography variant="body2" color="text.secondary">Статус: {statusLabels[query.data?.status ?? "Draft"]}. Публікація доступна через кнопку «Зберегти й опублікувати».</Typography>
          <TextField
            disabled={disabled}
            label="Назва"
            {...form.register("title")}
            error={!!form.formState.errors.title}
            helperText={form.formState.errors.title?.message}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            disabled={disabled}
            label="Опис"
            {...form.register("description")}
            multiline
            minRows={2}
            inputProps={{ maxLength: 2000 }}
          />
          <Controller
            name="grade"
            control={form.control}
            render={({ field }) => (
              <TextField
                disabled={disabled}
                select
                label="Клас"
                {...field}
                onChange={(e) => field.onChange(Number(e.target.value))}
              >
                {schoolGrades.map((g) => (
                  <MenuItem key={g} value={g}>
                    {g} клас
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <TextField
            disabled={disabled}
            label="Пошук матеріалу для прив’язки"
            value={documentSearch}
            onChange={(e) => setDocumentSearch(e.target.value)}
          />
          <Controller
            name="documentId"
            control={form.control}
            render={({ field }) => (
              <TextField
                disabled={disabled}
                select
                label="Пов’язаний матеріал"
                name={field.name}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              >
                <MenuItem value="">Без матеріалу</MenuItem>
                {values.documentId &&
                  !documents.data?.items.some(
                    (d) => d.id === values.documentId,
                  ) && (
                    <MenuItem value={values.documentId}>
                      Поточний матеріал
                    </MenuItem>
                  )}
                {documents.data?.items.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.title}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Typography variant="h5">Налаштування</Typography>
          <Controller
            name="settings.answerVisibility"
            control={form.control}
            render={({ field }) => (
              <TextField
                disabled={disabled}
                select
                label="Показувати правильні відповіді"
                {...field}
              >
                <MenuItem value="Immediate">Одразу після відповіді</MenuItem>
                <MenuItem value="AfterCompletion">
                  Після завершення тесту
                </MenuItem>
                <MenuItem value="Never">Не показувати</MenuItem>
              </TextField>
            )}
          />
          {(
            [
              ["showScore", "Показувати підсумковий бал"],
              ["trackAnswerChanges", "Відстежувати зміни відповідей"],
              ["allowRepeats", "Дозволити повторне проходження"],
              ["shuffleQuestions", "Перемішувати питання"],
              ["shuffleOptions", "Перемішувати варіанти"],
            ] as const
          ).map(([key, label]) => (
            <Controller
              key={key}
              name={`settings.${key}`}
              control={form.control}
              render={({ field }) => (
                <FormControlLabel
                  label={label}
                  control={
                    <Checkbox
                      disabled={disabled}
                      checked={field.value ?? false}
                      onChange={(_, checked) => field.onChange(checked)}
                    />
                  }
                />
              )}
            />
          ))}
          <Typography variant="body2" color="text.secondary">Зберігати історію змін відповідей учня до завершення тесту для подальшого аналізу.</Typography>
          <Typography variant="h5">Час і доступність</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            {(
              [
                ["timeLimitMinutes", "Ліміт часу (хв, необов’язково)"],
                ["passingPercentage", "Прохідний відсоток (необов’язково)"],
              ] as const
            ).map(([key, label]) => (
              <Controller
                key={key}
                name={`settings.${key}`}
                control={form.control}
                render={({ field }) => (
                  <TextField
                    disabled={disabled}
                    type="number"
                    label={label}
                    name={field.name}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    fullWidth
                  />
                )}
              />
            ))}
          </Stack>
          {(
            [
              ["availableFrom", "Доступний з"],
              ["availableTo", "Доступний до"],
            ] as const
          ).map(([key, label]) => (
            <Controller
              key={key}
              name={`settings.${key}`}
              control={form.control}
              render={({ field }) => (
                <TextField
                  disabled={disabled}
                  type="datetime-local"
                  label={label}
                  name={field.name}
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={field.value ? localDateTime(field.value) : ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    )
                  }
                />
              )}
            />
          ))}
        </Stack></Box>
        <Box role="tabpanel" id="test-editor-questions" aria-labelledby="test-editor-questions-tab" data-editor-panel="questions" hidden={tab !== "questions"}><Stack gap={3}>
          <Typography variant="h5">Питання · {fields.length}/100</Typography>
          {!fields.length && <Alert severity="info">Додайте перше питання. Чернетку можна зберегти без питань; для публікації потрібне щонайменше одне повністю налаштоване питання.</Alert>}
          <Typography variant="body2">
            Перетягніть картку для зміни порядку або скористайтеся кнопками
            «Вище» / «Нижче».
          </Typography>
          {fields.map((f, i) => {
            const q = values.questions[i];
            if (!q) return null;
            return (
              <Card
                key={f.fieldKey}
                data-question-index={i}
                tabIndex={-1}
                className="admin-test-question-card"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!disabled && drag.current !== null) move(drag.current, i);
                  drag.current = null;
                }}
              >
                <CardContent>
                  <Stack gap={2}>
                    <Box
                      draggable={!disabled}
                      onDragStart={() => {
                        drag.current = i;
                      }}
                      onDragEnd={() => {
                        drag.current = null;
                      }}
                      sx={{ cursor: "grab" }}
                    >
                      <Typography variant="h6">↕ Питання {i + 1}</Typography>
                    </Box>
                    {form.formState.errors.questions?.[i] && <Alert severity="error">Питання {i + 1}: {firstEditorError(form.formState.errors.questions[i])?.message || "Перевірте дані питання."}</Alert>}
                    <RichContentEditor
                      fieldPath={`questions.${i}.text`}
                      label="Текст питання"
                      text={q.text}
                      content={q.content}
                      disabled={disabled}
                      onBusyChange={trackUpload}
                      onTextChange={(text) =>
                        form.setValue(`questions.${i}.text`, text, {
                          shouldDirty: true,
                        })
                      }
                      onContentChange={(content) => {
                        form.setValue(`questions.${i}.content`, content, {
                          shouldDirty: true,
                        });
                        form.setValue(
                          `questions.${i}.text`,
                          contentSummary(content),
                          { shouldDirty: true },
                        );
                      }}
                    />
                    <Controller
                      name={`questions.${i}.type`}
                      control={form.control}
                      render={({ field }) => (
                        <TextField
                          disabled={disabled}
                          select
                          label="Тип питання"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            form.setValue(
                              `questions.${i}.options`,
                              e.target.value === "Text"
                                ? []
                                : question().options,
                              { shouldDirty: true },
                            );
                            form.setValue(
                              `questions.${i}.acceptedAnswers`,
                              e.target.value === "Text" ? [""] : [],
                              { shouldDirty: true },
                            );
                          }}
                        >
                          {Object.entries(questionLabels).map(([v, label]) => (
                            <MenuItem key={v} value={v}>
                              {label}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                    />
                    <TextField
                      disabled={disabled}
                      label="Бали"
                      type="number"
                      inputProps={{ min: 0.01, max: 1000, step: 0.01 }}
                      {...form.register(`questions.${i}.points`, {
                        valueAsNumber: true,
                      })}
                    />
                    {q.type === "Text" ? (
                      <TextField
                        disabled={disabled}
                        label="Прийнятні відповіді (кожна з нового рядка)"
                        name={`questions.${i}.acceptedAnswers`}
                        multiline
                        minRows={2}
                        value={q.acceptedAnswers.join("\n")}
                        helperText="Регістр і пробіли на початку та в кінці не враховуються. Інші варіанти додайте явно."
                        onChange={(e) =>
                          form.setValue(
                            `questions.${i}.acceptedAnswers`,
                            e.target.value.split("\n"),
                            { shouldDirty: true },
                          )
                        }
                      />
                    ) : (
                      <Stack gap={1} data-editor-field={`questions.${i}.options`}>
                        {q.options.map((o, j) => (
                          <Stack
                            key={o.id}
                            className="admin-test-option-row"
                            direction="row"
                            alignItems="center"
                            gap={1}
                          >
                            <Checkbox
                              disabled={disabled}
                              inputProps={{
                                "aria-label": `Правильний варіант ${j + 1}`,
                              }}
                              checked={o.isCorrect}
                              onChange={(_, checked) =>
                                form.setValue(
                                  `questions.${i}.options`,
                                  q.options.map((v, k) => ({
                                    ...v,
                                    isCorrect:
                                      k === j
                                        ? checked
                                        : q.type === "SingleChoice"
                                          ? false
                                          : v.isCorrect,
                                  })),
                                  { shouldDirty: true },
                                )
                              }
                            />
                            <RichContentEditor
                              fieldPath={`questions.${i}.options.${j}.text`}
                              label={`Варіант ${j + 1}`}
                              text={o.text}
                              content={o.content}
                              disabled={disabled}
                              onBusyChange={trackUpload}
                              onTextChange={(text) =>
                                form.setValue(
                                  `questions.${i}.options.${j}.text`,
                                  text,
                                  { shouldDirty: true },
                                )
                              }
                              onContentChange={(content) => {
                                form.setValue(
                                  `questions.${i}.options.${j}.content`,
                                  content,
                                  { shouldDirty: true },
                                );
                                form.setValue(
                                  `questions.${i}.options.${j}.text`,
                                  contentSummary(content, 1000),
                                  { shouldDirty: true },
                                );
                              }}
                            />
                            <Button
                              aria-label={`Видалити варіант ${j + 1}`}
                              onClick={() =>
                                form.setValue(
                                  `questions.${i}.options`,
                                  q.options.filter((_, k) => k !== j),
                                  { shouldDirty: true },
                                )
                              }
                            >
                              ×
                            </Button>
                          </Stack>
                        ))}
                        <Button
                          disabled={q.options.length >= 20}
                          onClick={() =>
                            form.setValue(
                              `questions.${i}.options`,
                              [
                                ...q.options,
                                {
                                  id: crypto.randomUUID(),
                                  text: "",
                                  isCorrect: false,
                                },
                              ],
                              { shouldDirty: true },
                            )
                          }
                        >
                          Додати варіант
                        </Button>
                      </Stack>
                    )}
                    <TextField
                      disabled={disabled}
                      label="Пояснення (необов’язково)"
                      multiline
                      {...form.register(`questions.${i}.explanation`)}
                    />
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      <Button disabled={i === 0} onClick={() => move(i, i - 1)}>
                        Вище
                      </Button>
                      <Button
                        disabled={i === fields.length - 1}
                        onClick={() => move(i, i + 1)}
                      >
                        Нижче
                      </Button>
                      <Button
                        disabled={fields.length >= 100}
                        onClick={() =>
                          insert(i + 1, {
                            ...structuredClone(q),
                            id: crypto.randomUUID(),
                            options: q.options.map((o) => ({
                              ...o,
                              id: crypto.randomUUID(),
                            })),
                          })
                        }
                      >
                        Дублювати питання
                      </Button>
                      <Button color="error" onClick={() => setRemove(i)}>
                        Видалити питання
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
          <Button
            disabled={fields.length >= 100}
            onClick={() => append(question())}
          >
            Додати питання
          </Button>
        </Stack></Box>
      </Box>
      <Stack
        className="admin-test-editor-actions"
        direction="row"
        gap={2}
        flexWrap="wrap"
        sx={{
          position: "sticky",
          bottom: 0,
          bgcolor: "background.paper",
          py: 2,
          zIndex: 2,
        }}
      >
        <Button type="submit" variant="contained" disabled={disabled}>
          {disabled ? "Зберігаємо…" : "Зберегти"}
        </Button>
        <Button
          disabled={disabled}
          onClick={() => {
            void persist(true);
          }}
        >
          Зберегти й опублікувати
        </Button>
        <Button disabled={disabled} onClick={() => setPreview(true)}>
          Переглянути як учень
        </Button>
        <Button component={Link} to="/admin/tests">
          До списку
        </Button>
      </Stack>
      <Dialog open={blocker.state === "blocked"} onClose={() => blocker.reset?.()}><DialogTitle>Вийти без збереження?</DialogTitle><DialogContent>Незбережені зміни тесту буде втрачено. Поверніться до редактора, щоб зберегти їх.{disabled && " Збереження або завантаження зображення ще триває."}</DialogContent><DialogActions><Button onClick={() => blocker.reset?.()}>Залишитися</Button><Button color="warning" onClick={() => blocker.proceed?.()}>Вийти</Button></DialogActions></Dialog>
      <Dialog open={remove !== null} onClose={() => setRemove(null)}>
        <DialogTitle>Видалити питання?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setRemove(null)}>Скасувати</Button>
          <Button
            color="error"
            onClick={() => {
              removeQuestion(remove!);
              setRemove(null);
            }}
          >
            Видалити
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={preview}
        onClose={() => setPreview(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Перегляд як учень · {values.title}</DialogTitle>
        <DialogContent>
          <Preview definition={values} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(false)}>Закрити</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
function localDateTime(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function Preview({ definition }: { definition: TestDefinition }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const q = definition.questions[index];
  return (
    <Stack gap={3}>
      <Alert severity="info">
        Попередній перегляд. Спроба та результати не записуються.
      </Alert>
      {q ? (
        <>
          <Typography>
            Питання {index + 1} з {definition.questions.length}
          </Typography>
          <RichTestContent text={q.text} content={q.content} />
          <AnswerControls
            question={q as Attempt["questions"][number]}
            answer={
              answers[q.id] ?? { questionId: q.id, optionIds: [], text: null }
            }
            disabled={false}
            onChange={(a) => setAnswers((v) => ({ ...v, [q.id]: a }))}
          />
          <Stack direction="row">
            <Button disabled={!index} onClick={() => setIndex((i) => i - 1)}>
              Назад
            </Button>
            <Button
              disabled={index >= definition.questions.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Далі
            </Button>
          </Stack>
        </>
      ) : (
        <Typography>Додайте питання.</Typography>
      )}
    </Stack>
  );
}

