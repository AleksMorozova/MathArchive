import { AttemptInteractionHistory } from "../../components/testing/AttemptInteractionHistory";
import { StudentStatisticsFilter, StudentStatisticsPanel } from "./StudentStatistics";
import { RichTestContent } from "../../components/testing/RichTestContent";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { testingApi } from "../../api/testingApi";
import { getApiErrorMessage } from "../../api/apiErrors";
import { ErrorState, LoadingState } from "../../components/StateView";
import { analyticsBoundaries, presetDates } from "../../utils/analyticsDates";
import { schoolGrades } from "../../constants/grades";
import { AttemptResult } from "./StudentTests";
const status = {
  InProgress: "Триває",
  Completed: "Завершено",
  Expired: "Час вичерпано",
};
export function TestStatisticsPage() {
  const [url] = useSearchParams();
  const [testId, setTest] = useState(url.get("testId") ?? "");
  const [studentId, setStudent] = useState(url.get("studentId") ?? "");
  const [grade, setGrade] = useState("");
  const [search, setSearch] = useState("");
  const [completion, setCompletion] = useState("");
  const [dates, setDates] = useState(() => presetDates(30));
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("dateDesc");
  const period = analyticsBoundaries(dates.from, dates.to);
  const filter = {
    ...period,
    studentId: studentId || undefined,
    testId: testId || undefined,
    grade: grade || undefined,
    search: search || undefined,
    status: completion || undefined,
    sort,
    page,
    pageSize: 20,
  };
  const tests = useQuery({
    queryKey: ["admin-tests"],
    queryFn: () => testingApi.list(true),
  });
  const overview = useQuery({
    queryKey: ["testing-overview", filter],
    queryFn: () => testingApi.overview(filter),
    enabled: !!period,
  });
  const attempts = useQuery({
    queryKey: ["testing-attempts", filter],
    queryFn: () => testingApi.attempts(filter),
    enabled: !!period,
  });
  const questions = useQuery({
    queryKey: ["testing-questions", testId, filter],
    queryFn: () => testingApi.questions(testId, filter),
    enabled: !!testId && !!period,
  });
  return (
    <Stack gap={3}>
      <Typography variant="h4">Статистика тестів</Typography>
      <Button component={Link} to="/admin/tests">
        До тестів
      </Button>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {[
          [1, "Сьогодні"],
          [7, "7 днів"],
          [30, "30 днів"],
        ].map(([days, label]) => (
          <Button
            key={days}
            onClick={() => {
              setDates(presetDates(Number(days)));
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
      </Stack>
      <Typography variant="subtitle2">Власний період</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
        <TextField
          label="Від"
          type="date"
          value={dates.from}
          slotProps={{ inputLabel: { shrink: true } }}
          onChange={(e) => {
            setDates((d) => ({ ...d, from: e.target.value }));
            setPage(1);
          }}
        />
        <TextField
          label="До (включно)"
          type="date"
          value={dates.to}
          slotProps={{ inputLabel: { shrink: true } }}
          onChange={(e) => {
            setDates((d) => ({ ...d, to: e.target.value }));
            setPage(1);
          }}
        />
      </Stack>
      <StudentStatisticsFilter value={studentId} onChange={id => { setStudent(id); setPage(1); }} />
      {!period && <Alert severity="error">Оберіть коректний період.</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} gap={2}>
        <TextField
          fullWidth
          select
          label="Тест"
          value={testId}
          onChange={(e) => {
            setTest(e.target.value);
            setPage(1);
          }}
        >
          <MenuItem value="">Усі тести</MenuItem>
          {testId && !tests.data?.some((t) => t.id === testId) && (
            <MenuItem value={testId}>Історичний тест</MenuItem>
          )}
          {tests.data?.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.title}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth
          select
          label="Клас"
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value);
            setPage(1);
          }}
        >
          <MenuItem value="">Усі класи</MenuItem>
          {schoolGrades.map((g) => (
            <MenuItem key={g} value={g}>
              {g}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth
          label="Ім’я або прізвище"
          value={search}
          inputProps={{ maxLength: 200 }}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          fullWidth
          select
          label="Стан спроби"
          value={completion}
          onChange={(e) => {
            setCompletion(e.target.value);
            setPage(1);
          }}
        >
          <MenuItem value="">Усі стани</MenuItem>
          {Object.entries(status).map(([v, label]) => (
            <MenuItem key={v} value={v}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Typography variant="h5">Огляд</Typography>
      {overview.isError ? (
        <ErrorState message={getApiErrorMessage(overview.error)} />
      ) : overview.data ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: 2,
          }}
        >
          {[
            [
              "Опублікованих тестів, створених за період",
              overview.data.publishedTests,
            ],
            ["Завершених спроб", overview.data.completedAttempts],
            
            ["Середній бал", overview.data.averagePoints.toFixed(2)],
            [
              "Середній відсоток",
              `${overview.data.averagePercentage.toFixed(2)}%`,
            ],
            [
              "Склали / Не склали",
              `${overview.data.passed} / ${overview.data.failed}`,
            ],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent>
                <Typography color="text.secondary">{label}</Typography>
                <Typography variant="h4">{value}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        period && <LoadingState />
      )}
      <Typography variant="body2">
        Нові спроби пов’язані з обліковим записом учня. Давні анонімні спроби не визначають
        унікальних учнів. Дати завершених спроб — за часом завершення,
        незавершених — за часом початку.
      </Typography>
      <Typography variant="h5">Результати учнів</Typography>
      <TextField
        select
        label="Сортування"
        value={sort}
        onChange={(e) => {
          setSort(e.target.value);
          setPage(1);
        }}
      >
        {[
          ["dateDesc", "Спочатку нові"],
          ["dateAsc", "Спочатку давні"],
          ["scoreDesc", "Вищий результат"],
          ["scoreAsc", "Нижчий результат"],
          ["name", "За прізвищем"],
        ].map(([v, label]) => (
          <MenuItem key={v} value={v}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      {attempts.isError ? (
        <ErrorState message={getApiErrorMessage(attempts.error)} />
      ) : attempts.data ? (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    "Учень",
                    "Клас",
                    "Тест",
                    "Завершено",
                    "Бали",
                    "%",
                    "Стан / результат",
                    "Тривалість",
                  ].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {attempts.data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Button
                        component={Link}
                        to={`/admin/tests/attempts/${a.id}`}
                      >
                        {a.lastName} {a.firstName}
                      </Button>
                    </TableCell>
                    <TableCell>{a.grade}</TableCell>
                    <TableCell>
                      {a.testTitle}
                      <Button
                        size="small"
                        onClick={() => {
                          setTest(a.testId);
                          setPage(1);
                        }}
                      >
                        Аналітика
                      </Button>
                    </TableCell>
                    <TableCell>
                      {a.completedAt
                        ? new Date(a.completedAt).toLocaleString("uk-UA")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {a.earnedPoints} / {a.maximumPoints}
                    </TableCell>
                    <TableCell>{a.percentage}%</TableCell>
                    <TableCell>
                      {status[a.status]}
                      {a.passed === null
                        ? ""
                        : a.passed
                          ? " · Складено"
                          : " · Не складено"}
                    </TableCell>
                    <TableCell>{Math.round(a.durationSeconds)} с</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!attempts.data.items.length && (
            <Alert severity="info">За обраними фільтрами спроб немає.</Alert>
          )}
          <Pagination
            count={attempts.data.totalPages}
            page={page}
            onChange={(_, p) => setPage(p)}
          />
        </>
      ) : (
        period && <LoadingState />
      )}
      {period && <StudentStatisticsPanel filter={filter} />}
      <Typography variant="h5">Аналітика питань</Typography>
      {!testId ? (
        <Alert severity="info">Оберіть тест для аналітики питань.</Alert>
      ) : questions.isError ? (
        <ErrorState message={getApiErrorMessage(questions.error)} />
      ) : questions.isPending ? (
        <LoadingState />
      ) : !questions.data.length ? (
        <Alert severity="info">Немає завершених спроб за цей період.</Alert>
      ) : (
        questions.data.map((q, i) => (
          <Card key={`${q.questionId}-${i}`}>
            <CardContent>
              <Stack gap={1}>
                <RichTestContent text={q.text} content={q.content} />
                <Typography>
                  Відповідей: {q.submitted} · Правильних: {q.correct} ·
                  Неправильних: {q.incorrect} · Без відповіді: {q.unanswered} ·
                  Успішність: {q.correctPercentage}%
                </Typography>
                <Typography variant="subtitle2">Розподіл відповідей</Typography>
                {q.distribution.map((v, n) => (
                  <Box key={v.optionId ?? n}>
                    <RichTestContent text={v.answer} content={v.content} />
                    <Typography>Обрали: {v.count}</Typography>
                  </Box>
                ))}
                <Typography variant="subtitle2">
                  Найчастіші помилкові відповіді
                </Typography>
                {q.wrongAnswers.map((v, n) => (
                  <Box key={v.optionId ?? n}>
                    <RichTestContent text={v.answer} content={v.content} />
                    <Typography>Обрали: {v.count}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
export function AdminAttemptPage() {
  const { id = "" } = useParams();
  const query = useQuery({
    queryKey: ["admin-attempt", id],
    queryFn: () => testingApi.detail(id),
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return <ErrorState message={getApiErrorMessage(query.error)} />;
  const a = query.data;
  return (
    <Stack gap={3}>
      <Button component={Link} to="/admin/tests/statistics">
        До статистики
      </Button>
      <Typography variant="h4">
        {a.lastName} {a.firstName} · {a.grade} клас
      </Typography>
      <Typography variant="h5">{a.testTitle}</Typography>
      <Typography>
        Початок: {new Date(a.view.startedAt).toLocaleString("uk-UA")} ·
        Завершення:{" "}
        {a.view.completedAt
          ? new Date(a.view.completedAt).toLocaleString("uk-UA")
          : "Триває"}{" "}
        · Тривалість:{" "}
        {Math.round(
          (new Date(a.view.completedAt ?? Date.now()).getTime() -
            new Date(a.view.startedAt).getTime()) /
            1000,
        )}{" "}
        с
      </Typography>
      {a.view.status === "InProgress" && (
        <Alert severity="info">
          Спроба ще триває. Нижче наведено поточні відповіді.
        </Alert>
      )}
      <AttemptResult attempt={a.view} />
      <AttemptInteractionHistory attempt={a.view} events={a.interactions ?? []} limited={a.interactionLimitReached ?? false} />
    </Stack>
  );
}


