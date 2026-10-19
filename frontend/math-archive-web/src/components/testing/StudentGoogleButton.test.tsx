import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudentGoogleButton } from "./StudentGoogleButton";
import { studentApi } from "../../api/studentApi";
vi.mock("../../api/studentApi", () => ({ studentApi: { googleChallenge: vi.fn(), googleAuthenticate: vi.fn() } }));
let callback: (response: { credential: string }) => void;
const initialize = vi.fn((options: { callback: typeof callback }) => { callback = options.callback; });
const renderButton = vi.fn((element: HTMLElement) => { const button = document.createElement("button"); button.textContent = "Google account"; element.append(button); });
beforeEach(() => { vi.clearAllMocks(); window.google = { accounts: { id: { initialize, renderButton } } }; vi.mocked(studentApi.googleChallenge).mockResolvedValue({ clientId: "client", nonce: "nonce" }); });
afterEach(() => { delete window.google; });
it("starts the Google sign-in challenge and passes the credential only to the backend", async () => {
  const result = { requiresProfile: true, student: null }; const success = vi.fn(); vi.mocked(studentApi.googleAuthenticate).mockResolvedValue(result);
  render(<StudentGoogleButton onSuccess={success} />);
  await userEvent.click(screen.getByRole("button", { name: "Продовжити з Google" }));
  await screen.findByRole("button", { name: "Google account" });
  expect(studentApi.googleChallenge).toHaveBeenCalledWith(false);
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client", nonce: "nonce", auto_select: false }));
  await act(async () => callback({ credential: "signed-google-proof" }));
  expect(studentApi.googleAuthenticate).toHaveBeenCalledWith("signed-google-proof"); expect(success).toHaveBeenCalledWith(result);
  expect(localStorage.getItem("credential")).toBeNull(); expect(sessionStorage.getItem("credential")).toBeNull();
});
it("requires an explicit click to initiate account linking and permits retry on failed proof", async () => {
  vi.mocked(studentApi.googleAuthenticate).mockRejectedValue(new Error("Google proof failed"));
  render(<StudentGoogleButton link onSuccess={vi.fn()} />);
  expect(studentApi.googleChallenge).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Підключити Google" }));
  await screen.findByRole("button", { name: "Google account" }); expect(studentApi.googleChallenge).toHaveBeenCalledWith(true);
  await act(async () => callback({ credential: "invalid" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Підключити Google" })).toBeEnabled();
});
it("does not accept a late Google callback after leaving the page", async () => {
  const success = vi.fn(); const view = render(<StudentGoogleButton onSuccess={success} />);
  await userEvent.click(screen.getByRole("button", { name: "Продовжити з Google" })); await screen.findByRole("button", { name: "Google account" }); view.unmount();
  await act(async () => callback({ credential: "late" })); expect(studentApi.googleAuthenticate).not.toHaveBeenCalled();
});
