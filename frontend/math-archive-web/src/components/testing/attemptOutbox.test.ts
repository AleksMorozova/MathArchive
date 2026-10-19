import { beforeEach, expect, it } from "vitest";
import type { Attempt } from "../../types/testing";
import { outboxKey, outboxGeneration, readOutbox, writeOutbox, clearStudentOutboxes } from "./attemptOutbox";
const attempt = { questions: [{ id: "q", options: [{ id: "a" }] }], answers: [] } as unknown as Attempt;
const draft = { questionId: "q", optionIds: ["a"], text: null, revision: 0, operationId: "operation" };
beforeEach(() => localStorage.clear());
it("scopes recovery to the student and attempt and rejects unknown question/option content", () => {
  const key = outboxKey("student-a", "attempt"); writeOutbox(key, { q: draft });
  expect(readOutbox(outboxKey("student-b", "attempt"), attempt)).toEqual({}); expect(readOutbox(key, attempt)).toEqual({ q: draft });
  expect(readOutbox(key, { ...attempt, questions: [] })).toEqual({});
  writeOutbox(key, { q: { ...draft, optionIds: ["foreign-option"] } }); expect(readOutbox(key, attempt)).toEqual({});
});
it("does not replay acknowledged or locked drafts and expires local copies after seven days", () => {
  const key = outboxKey("s", "a"); writeOutbox(key, { q: draft });
  expect(readOutbox(key, { ...attempt, answers: [{ ...draft, locked: true }] })).toEqual({});
  expect(readOutbox(key, { ...attempt, answers: [draft] })).toEqual({});
  localStorage.setItem(key, JSON.stringify({ savedAt: Date.now() - 8 * 86400000, answers: { q: draft } })); expect(readOutbox(key, attempt)).toEqual({}); expect(localStorage.getItem(key)).toBeNull();
});
it("bounds draft copies and clears them on logout without deleting other application storage", () => {
  for (let i = 0; i < 8; i++) writeOutbox(outboxKey("student", String(i)), { q: draft }); expect(localStorage.length).toBe(5);
  localStorage.setItem("other-setting", "preserved"); clearStudentOutboxes(); expect(localStorage.length).toBe(1); expect(localStorage.getItem("other-setting")).toBe("preserved");
});

it("does not recreate private drafts when an older save finishes after logout", () => { const generation = outboxGeneration(); clearStudentOutboxes(); writeOutbox(outboxKey("student", "attempt"), { q: draft }, generation); expect(localStorage.length).toBe(0); });
