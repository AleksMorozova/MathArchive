import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation, useNavigate, Navigate, type NavigateFunction } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { StudentDashboardPage } from "./StudentAccount";
import { studentApi, type StudentHistory } from "../../api/studentApi";
import { testingApi } from "../../api/testingApi";
vi.mock("../../api/studentApi", () => ({ studentApi: { me: vi.fn(), history: vi.fn(), access: vi.fn() } }));
vi.mock("../../api/testingApi", () => ({ testingApi: { list: vi.fn() } }));
vi.mock("../../seo/Seo", () => ({ Seo: () => null }));
const profile = { id: "owner", firstName: "Олена", lastName: "Тестова", grade: 7, createdAt: "", lastLoginAt: null, isActive: true };
function attempt(id: string, overrides: Partial<StudentHistory> = {}): StudentHistory { return { id, testId: "test", testTitle: "Історичний тест", attemptNumber: 1, status: "Completed", startedAt: "2026-10-01T10:00:00Z", completedAt: "2026-10-01T10:30:00Z", earnedPoints: 8, maximumPoints: 10, percentage: 80, passed: true, ...overrides }; }
function mount(path = "/student") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let navigate!: NavigateFunction; let location!: ReturnType<typeof useLocation>;
  function Probe() { navigate = useNavigate(); location = useLocation(); return null; }
  const view = render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}><Probe /><Routes><Route path="/student" element={<StudentDashboardPage />} /><Route path="/student/history" element={<Navigate to="/student?tab=history" replace />} /></Routes></MemoryRouter></QueryClientProvider>);
  const router = { get state() { return { location }; }, navigate: async (delta: number) => { await act(async () => { await navigate(delta); }); } };
  return { router, cache, ...view };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(studentApi.me).mockResolvedValue(profile); vi.mocked(studentApi.history).mockResolvedValue([]); vi.mocked(testingApi.list).mockResolvedValue([]); vi.mocked(studentApi.access).mockResolvedValue({ canStart: true, resumeAttemptId: null, previousAttemptId: null }); });
it("defaults to available tests, keeps the identity header and renders only one panel", async () => {
  mount(); expect(await screen.findByText("Тестів для твого класу поки немає.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Мої тести" })).toBeInTheDocument(); expect(screen.getByText("Олена Тестова")).toBeInTheDocument();
  expect(testingApi.list).toHaveBeenCalledWith(false, 7); expect(screen.getByRole("tab", { name: "Доступні тести" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1); expect(screen.queryByText("Завершених спроб")).not.toBeInTheDocument();
});
it("preserves tab changes in the URL and supports Back, Forward and refreshing a statistics URL", async () => {
  const view = mount(); await screen.findByRole("tabpanel");
  await userEvent.click(screen.getByRole("tab", { name: "Історія проходжень" })); expect(await screen.findByText("Твоя історія почнеться з першого тесту.")).toBeInTheDocument();
  expect(view.router.state.location.search).toBe("?tab=history");
  await userEvent.click(screen.getByRole("tab", { name: "Моя статистика" })); await screen.findByText(/Пройди свій перший тест/);
  await view.router.navigate(-1); await waitFor(() => expect(screen.getByRole("tab", { name: "Історія проходжень" })).toHaveAttribute("aria-selected", "true"));
  await view.router.navigate(1); await waitFor(() => expect(screen.getByRole("tab", { name: "Моя статистика" })).toHaveAttribute("aria-selected", "true"));
  const path = view.router.state.location.pathname + view.router.state.location.search; view.unmount(); mount(path);
  expect(await screen.findByText(/Пройди свій перший тест/)).toBeInTheDocument(); expect(screen.queryByText("Тестів для твого класу поки немає.")).not.toBeInTheDocument();
});
it("uses server access decisions for start, resume, review and permitted retakes", async () => {
  vi.mocked(testingApi.list).mockResolvedValue(["new", "active", "locked", "repeat"].map(id => ({ id, title: id, description: "Опис тесту", grade: 7, questionCount: 3, timeLimitMinutes: null })));
  vi.mocked(studentApi.history).mockResolvedValue([attempt("previous", { testId: "locked" }), attempt("previous-repeat", { testId: "repeat" })]);
  vi.mocked(studentApi.access).mockImplementation(async id => ({ canStart: id === "new" || id === "repeat", resumeAttemptId: id === "active" ? "ongoing" : null, previousAttemptId: id === "locked" ? "previous" : id === "repeat" ? "previous-repeat" : null }));
  mount(); expect(await screen.findByRole("link", { name: "Розпочати тест" })).toHaveAttribute("href", "/tests/new");
  expect(await screen.findByRole("link", { name: "Продовжити" })).toHaveAttribute("href", "/tests/active?attempt=ongoing");
  const locked = screen.getByRole("heading", { name: "locked" }).closest("article")!;
  expect(within(locked).getByRole("link", { name: "Переглянути результат" })).toHaveAttribute("href", "/student/attempts/previous"); expect(within(locked).queryByRole("link", { name: "Розпочати тест" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Пройти ще раз" })).toHaveAttribute("href", "/tests/repeat");
});
it("sorts private history newest first, paginates through the URL and preserves hidden scores", async () => {
  const rows = Array.from({ length: 12 }, (_, i) => attempt(String(i), { testTitle: "Тест " + i, attemptNumber: i + 1, completedAt: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`, earnedPoints: null, maximumPoints: null, percentage: null, passed: null }));
  vi.mocked(studentApi.history).mockResolvedValue(rows); const { router } = mount("/student?tab=history");
  expect(await screen.findByRole("heading", { name: "Тест 11" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Тест 11"); expect(screen.getAllByRole("link", { name: "Переглянути" })).toHaveLength(10);
  expect(screen.queryByText(/балів/)).not.toBeInTheDocument(); expect(testingApi.list).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Go to page 2" })); expect(router.state.location.search).toBe("?tab=history&page=2");
  expect(screen.getAllByRole("link", { name: "Переглянути" })).toHaveLength(2); expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Тест 1");
});
it("calculates statistics from permitted percentages and does not reveal the hidden latest result", async () => {
  vi.mocked(studentApi.history).mockResolvedValue([attempt("one", { percentage: 60 }), attempt("two", { testId: "other", percentage: 100 }), attempt("hidden", { testTitle: "Прихований тест", percentage: null, earnedPoints: null, maximumPoints: null, passed: null, completedAt: "2026-10-15T10:00:00Z" }), attempt("active", { status: "InProgress", percentage: null, completedAt: null })]);
  mount("/student?tab=statistics"); expect(await screen.findByText("Середній результат")).toBeInTheDocument();
  const panel = screen.getByRole("tabpanel"); expect(within(panel).getByText("80%")).toBeInTheDocument(); expect(within(panel).getByText("3")).toBeInTheDocument(); expect(within(panel).getByText("2")).toBeInTheDocument();
  expect(within(panel).getByText(/Останній результат приховано/)).toBeInTheDocument(); expect(within(panel).getByText("—")).toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Переглянути" })).not.toBeInTheDocument();
});
it("keeps legacy history links working and never fetches private data without a session", async () => {
  const view = mount("/student/history"); expect(await screen.findByText("Твоя історія почнеться з першого тесту.")).toBeInTheDocument(); expect(view.router.state.location.search).toBe("?tab=history"); view.unmount();
  vi.clearAllMocks(); vi.mocked(studentApi.me).mockResolvedValue(null); mount(); expect(await screen.findByRole("heading", { name: "Увійдіть до свого простору" })).toBeInTheDocument(); expect(studentApi.history).not.toHaveBeenCalled(); expect(studentApi.access).not.toHaveBeenCalled();
});
