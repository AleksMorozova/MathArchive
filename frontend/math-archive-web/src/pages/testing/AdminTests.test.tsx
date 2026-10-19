import { ApiError } from "../../api/apiErrors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, beforeAll, afterAll, expect, it, vi } from "vitest";
import { TestEditorPage } from "./AdminTests";
import { testingApi } from "../../api/testingApi";
import type { AdminTest, TestDefinition } from "../../types/testing";
vi.mock("../../api/testingApi", () => ({
  testingApi: { admin: vi.fn(), save: vi.fn(), status: vi.fn(), uploadImage: vi.fn(), image: vi.fn() },
}));
vi.mock("mathlive", () => {
  class Field extends HTMLElement { value = ""; readOnly = false; mathVirtualKeyboardPolicy = "auto"; menuItems = []; insert(value: string) { this.value += value; this.dispatchEvent(new Event("input")); } }
  if (!customElements.get("math-field")) customElements.define("math-field", Field);
  return { MathfieldElement: Field };
});
vi.mock("../../api/documentsApi", () => ({
  getDocuments: async () => ({ items: [] }),
}));
vi.mock("../../seo/Seo", () => ({ Seo: () => null }));
const record: AdminTest = {
  id: "id",
  status: "Draft",
  definition: {
    title: "Чернетка",
    description: "",
    grade: 5,
    documentId: null,
    settings: {
      answerVisibility: "AfterCompletion",
      showScore: true,
      allowRepeats: true,
      shuffleOptions: false,
      shuffleQuestions: false,
      timeLimitMinutes: null,
      passingPercentage: null,
      availableFrom: null,
      availableTo: null,
    },
    questions: [],
  },
};
function mount(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([
    { path: "/admin/tests/new", element: <TestEditorPage /> },
    { path: "/admin/tests/:id/edit", element: <TestEditorPage /> },
    { path: "/admin/tests", element: <p>Список тестів</p> },
  ], { initialEntries: [path] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return client;
}
// Node's fetch Request and jsdom AbortSignal belong to different realms. These
// navigation-only tests have no loaders; request cancellation is irrelevant here.
const NativeRequest = globalThis.Request;
beforeAll(() => vi.stubGlobal("Request", class extends NativeRequest { constructor(input: RequestInfo | URL, init?: RequestInit) { const { signal: _signal, ...options } = init ?? {}; super(input, options); } }));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:question-image"); URL.revokeObjectURL = vi.fn();
  vi.mocked(testingApi.image).mockResolvedValue(new Blob());
  vi.mocked(testingApi.admin).mockResolvedValue(structuredClone(record));
  vi.mocked(testingApi.save).mockResolvedValue(record);
});
it("hydrates edit data once and keeps dirty values after refetch", async () => {
  const client = mount("/admin/tests/id/edit");
  const title = await screen.findByDisplayValue("Чернетка");
  await userEvent.clear(title);
  await userEvent.type(title, "Моя зміна");
  await client.invalidateQueries({ queryKey: ["admin-test", "id"] });
  expect(screen.getByLabelText("Назва")).toHaveValue("Моя зміна");
});
it("saves a new draft and navigates to its persistent editor", async () => {
  mount("/admin/tests/new");
  await userEvent.type(screen.getByLabelText("Назва"), "Нова чернетка");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ }));
  await waitFor(() =>
    expect(testingApi.save).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ title: "Нова чернетка", questions: [] }),
      false,
    ),
  );
  expect(await screen.findByText("Редагування тесту")).toBeInTheDocument();
});
it("adds and duplicates a question with independent identifiers", async () => {
  mount("/admin/tests/new");
  await userEvent.type(screen.getByLabelText("Назва"), "Тест");
  await userEvent.click(screen.getByRole("tab", { name: /^Питання/ }));
  await userEvent.click(screen.getByRole("button", { name: "Додати питання" }));
  await userEvent.type(screen.getByLabelText("Текст питання"), "2 + 2?");
  await userEvent.type(screen.getByLabelText("Варіант 1"), "4");
  await userEvent.type(screen.getByLabelText("Варіант 2"), "5");
  await userEvent.click(
    screen.getByRole("button", { name: "Дублювати питання" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Зберегти й опублікувати" }),
  );
  await waitFor(() => expect(testingApi.save).toHaveBeenCalled());
  const [, d, publish] = vi.mocked(testingApi.save).mock.calls[0];
  expect(publish).toBe(true);
  expect(d.questions).toHaveLength(2);
  expect(d.questions[0].id).not.toBe(d.questions[1].id);
  expect(d.questions[0].options[0].id).not.toBe(d.questions[1].options[0].id);
  expect(testingApi.status).not.toHaveBeenCalled();
});

it("defaults interaction tracking off and saves the teacher's explicit choice", async () => {
  mount("/admin/tests/new"); const toggle = screen.getByRole("checkbox", { name: "Відстежувати зміни відповідей" }); expect(toggle).not.toBeChecked();
  await userEvent.type(screen.getByLabelText("Назва"), "Відстеження"); await userEvent.click(toggle); await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ }));
  await waitFor(() => expect(testingApi.save).toHaveBeenCalledWith(undefined, expect.objectContaining({ settings: expect.objectContaining({ trackAnswerChanges: true }) }), false));
});

const validQuestion: TestDefinition["questions"][number] = { id: "11111111-1111-4111-8111-111111111111", text: "Початкове питання", type: "SingleChoice", points: 1, explanation: "Пояснення", acceptedAnswers: [], options: [{ id: "22222222-2222-4222-8222-222222222222", text: "Так", isCorrect: true }, { id: "33333333-3333-4333-8333-333333333333", text: "Ні", isCorrect: false }] };
function withQuestions(questions = [structuredClone(validQuestion)], status: AdminTest["status"] = "Draft") { const value = structuredClone(record); value.definition.questions = questions; value.status = status; vi.mocked(testingApi.admin).mockResolvedValue(value); return value; }
it("keeps both tabs' unsaved values, question IDs and count alive without warning on tab changes", async () => {
  withQuestions(); mount("/admin/tests/id/edit"); await screen.findByDisplayValue("Чернетка");
  await userEvent.clear(screen.getByLabelText("Назва")); await userEvent.type(screen.getByLabelText("Назва"), "Незбережена назва");
  await userEvent.click(screen.getByRole("tab", { name: /^Питання \(1\)/ }));
  expect(screen.getByLabelText("Назва")).not.toBeVisible(); await userEvent.clear(screen.getByLabelText("Текст питання")); await userEvent.type(screen.getByLabelText("Текст питання"), "Змінене питання");
  await userEvent.click(screen.getByRole("tab", { name: "Налаштування" })); expect(screen.getByLabelText("Назва")).toHaveValue("Незбережена назва"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: /^Питання/ })); expect(screen.getByLabelText("Текст питання")).toHaveValue("Змінене питання");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await waitFor(() => expect(testingApi.save).toHaveBeenCalled());
  const [id, definition] = vi.mocked(testingApi.save).mock.calls[0]; expect(id).toBe("id"); expect(definition.title).toBe("Незбережена назва"); expect(definition.questions[0]).toMatchObject({ id: validQuestion.id, text: "Змінене питання" }); expect(testingApi.save).toHaveBeenCalledOnce();
});
it("confirms external navigation and browser reload when dirty, but does not block saved navigation", async () => {
  mount("/admin/tests/new"); await userEvent.type(screen.getByLabelText("Назва"), "Чернетка для збереження");
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  await userEvent.click(screen.getByRole("link", { name: "До списку" })); expect(await screen.findByRole("dialog", { name: "Вийти без збереження?" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Залишитися" })); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(screen.getByLabelText("Назва")).toHaveValue("Чернетка для збереження");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await screen.findByText("Редагування тесту");
  await userEvent.click(screen.getByRole("link", { name: "До списку" })); expect(await screen.findByText("Список тестів")).toBeInTheDocument();
});
it("opens settings and focuses the invalid title when saving from the questions tab", async () => {
  mount("/admin/tests/new?tab=questions"); expect(screen.getByRole("tab", { name: /^Питання/ })).toHaveAttribute("aria-selected", "true");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ }));
  await waitFor(() => expect(screen.getByRole("tab", { name: /^Налаштування/ })).toHaveAttribute("aria-selected", "true"));
  await waitFor(() => expect(screen.getByLabelText("Назва")).toHaveFocus()); expect(screen.getByRole("tab", { name: /^Налаштування/ })).toHaveTextContent("●"); expect(testingApi.save).not.toHaveBeenCalled();
});
it("opens the question tab and identifies a missing correct answer", async () => {
  const invalid = structuredClone(validQuestion); invalid.options.forEach(o => { o.isCorrect = false; }); withQuestions([invalid]); mount("/admin/tests/id/edit"); await screen.findByDisplayValue("Чернетка");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ }));
  await waitFor(() => expect(screen.getByRole("tab", { name: /^Питання/ })).toHaveAttribute("aria-selected", "true")); expect(screen.getAllByText(/Питання 1: Оберіть правильну відповідь/).length).toBeGreaterThan(0); expect(screen.getByRole("tab", { name: /^Питання/ })).toHaveTextContent("●"); expect(testingApi.save).not.toHaveBeenCalled();
});
it("allows an empty draft but directs empty publication to the questions tab", async () => {
  mount("/admin/tests/new"); await userEvent.type(screen.getByLabelText("Назва"), "Порожня чернетка");
  await userEvent.click(screen.getByRole("button", { name: "Зберегти й опублікувати" })); expect(await screen.findByText("Додайте щонайменше одне питання для публікації.")).toBeInTheDocument(); await waitFor(() => expect(screen.getByRole("tab", { name: /^Питання/ })).toHaveAttribute("aria-selected", "true")); expect(testingApi.save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await waitFor(() => expect(testingApi.save).toHaveBeenCalledWith(undefined, expect.objectContaining({ questions: [] }), false));
});
it("reorders and deletes questions without changing the remaining IDs or a published status", async () => {
  const second = { ...structuredClone(validQuestion), id: "44444444-4444-4444-8444-444444444444", text: "Друге питання" }; withQuestions([structuredClone(validQuestion), second], "Published"); mount("/admin/tests/id/edit?tab=questions"); await screen.findByText("Питання · 2/100");
  expect(screen.getAllByText("Опубліковано").length).toBeGreaterThan(0); const cards = screen.getAllByText(/↕ Питання/).map(h => h.closest('.MuiCard-root')!);
  fireEvent.dragStart(cards[1].querySelector('[draggable]')!); fireEvent.dragOver(cards[0]); fireEvent.drop(cards[0]);
  expect(screen.getAllByLabelText("Текст питання")[0]).toHaveValue("Друге питання");
  await userEvent.click(within(cards[0] as HTMLElement).getByRole("button", { name: "Видалити питання" })); const dialog = await screen.findByRole("dialog", { name: "Видалити питання?" }); await userEvent.click(within(dialog).getByRole("button", { name: "Видалити" })); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("tab", { name: /^Питання \(1\)/ })).toBeInTheDocument(); await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await waitFor(() => expect(testingApi.save).toHaveBeenCalled()); expect(vi.mocked(testingApi.save).mock.calls[0][1].questions.map(q => q.id)).toEqual([second.id]);
});
it("maps backend field errors to the appropriate tab", async () => {
  withQuestions(); vi.mocked(testingApi.save).mockRejectedValue(new ApiError("Перевірте бали", { status: 400, problem: { errors: { "Questions[0].Points": ["Вкажіть бали до 1000."] } } })); mount("/admin/tests/id/edit"); await screen.findByDisplayValue("Чернетка");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await waitFor(() => expect(screen.getByRole("tab", { name: /^Питання/ })).toHaveAttribute("aria-selected", "true")); await waitFor(() => expect(screen.getByLabelText("Бали")).toHaveFocus());
});

it("keeps formula content and LaTeX editor mode when switching tabs", async () => {
  const q = { ...structuredClone(validQuestion), text: "x^2", content: [{ kind: "BlockMath" as const, text: "x^2" }] }; withQuestions([q]); mount("/admin/tests/id/edit?tab=questions"); await screen.findByText("Питання · 1/100");
  await userEvent.click(screen.getByLabelText("Режим LaTeX")); const formula = screen.getByLabelText("Текст питання · формула окремим блоком 1"); await userEvent.clear(formula); await userEvent.type(formula, "x^3");
  await userEvent.click(screen.getByRole("tab", { name: "Налаштування" })); await userEvent.click(screen.getByRole("tab", { name: /^Питання/ })); expect(screen.getByLabelText("Режим LaTeX")).toBeChecked(); expect(screen.getByLabelText("Текст питання · формула окремим блоком 1")).toHaveValue("x^3");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await waitFor(() => expect(testingApi.save).toHaveBeenCalled()); expect(vi.mocked(testingApi.save).mock.calls[0][1].questions[0].content).toEqual([{ kind: "BlockMath", text: "x^3" }]);
});
it("keeps an image upload alive across tabs and prevents saving until it completes", async () => {
  let finish!: (value: { id: string; width: number; height: number }) => void;
  vi.mocked(testingApi.uploadImage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  withQuestions(); mount("/admin/tests/id/edit?tab=questions"); await screen.findByText("Питання · 1/100");
  await userEvent.upload(screen.getByLabelText("Текст питання: завантажити зображення"), new File(["image"], "diagram.png", { type: "image/png" }));
  await userEvent.click(screen.getByRole("tab", { name: "Налаштування" })); expect(screen.getByRole("button", { name: "Зберігаємо…" })).toBeDisabled(); expect(testingApi.save).not.toHaveBeenCalled();
  await act(async () => { finish({ id: "55555555-5555-4555-8555-555555555555", width: 80, height: 60 }); });
  await waitFor(() => expect(screen.getByRole("button", { name: /^Зберегти$/ })).toBeEnabled()); await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ }));
  await waitFor(() => expect(testingApi.save).toHaveBeenCalled()); expect(vi.mocked(testingApi.save).mock.calls[0][1].questions[0].content).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "Image", imageId: "55555555-5555-4555-8555-555555555555" })]));
});

it("focuses an invalid answer option in the questions panel", async () => {
  const invalid = structuredClone(validQuestion); invalid.options[1].text = ""; withQuestions([invalid]); mount("/admin/tests/id/edit"); await screen.findByDisplayValue("Чернетка");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await waitFor(() => expect(screen.getByRole("tab", { name: /^Питання/ })).toHaveAttribute("aria-selected", "true")); await waitFor(() => expect(screen.getByLabelText("Варіант 2")).toHaveFocus()); expect(testingApi.save).not.toHaveBeenCalled();
});

it("opens the availability field for a backend date-range validation error", async () => {
  withQuestions(); vi.mocked(testingApi.save).mockRejectedValue(new ApiError("Перевірте налаштування", { status: 400, problem: { errors: { definition: ["Кінець доступності має бути пізніше початку."] } } })); mount("/admin/tests/id/edit?tab=questions"); await screen.findByText("Питання · 1/100");
  await userEvent.click(screen.getByRole("button", { name: /^Зберегти$/ })); await waitFor(() => expect(screen.getByRole("tab", { name: /^Налаштування/ })).toHaveAttribute("aria-selected", "true")); await waitFor(() => expect(screen.getByLabelText("Доступний до")).toHaveFocus());
});
