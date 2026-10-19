import { ApiError } from "../../api/apiErrors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { StudentDashboardPage, StudentLoginPage } from "./StudentAccount";
import { StudentAccountControl } from "../../components/testing/StudentAccountControl";
import { studentApi } from "../../api/studentApi";
import { testingApi } from "../../api/testingApi";
vi.mock("../../api/studentApi", () => ({ studentApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), history: vi.fn(), logout: vi.fn() } }));
vi.mock("../../api/testingApi", () => ({ testingApi: { list: vi.fn() } }));
vi.mock("../../api/analyticsApi", () => ({ trackSiteVisit: vi.fn() }));
vi.mock("../../seo/Seo", () => ({ Seo: () => null }));
const profile = { id: "student", firstName: "Олена", lastName: "Тестова", grade: 5, createdAt: "", lastLoginAt: null, isActive: true };
function mount(ui: React.ReactNode, path = "/student/login", client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={ui} /><Route path="/tests/test" element={<p>Повернулися до тесту</p>} /></Routes></MemoryRouter></QueryClientProvider>);
  return client;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(studentApi.me).mockResolvedValue(null); vi.mocked(testingApi.list).mockResolvedValue([]); vi.mocked(studentApi.history).mockResolvedValue([]); });
async function fillIdentity() {
  await userEvent.type(screen.getByRole("textbox", { name: "Ім'я" }), "Олена");
  await userEvent.type(screen.getByRole("textbox", { name: "Прізвище" }), "Тестова");
}
it("logs in with a PIN and safely returns to the requested test", async () => {
  vi.mocked(studentApi.login).mockResolvedValue(profile);
  mount(<StudentLoginPage />, "/student/login?returnTo=%2Ftests%2Ftest"); await fillIdentity();
  await userEvent.type(screen.getByLabelText("PIN-код"), "Matematyka29");
  await userEvent.click(screen.getByRole("button", { name: "Увійти" }));
  expect(await screen.findByText("Повернулися до тесту")).toBeInTheDocument();
  expect(studentApi.login).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Олена", lastName: "Тестова", grade: 5, pin: "Matematyka29" }));
  expect(localStorage.getItem("pin")).toBeNull(); expect(sessionStorage.getItem("pin")).toBeNull();
});
it("validates PIN confirmation before registration", async () => {
  mount(<StudentLoginPage />); await userEvent.click(screen.getByRole("tab", { name: "Зареєструватися" }));
  await fillIdentity(); await userEvent.type(screen.getByLabelText("Придумайте PIN-код"), "Matematyka29");
  await userEvent.type(screen.getByLabelText("Підтвердіть PIN-код"), "Different29");
  await userEvent.click(screen.getByRole("button", { name: "Зареєструватися" }));
  expect((await screen.findAllByText("PIN-коди не збігаються")).length).toBeGreaterThan(0);
  expect(studentApi.register).not.toHaveBeenCalled();
});
it("shows invalid PIN errors without granting access", async () => {
  vi.mocked(studentApi.login).mockRejectedValue(new ApiError("Перевірте PIN-код", { status: 401, problem: { title: "Тестування", detail: "Перевірте PIN-код" } }));
  mount(<StudentLoginPage />); await fillIdentity(); await userEvent.type(screen.getByLabelText("PIN-код"), "wrong");
  await userEvent.click(screen.getByRole("button", { name: "Увійти" }));
  expect(await screen.findByText("Перевірте PIN-код")).toBeInTheDocument();
  expect(screen.queryByText("Повернулися до тесту")).not.toBeInTheDocument();
});
it("renders private history with every attempt while respecting hidden results", async () => {
  vi.mocked(studentApi.me).mockResolvedValue(profile);
  vi.mocked(studentApi.history).mockResolvedValue([
    { id:"a", testId:"test", testTitle:"Алгебра", attemptNumber:2, status:"Completed", startedAt:"2026-10-16T10:00:00Z", completedAt:"2026-10-16T10:10:00Z",earnedPoints:9,maximumPoints:10,percentage:90,passed:true },
    { id:"b", testId:"test", testTitle:"Прихований результат", attemptNumber:1, status:"Completed", startedAt:"2026-10-15T10:00:00Z", completedAt:"2026-10-15T10:10:00Z",earnedPoints:null,maximumPoints:null,percentage:null,passed:null },
  ]);
  mount(<StudentDashboardPage />, "/student?tab=history");
  expect(await screen.findByText("Спроба №2")).toBeInTheDocument();
  expect(screen.getByText("Спроба №1")).toBeInTheDocument();
  expect(screen.getByText("9 / 10")).toBeInTheDocument();
  expect(screen.getAllByText(/балів/)).toHaveLength(1);
  expect(screen.getAllByRole("link", { name: "Переглянути" }).map(a => a.getAttribute("href"))).toEqual(["/student/attempts/a","/student/attempts/b"]);
});
it("clears private query data on logout", async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(["student-session"], profile);
  cache.setQueryData(["student", profile.id, "history"], ["private"]);
  vi.mocked(studentApi.logout).mockResolvedValue(undefined);
  mount(<StudentAccountControl />, "/student", cache);
  await userEvent.click(screen.getByRole("button", { name: "Олена Т. · 5 клас" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Вийти" }));
  await waitFor(() => expect(cache.getQueryData(["student", profile.id, "history"])).toBeUndefined());
  expect(cache.getQueryData(["student-session"])).toBeNull();
});


it("does not restore a logged-out session when an older profile request finishes late", async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(["student-session"], profile);
  let finishProfile!: (value: typeof profile) => void;
  vi.mocked(studentApi.me).mockImplementation(() => new Promise(resolve => { finishProfile = resolve; }));
  vi.mocked(studentApi.logout).mockResolvedValue(undefined);
  mount(<StudentAccountControl />, "/student", cache);
  // Keep the observer mounted while a pre-logout refresh is still in flight.
  const refresh = cache.invalidateQueries({ queryKey: ["student-session"] });
  await waitFor(() => expect(studentApi.me).toHaveBeenCalled());
  await userEvent.click(screen.getByRole("button", { name: "Олена Т. · 5 клас" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Вийти" }));
  await waitFor(() => expect(cache.getQueryData(["student-session"])).toBeNull());
  finishProfile(profile);
  await refresh;
  expect(cache.getQueryData(["student-session"])).toBeNull();
  expect(await screen.findByRole("link", { name: "Увійти для тестування" })).toBeInTheDocument();
});
