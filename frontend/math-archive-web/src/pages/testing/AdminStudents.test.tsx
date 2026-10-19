import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminStudentPage, AdminStudentsPage } from "./AdminStudents";
import { studentApi } from "../../api/studentApi";
vi.mock("../../api/studentApi", () => ({ studentApi: { students: vi.fn(), summary: vi.fn(), attempts: vi.fn(), resetPin: vi.fn(), setActive: vi.fn() } }));
const student = { id:"student",firstName:"Олена",lastName:"Тестова",grade:5,isActive:true,createdAt:"2026-10-16T10:00:00Z",lastLoginAt:null };
function mount(detail = false) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[detail ? "/admin/students/student" : "/admin/students"]}><Routes><Route path="/admin/students" element={<AdminStudentsPage />} /><Route path="/admin/students/:studentId" element={<AdminStudentPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(studentApi.students).mockResolvedValue({ items:[student],totalPages:1,totalCount:1 });
  vi.mocked(studentApi.summary).mockResolvedValue({ student,completedAttempts:2,completedTests:1,averagePercentage:50 });
  vi.mocked(studentApi.attempts).mockResolvedValue({ items:[],totalPages:0 });
});
it("searches students on the server and links to their profile", async () => {
  mount();
  expect(await screen.findByRole("link", { name:"Профіль та результати" })).toHaveAttribute("href","/admin/students/student");
  await userEvent.type(screen.getByRole("textbox", { name:"Пошук за ім’ям та прізвищем" }),"Олена");
  await waitFor(() => expect(studentApi.students).toHaveBeenLastCalledWith(expect.objectContaining({search:"Олена",page:1})));
});
it("requires confirmation to reset a PIN and clears the entered value after success", async () => {
  vi.mocked(studentApi.resetPin).mockResolvedValue(undefined);
  mount(true);
  await userEvent.click(await screen.findByRole("button", { name:"Скинути PIN-код" }));
  const pin = await screen.findByLabelText("Новий PIN-код");
  expect(pin).toHaveAttribute("type","password");
  await userEvent.type(pin,"NewMatem29");
  expect(studentApi.resetPin).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name:"Змінити PIN-код" }));
  await waitFor(() => expect(studentApi.resetPin).toHaveBeenCalledWith("student","NewMatem29"));
  await screen.findByText(/PIN-код змінено/);
  await userEvent.click(await screen.findByRole("button", { name:"Скинути PIN-код" }));
  expect(await screen.findByLabelText("Новий PIN-код")).toHaveValue("");
});
it("confirms disabling an account while preserving the history view", async () => {
  vi.mocked(studentApi.setActive).mockResolvedValue(undefined);
  mount(true);
  await userEvent.click(await screen.findByRole("button", { name:"Вимкнути обліковий запис" }));
  expect(studentApi.setActive).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name:"Підтвердити" }));
  await waitFor(() => expect(studentApi.setActive).toHaveBeenCalledWith("student",false));
});

