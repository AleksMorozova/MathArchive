import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { Attempt, AnswerInteraction } from "../../types/testing";
import { AttemptInteractionHistory } from "./AttemptInteractionHistory";
import { testingApi } from "../../api/testingApi";
vi.mock("../../api/testingApi", () => ({ testingApi: { clearInteractions: vi.fn() } }));
const attempt = { id: "attempt", startedAt: "2026-10-17T10:00:00Z", trackAnswerChanges: true, questions: [{ id: "q", options: [{ id: "a" }, { id: "b" }] }] } as unknown as Attempt;
const events: AnswerInteraction[] = [
  { sequence: 1, questionId: "q", eventType: "OptionsChanged", serverTimestamp: "2026-10-17T10:00:01Z", selected: ["a"], deselected: [], revision: 1, textLength: null },
  { sequence: 2, questionId: "q", eventType: "QuestionRevisited", serverTimestamp: "2026-10-17T10:00:02Z", selected: [], deselected: [], revision: 0, textLength: null },
  { sequence: 3, questionId: "q", eventType: "TextRevised", serverTimestamp: "2026-10-17T10:00:03Z", selected: [], deselected: [], revision: 2, textLength: 14, afterRevisit: true },
  { sequence: 4, questionId: "q", eventType: "AnswerConfirmed", serverTimestamp: "2026-10-17T10:00:05Z", selected: [], deselected: [], revision: 2, textLength: null },
];
function mount(active: Attempt = attempt, items = events) { render(<QueryClientProvider client={new QueryClient()}><AttemptInteractionHistory attempt={active} events={items} limited={false} /></QueryClientProvider>); }
beforeEach(() => vi.clearAllMocks());
it("renders an ordered timeline with option letters, text metadata, revisits and confirmation timing", () => {
  mount(); expect(screen.getByText(/Обрано: A/)).toBeInTheDocument(); expect(screen.getByText(/14 символів/)).toBeInTheDocument(); expect(screen.getByText(/5 с від початку спроби/)).toBeInTheDocument();
  expect(screen.getByText(/Повторно переглянутих питань: 1/)).toBeInTheDocument(); expect(screen.getByText(/після повернення/)).toBeInTheDocument();
});
it("shows the disabled state for historical attempts without tracking", () => { mount({ ...attempt, trackAnswerChanges: false }, []); expect(screen.getByText(/Відстеження було вимкнено/)).toBeInTheDocument(); expect(screen.queryByRole("list")).not.toBeInTheDocument(); });
it("requires confirmation before clearing auxiliary events", async () => {
  vi.mocked(testingApi.clearInteractions).mockResolvedValue(undefined); mount();
  await userEvent.click(screen.getByRole("button", { name: "Видалити історію взаємодій" })); expect(testingApi.clearInteractions).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /^Видалити$/ })); expect(testingApi.clearInteractions).toHaveBeenCalledWith("attempt");
});
