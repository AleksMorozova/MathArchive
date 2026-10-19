import { ApiError } from "../../api/apiErrors";
import { outboxKey, writeOutbox } from "../../components/testing/attemptOutbox";
import { studentApi } from "../../api/studentApi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AttemptResult,
  AnswerControls,
  StudentTestPage,
  TestCatalogPage,
} from "./StudentTests";
import type { Attempt } from "../../types/testing";
import { testingApi } from "../../api/testingApi";
const authState = vi.hoisted(() => ({ signedIn: true }));
vi.mock("../../components/testing/useStudentSession", () => ({
  studentSessionKey: ["student-session"],
  useStudentSession: () => ({ data: authState.signedIn ? { id: "student", firstName: "Олена", lastName: "Тестова", grade: 5 } : null, isPending: false, isError: false }),
}));
vi.mock("../../api/studentApi", () => ({ studentApi: { access: vi.fn(), logout: vi.fn() } }));
vi.mock("../../api/testingApi", () => ({
  testingApi: {
    list: vi.fn(),
    info: vi.fn(),
    attempt: vi.fn(),
    answer: vi.fn(),
    start: vi.fn(),
    submit: vi.fn(),
    progress: vi.fn(),
  },
  readCredentials: () =>
    JSON.parse(sessionStorage.getItem("test-attempt:test") ?? "null"),
  saveCredentials: vi.fn(),
  participantToken: () => "browser",
}));
vi.mock("../../seo/Seo", () => ({ Seo: () => null }));
const q = {
  id: "q",
  text: "2 + 2?",
  type: "SingleChoice" as const,
  points: 1,
  options: [
    { id: "a", text: "4", isCorrect: false },
    { id: "b", text: "5", isCorrect: false },
  ],
};
function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "attempt",
    title: "Математика",
    status: "InProgress",
    startedAt: new Date().toISOString(),
    deadline: null,
    completedAt: null,
    answerVisibility: "AfterCompletion",
    questions: [q],
    answers: [],
    earnedPoints: null,
    maximumPoints: null,
    percentage: null,
    passed: null,
    correctCount: null,
    review: [],
    ...overrides,
  };
}
function mount(ui: React.ReactNode, path = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={ui} />
          <Route path="/tests/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks(); authState.signedIn = true;
  vi.mocked(studentApi.access).mockResolvedValue({ resumeAttemptId: "attempt", previousAttemptId: null, canStart: false });
  sessionStorage.clear(); localStorage.clear();
  vi.mocked(testingApi.info).mockResolvedValue({
    id: "test",
    title: "Математика",
    description: null,
    grade: 5,
    documentId: null,
    questionCount: 1,
    timeLimitMinutes: null,
    availableFrom: null,
    availableTo: null,
    allowRepeats: true,
  });
});
describe("student testing", () => {
  it("uses the URL grade for catalog filtering", async () => {
    vi.mocked(testingApi.list).mockResolvedValue([]);
    mount(<TestCatalogPage />, "/tests?grade=7");
    await screen.findByText("Тестів поки немає.");
    expect(testingApi.list).toHaveBeenCalledWith(false, 7);
  });
  it("single choice replaces selected option", async () => {
    const change = vi.fn();
    render(
      <AnswerControls
        question={q}
        answer={{ questionId: "q", optionIds: ["a"], text: null }}
        disabled={false}
        onChange={change}
      />,
    );
    await userEvent.click(screen.getByLabelText("5"));
    expect(change).toHaveBeenCalledWith({
      questionId: "q",
      optionIds: ["b"],
      text: null,
    });
  });
  it("locked options cannot be changed", async () => {
    const change = vi.fn();
    render(
      <AnswerControls
        question={q}
        answer={{ questionId: "q", optionIds: ["a"], text: null }}
        disabled
        onChange={change}
      />,
    );
    expect(screen.getByLabelText("5")).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
  });
  it("hidden result does not render score, answer key or correctness", () => {
    render(<AttemptResult attempt={attempt({ status: "Completed" })} />);
    expect(screen.getByText("Тест завершено!")).toBeInTheDocument();
    expect(screen.queryByText(/Правильна відповідь/)).not.toBeInTheDocument();
    expect(screen.queryByText(/балів/)).not.toBeInTheDocument();
  });
  it("requires student authentication before showing questions or starting", async () => {
    authState.signedIn = false;
    mount(<StudentTestPage />, "/tests/test");
    await screen.findByText("Увійди, щоб розпочати");
    expect(screen.getAllByRole("link", { name: "Увійти для тестування" }).some(link => link.getAttribute("href") === "/student/login?returnTo=%2Ftests%2Ftest")).toBe(true);
    expect(screen.queryByText("2 + 2?")).not.toBeInTheDocument();
    expect(testingApi.start).not.toHaveBeenCalled();
    expect(testingApi.attempt).not.toHaveBeenCalled();
  });
  it("restores saved attempt after refresh and saves before final submission", async () => {
    sessionStorage.setItem(
      "test-attempt:test",
      JSON.stringify({ id: "attempt", token: "" }),
    );
    vi.mocked(testingApi.attempt).mockResolvedValue(
      attempt({ answers: [{ questionId: "q", optionIds: ["a"], text: null }] }),
    );
    vi.mocked(testingApi.answer).mockImplementation(async (_, a) =>
      attempt({ answers: [a] }),
    );
    vi.mocked(testingApi.submit).mockResolvedValue(
      attempt({ status: "Completed" }),
    );
    mount(<StudentTestPage />, "/tests/test");
    expect(await screen.findByLabelText("4")).toBeChecked();
    await userEvent.click(screen.getByLabelText("5"));
    await userEvent.click(
      screen.getByRole("button", { name: "Завершити тест" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Завершити тест" }),
    );
    await screen.findByText("Тест завершено!");
    expect(testingApi.answer).toHaveBeenCalledWith(
      { id: "attempt", token: "" },
      expect.objectContaining({ optionIds: ["b"] }),
    );
    expect(testingApi.submit).toHaveBeenCalledOnce();
    expect(
      vi.mocked(testingApi.answer).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(testingApi.submit).mock.invocationCallOrder[0]);
  });
  it("locks immediate feedback before enabling next navigation", async () => {
    sessionStorage.setItem(
      "test-attempt:test",
      JSON.stringify({ id: "attempt", token: "" }),
    );
    const initial = attempt({
      answerVisibility: "Immediate",
      questions: [q, { ...q, id: "q2" }],
    });
    vi.mocked(testingApi.attempt).mockResolvedValue(initial);
    vi.mocked(testingApi.answer).mockResolvedValue({
      ...initial,
      answers: [{ questionId: "q", optionIds: [], text: null, locked: true }],
      review: [
        {
          questionId: "q",
          isCorrect: false,
          earnedPoints: 0,
          correctOptionIds: ["a"],
          acceptedAnswers: [],
          explanation: "Пояснення",
        },
      ],
    });
    mount(<StudentTestPage />, "/tests/test");
    const next = await screen.findByRole("button", { name: "Далі" });
    expect(next).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Відповісти та зафіксувати" }),
    );
    await waitFor(() => expect(next).toBeEnabled());
    expect(screen.getByLabelText("4")).toBeDisabled();
    expect(screen.getByText("Пояснення")).toBeInTheDocument();
  });
});

it("continues an account-owned attempt when the test is no longer public", async () => {
  sessionStorage.setItem(
    "test-attempt:test",
    JSON.stringify({ id: "attempt", token: "" }),
  );
  vi.mocked(testingApi.info).mockRejectedValue(new Error("Archived"));
  vi.mocked(testingApi.attempt).mockResolvedValue(attempt());
  mount(<StudentTestPage />, "/tests/test");
  expect(await screen.findByText("2 + 2?")).toBeInTheDocument();
  expect(
    screen.queryByText("Не вдалося завантажити матеріали"),
  ).not.toBeInTheDocument();
});


it("does not offer Start when an account has completed a non-repeatable test", async () => {
  vi.mocked(studentApi.access).mockResolvedValue({ resumeAttemptId: null, previousAttemptId: "attempt", canStart: false });
  vi.mocked(testingApi.info).mockResolvedValue({ id:"test",title:"Математика",description:null,grade:5,documentId:null,questionCount:1,timeLimitMinutes:null,availableFrom:null,availableTo:null,allowRepeats:false });
  vi.mocked(testingApi.attempt).mockResolvedValue(attempt({ status: "Completed" }));
  mount(<StudentTestPage />, "/tests/test");
  await screen.findByText("Тест завершено!");
  expect(screen.getByText("Ви вже проходили цей тест")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Розпочати тест" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Нова спроба" })).not.toBeInTheDocument();
});


it("debounces drafts and reuses the same revision and operation ID after a failed save", async () => {
  vi.mocked(testingApi.attempt).mockResolvedValue(attempt());
  vi.mocked(testingApi.answer).mockRejectedValueOnce(new Error("Offline")).mockImplementation(async (_, answer) => attempt({ answers: [{ ...answer, revision: 1 }] }));
  mount(<StudentTestPage />, "/tests/test"); await screen.findByLabelText("4");
  await userEvent.click(screen.getByLabelText("4")); await userEvent.click(screen.getByLabelText("5"));
  expect(testingApi.answer).not.toHaveBeenCalled(); expect(localStorage.getItem(outboxKey("student", "attempt"))).toContain('"optionIds":["b"]');
  expect(await screen.findByText("Не вдалося зберегти")).toBeInTheDocument();
  const first = vi.mocked(testingApi.answer).mock.calls[0][1]; expect(first.revision).toBe(0); expect(first.operationId).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Повторити" }));
  await screen.findByText("Збережено"); expect(testingApi.answer).toHaveBeenCalledTimes(2); expect(vi.mocked(testingApi.answer).mock.calls[1][1]).toEqual(first);
  expect(localStorage.getItem(outboxKey("student", "attempt"))).toBeNull();
});
it("restores an offline draft only after loading the owned attempt", async () => {
  writeOutbox(outboxKey("student", "attempt"), { q: { questionId: "q", optionIds: ["b"], text: null, revision: 0, operationId: "pending-operation" } });
  vi.mocked(testingApi.attempt).mockResolvedValue(attempt()); vi.mocked(testingApi.answer).mockImplementation(async (_, answer) => attempt({ answers: [{ ...answer, revision: 1 }] }));
  mount(<StudentTestPage />, "/tests/test"); expect(await screen.findByLabelText("5")).toBeChecked();
  await waitFor(() => expect(testingApi.answer).toHaveBeenCalledWith({ id: "attempt", token: "" }, expect.objectContaining({ operationId: "pending-operation", revision: 0 })), { timeout: 1500 });
});
it("preserves a conflicting local answer until the student explicitly chooses the server version", async () => {
  const server = attempt({ answers: [{ questionId: "q", optionIds: ["a"], text: null, revision: 2 }] });
  vi.mocked(testingApi.attempt).mockResolvedValue(server);
  vi.mocked(testingApi.answer).mockRejectedValue(new ApiError("Відповідь змінена в іншому сеансі", { status: 409 }));
  mount(<StudentTestPage />, "/tests/test"); await screen.findByLabelText("4"); await userEvent.click(screen.getByLabelText("5"));
  await screen.findByText("Не вдалося зберегти"); expect(screen.getByLabelText("5")).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Завантажити збережену версію" }));
  const dialog = await screen.findByRole("dialog"); await userEvent.click(within(dialog).getByRole("button", { name: "Використати версію сервера" }));
  await waitFor(() => expect(screen.getByLabelText("4")).toBeChecked()); expect(localStorage.getItem(outboxKey("student", "attempt"))).toBeNull();
});
it("restores the saved question and uses the server clock for the remaining time", async () => {
  const serverTime = Date.now() - 3600000;
  vi.mocked(testingApi.attempt).mockResolvedValue(attempt({ questions: [q, { ...q, id: "q2", text: "Повернулися до другого питання" }], currentQuestionId: "q2", progressRevision: 1, serverTime: new Date(serverTime).toISOString(), deadline: new Date(serverTime + 60000).toISOString() }));
  mount(<StudentTestPage />, "/tests/test"); expect(await screen.findByText("Повернулися до другого питання")).toBeInTheDocument();
  expect(screen.getByRole("timer")).toHaveTextContent(/Залишилось (1:00|0:59)/); expect(testingApi.attempt).toHaveBeenCalledTimes(1);
});
