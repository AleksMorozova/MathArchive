import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { StudentGoogleProfilePage, StudentProfilePage } from "./StudentProfile";
import { studentApi } from "../../api/studentApi";
vi.mock("../../api/studentApi", () => ({ studentApi: { me: vi.fn(), googlePending: vi.fn(), googleComplete: vi.fn() } }));
vi.mock("../../seo/Seo", () => ({ Seo: () => null }));
const student = { id: "existing", firstName: "Олена", lastName: "Тестова", grade: 7, createdAt: "", lastLoginAt: null, isActive: true, authenticationMethods: ["Google"] };
function mount(page: React.ReactNode) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter><Routes><Route path="/" element={page} /><Route path="/student" element={<p>Мої збережені тести</p>} /></Routes></MemoryRouter></QueryClientProvider>); return cache;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(studentApi.me).mockResolvedValue(null); });
it("completes a verified Google profile without asking for email or PIN", async () => {
  vi.mocked(studentApi.googlePending).mockResolvedValue({ firstName: "Олена", lastName: "Тестова" }); vi.mocked(studentApi.googleComplete).mockResolvedValue(student);
  const cache = mount(<StudentGoogleProfilePage />);
  expect(await screen.findByDisplayValue("Олена")).toBeInTheDocument(); expect(screen.queryByLabelText(/PIN/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "До моїх тестів" }));
  expect(await screen.findByText("Мої збережені тести")).toBeInTheDocument();
  expect(studentApi.googleComplete).toHaveBeenCalledWith({ firstName: "Олена", lastName: "Тестова", grade: 5 }, expect.anything());
  expect(cache.getQueryData(["student-session"])).toEqual(student);
});
it("shows Google-linked profile methods and teacher-assisted PIN recovery", async () => {
  vi.mocked(studentApi.me).mockResolvedValue(student); mount(<StudentProfilePage />);
  expect(await screen.findByText("Способи входу: Google")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Підключити Google" })).not.toBeInTheDocument(); expect(screen.getByText(/Звернися до вчителя особисто/)).toBeInTheDocument();
});
