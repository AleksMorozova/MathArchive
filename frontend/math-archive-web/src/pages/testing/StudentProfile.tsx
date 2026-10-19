import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { studentApi } from "../../api/studentApi";
import { getApiErrorMessage } from "../../api/apiErrors";
import { StudentArea } from "./StudentAccount";
import { StudentTestLayout } from "../../components/testing/StudentExperience";
import { StudentGoogleButton } from "../../components/testing/StudentGoogleButton";
import { studentSessionKey, useStudentSession } from "../../components/testing/useStudentSession";
import { ErrorState, LoadingState } from "../../components/StateView";
import { schoolGrades } from "../../constants/grades";

const profileSchema = z.object({ firstName: z.string().trim().min(1, "Введіть ім’я").max(100), lastName: z.string().trim().min(1, "Введіть прізвище").max(100), grade: z.number().int().min(5).max(11) });
export function StudentGoogleProfilePage() {
  const cache = useQueryClient(); const navigate = useNavigate(); const [params] = useSearchParams(); const hydrated = useRef(false);
  const pending = useQuery({ queryKey: ["student", "google-pending"], queryFn: ({ signal }) => studentApi.googlePending(signal), retry: false, staleTime: 0 });
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { firstName: "", lastName: "", grade: 5 } });
  useEffect(() => { if (pending.data && !pending.isFetching && !hydrated.current) { hydrated.current = true; form.reset({ ...pending.data, grade: 5 }); } }, [pending.data, pending.isFetching, form]);
  const complete = useMutation({ mutationFn: studentApi.googleComplete, onSuccess: async student => {
    await cache.cancelQueries({ queryKey: studentSessionKey }); await cache.cancelQueries({ queryKey: ["student"] }); cache.removeQueries({ queryKey: ["student"] });
    cache.setQueryData(studentSessionKey, student);
    const path = params.get("returnTo"); navigate(path && /^\/(tests(?:\/|$)|student(?:\/|$))/.test(path) ? path : "/student", { replace: true });
  } });
  return <StudentTestLayout><Stack className="student-welcome-form student-enter" sx={{ maxWidth: 560, mx: "auto" }} gap={3}>
    <Typography component="h1" variant="h4">Познайомимося?</Typography><Typography>Перевір своє ім’я та прізвище й обери клас. Результати тестів зберігатимуться у твоєму профілі.</Typography>
    {pending.isPending ? <LoadingState /> : pending.isError ? <><ErrorState message={getApiErrorMessage(pending.error)} /><Button component={Link} to="/student/login">Повернутися до входу</Button></> : <Stack component="form" onSubmit={form.handleSubmit(v => complete.mutate(v))} gap={2}>
      <TextField label="Ім'я" autoComplete="given-name" {...form.register("firstName")} error={!!form.formState.errors.firstName} helperText={form.formState.errors.firstName?.message} />
      <TextField label="Прізвище" autoComplete="family-name" {...form.register("lastName")} error={!!form.formState.errors.lastName} helperText={form.formState.errors.lastName?.message} />
      <Controller name="grade" control={form.control} render={({ field }) => <TextField select label="Клас" {...field} onChange={e => field.onChange(Number(e.target.value))}>{schoolGrades.map(g => <MenuItem key={g} value={g}>{g} клас</MenuItem>)}</TextField>} />
      {complete.isError && <Alert severity="error">{getApiErrorMessage(complete.error)}</Alert>}
      <Button type="submit" variant="contained" className="student-primary-button" disabled={complete.isPending}>{complete.isPending ? "Зберігаємо…" : "До моїх тестів"}</Button>
    </Stack>}
  </Stack></StudentTestLayout>;
}
export function StudentProfilePage() {
  const session = useStudentSession(); const cache = useQueryClient(); const [linked, setLinked] = useState(false); const s = session.data;
  return <StudentArea>{s && <Stack className="student-welcome-form student-enter" sx={{ maxWidth: 640, mx: "auto" }} gap={3}>
    <Typography component="h1" variant="h4">Мій профіль</Typography><Typography variant="h6">{s.firstName} {s.lastName} · {s.grade} клас</Typography>
    <Typography>Способи входу: {(s.authenticationMethods ?? ["PIN"]).join(" · ")}</Typography>
    {linked && <Alert severity="success">Google підключено. Твоя історія та результати збережені.</Alert>}
    {!s.authenticationMethods?.includes("Google") && <><Typography>Підключи свій Google-акаунт, щоб входити також через Google. PIN-код продовжить працювати.</Typography><StudentGoogleButton link onSuccess={async result => {
      if (result.requiresProfile || !result.student) throw new Error("Не вдалося підключити Google. Увійдіть у профіль ще раз.");
      await cache.cancelQueries({ queryKey: studentSessionKey }); cache.setQueryData(studentSessionKey, result.student); setLinked(true);
    }} /></>}
    <Typography variant="body2">Потрібно відновити або встановити PIN-код? Звернися до вчителя особисто.</Typography>
    <Stack direction="row" gap={2}><Button component={Link} to="/student">Мої тести</Button><Button component={Link} to="/student?tab=history">Історія проходжень</Button></Stack>
  </Stack>}</StudentArea>;
}
