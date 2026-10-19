import type { Answer, Attempt } from "../../types/testing";
let generation = 0;
export function outboxGeneration() { return generation; }
const prefix = "matharchive-answer-drafts:";
export function outboxKey(studentId: string, attemptId: string) { return prefix + studentId + ":" + attemptId; }
export function readOutbox(key: string, attempt: Attempt): Record<string, Answer> {
  try {
    const envelope = JSON.parse(localStorage.getItem(key) ?? "null") as { savedAt?: number; answers?: unknown } | null;
    if (!envelope || typeof envelope.savedAt !== "number" || Date.now() - envelope.savedAt > 7 * 86400000) { localStorage.removeItem(key); return {}; }
    const raw = envelope.answers;
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 100) return {};
    const restored: Record<string, Answer> = {};
    for (const item of Object.values(raw)) {
      if (!item || typeof item !== "object") continue;
      const answer = item as Answer; const question = attempt.questions.find(q => q.id === answer.questionId); const saved = attempt.answers.find(a => a.questionId === answer.questionId);
      if (!question || saved?.locked || saved?.operationId === answer.operationId || !answer.operationId || !Number.isSafeInteger(answer.revision) || !Array.isArray(answer.optionIds) || answer.optionIds.length > 20 || !answer.optionIds.every(id => question.options.some(o => o.id === id)) || (answer.text !== null && (typeof answer.text !== "string" || answer.text.length > 1000))) continue;
      restored[answer.questionId] = answer;
    }
    return restored;
  } catch { return {}; }
}
export function writeOutbox(key: string, answers: Record<string, Answer>, expectedGeneration = generation) {
  if (expectedGeneration !== generation) return true;
  try {
    if (!Object.keys(answers).length) { localStorage.removeItem(key); return true; }
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix) && k !== key);
    while (keys.length >= 5) localStorage.removeItem(keys.shift()!);
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), answers })); return true;
  } catch { return false; }
}
export function clearStudentOutboxes() { generation++; try { for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } }
