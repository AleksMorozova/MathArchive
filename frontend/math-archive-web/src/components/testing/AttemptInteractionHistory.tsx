import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AnswerInteraction, Attempt } from "../../types/testing";
import { testingApi } from "../../api/testingApi";
import { getApiErrorMessage } from "../../api/apiErrors";

export function AttemptInteractionHistory({ attempt, events, limited }: { attempt: Attempt; events: AnswerInteraction[]; limited: boolean }) {
  const [confirm, setConfirm] = useState(false); const cache = useQueryClient();
  const clear = useMutation({ mutationFn: () => testingApi.clearInteractions(attempt.id), onSuccess: () => { setConfirm(false); void cache.invalidateQueries({ queryKey: ["admin-attempt", attempt.id] }); } });
  const changed = events.filter(e => (e.eventType === "OptionsChanged" || e.eventType === "TextRevised") && e.revision > 1);
  const revisited = new Set(events.filter(e => e.eventType === "QuestionRevisited").map(e => e.questionId));
  const frequent = attempt.questions.map((q, index) => ({ index, count: changed.filter(e => e.questionId === q.id).length })).filter(q => q.count).sort((a, b) => b.count - a.count);
  function describe(event: AnswerInteraction) {
    const q = attempt.questions.find(q => q.id === event.questionId);
    const letters = (ids: string[]) => ids.map(id => String.fromCharCode(65 + (q?.options.findIndex(o => o.id === id) ?? -1))).join(", ");
    switch (event.eventType) {
      case "OptionsChanged": return [event.selected.length ? "Обрано: " + letters(event.selected) : "", event.deselected.length ? "Скасовано вибір: " + letters(event.deselected) : ""].filter(Boolean).join(" · ");
      case "TextRevised": return `Текст оновлено · версія ${event.revision} · ${event.textLength ?? 0} символів`;
      case "AnswerConfirmed": return `Відповідь підтверджено · ${Math.max(0, Math.round((Date.parse(event.serverTimestamp) - Date.parse(attempt.startedAt)) / 1000))} с від початку спроби`;
      case "QuestionRevisited": return "Повторний перегляд питання";
      default: return "Перегляд питання";
    }
  }
  return <Stack gap={2} component="section" aria-label="Історія вибору відповідей">
    <Typography variant="h5">Історія вибору відповідей</Typography>
    <Typography variant="body2">Це спостереження за збереженими діями, а не висновки про знання чи впевненість учня. Швидкі зміни до автозбереження можуть об’єднуватися. Текст попередніх редакцій не зберігається.</Typography>
    {!attempt.trackAnswerChanges ? <Alert severity="info">Відстеження було вимкнено для цієї спроби.</Alert> : !events.length ? <Alert severity="info">Збережених взаємодій немає або строк їх зберігання завершився.</Alert> : <>
      <Typography>Змін після першої відповіді: {changed.length} · Повторно переглянутих питань: {revisited.size}</Typography>
      {!!frequent.length && <Typography>Часті зміни: {frequent.slice(0, 5).map(q => `питання ${q.index + 1} — ${q.count}`).join("; ")}</Typography>}
      <ol>{[...events].sort((a, b) => a.sequence - b.sequence).map(event => <li key={event.sequence}><Typography variant="body2"><strong>Питання {attempt.questions.findIndex(q => q.id === event.questionId) + 1}</strong> · {new Date(event.serverTimestamp).toLocaleString("uk-UA")} — {describe(event)}{event.afterRevisit ? " · після повернення до питання" : ""}</Typography></li>)}</ol>
      <Button color="warning" onClick={() => setConfirm(true)} sx={{ alignSelf: "flex-start" }}>Видалити історію взаємодій</Button>
    </>}
    {limited && <Alert severity="info">Історія обмежена або її подальше збирання зупинено. Відповіді та результати збережені окремо.</Alert>}
    <Dialog open={confirm} onClose={() => !clear.isPending && setConfirm(false)}><DialogTitle>Видалити історію взаємодій?</DialogTitle><DialogContent>Це видалить лише допоміжні події та припинить їх подальше збирання для цієї спроби. Відповіді, оцінка та історія проходжень збережуться.{clear.isError && <Alert severity="error">{getApiErrorMessage(clear.error)}</Alert>}</DialogContent><DialogActions><Button disabled={clear.isPending} onClick={() => setConfirm(false)}>Скасувати</Button><Button disabled={clear.isPending} onClick={() => clear.mutate()}>Видалити</Button></DialogActions></Dialog>
  </Stack>;
}
