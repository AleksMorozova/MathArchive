import { studentRequest } from "./studentApi";
import { beforeEach, expect, it, vi } from "vitest";
import { testingApi } from "./testingApi";
import { httpClient } from "./httpClient";
vi.mock("./httpClient", () => ({
  httpClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(httpClient.get).mockResolvedValue({ data: {} });
  vi.mocked(httpClient.put).mockResolvedValue({ data: {} });
  vi.mocked(httpClient.post).mockResolvedValue({ data: {} });
});
it("uses cookie authentication and a CSRF header without attempt tokens", async () => {
  const c = { id: "id", token: "secret" };
  await testingApi.attempt(c);
  expect(httpClient.get).toHaveBeenCalledWith("/api/test-attempts/id", {
    ...studentRequest,
    signal: undefined,
  });
  await testingApi.submit(c);
  expect(httpClient.post).toHaveBeenCalledWith(
    "/api/test-attempts/id/submit",
    null,
    studentRequest,
  );
});
it("uses the existing /api prefix for public and administrator routes", async () => {
  await testingApi.list(false, 7);
  expect(httpClient.get).toHaveBeenCalledWith("/api/tests", {
    params: { grade: 7 },
  });
  await testingApi.list(true);
  expect(httpClient.get).toHaveBeenCalledWith("/api/admin/tests", {
    params: { grade: undefined },
  });
});

it("saves and publishes with one API request", async () => {
  const d = {} as import("../types/testing").TestDefinition;
  await testingApi.save(undefined, d, true);
  expect(httpClient.post).toHaveBeenCalledWith("/api/admin/tests", d, {
    params: { publish: true },
  });
  expect(httpClient.post).toHaveBeenCalledOnce();
});



it("sends only answer content and concurrency metadata, never grading fields", async () => {
  const answer = { questionId: "q", optionIds: ["a"], text: null, revision: 2, operationId: "request", isCorrect: true, earnedPoints: 999, locked: true };
  await testingApi.answer({ id: "attempt", token: "unused" }, answer, true);
  expect(httpClient.put).toHaveBeenCalledWith("/api/test-attempts/attempt/answers", { questionId: "q", optionIds: ["a"], text: null, revision: 2, operationId: "request", lock: true }, studentRequest);
});
