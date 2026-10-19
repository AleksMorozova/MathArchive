import { studentRequest } from "./studentApi";
import { httpClient } from "./httpClient";
import type {
  AdminTest,
  Answer,
  Attempt,
  AttemptRow,
  Credentials,
  Overview,
  QuestionStats,
  TestDefinition,
  TestInfo,
  TestStatus,
  TestSummary,
  PublicTestSummary,
} from "../types/testing";
const root = "/api/admin/tests";
export const testingApi = {
  uploadImage: async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    return (
      await httpClient.post<{ id: string; width: number; height: number }>(
        "/api/admin/test-images",
        data,
      )
    ).data;
  },
  image: async (
    id: string,
    credentials: Credentials | null,
    signal?: AbortSignal,
  ) =>
    (
      await httpClient.get<Blob>(
        credentials
          ? `/api/test-attempts/${credentials.id}/images/${id}`
          : `/api/admin/test-images/${id}`,
        {
          responseType: "blob",
          signal,
          ...(credentials
            ? studentRequest
            : {}),
        },
      )
    ).data,
  list: listTests,
  info: async (id: string) =>
    (await httpClient.get<TestInfo>(`/api/tests/${id}`)).data,
  admin: async (id: string) =>
    (await httpClient.get<AdminTest>(`${root}/${id}`)).data,
  save: async (id: string | undefined, d: TestDefinition, publish = false) =>
    (id
      ? await httpClient.put<AdminTest>(`${root}/${id}`, d, {
          params: { publish },
        })
      : await httpClient.post<AdminTest>(root, d, { params: { publish } })
    ).data,
  status: async (id: string, status: TestStatus) => {
    await httpClient.post(`${root}/${id}/publish`, null, {
      params: { status },
    });
  },
  duplicate: async (id: string) =>
    (await httpClient.post<AdminTest>(`${root}/${id}/duplicate`)).data,
  delete: async (id: string) => {
    await httpClient.delete(`${root}/${id}`);
  },
  start: async (id: string) => (await httpClient.post<Credentials>(`/api/tests/${id}/attempts`, null, studentRequest)).data,
  attempt: async (c: Credentials, signal?: AbortSignal) =>
    (
      await httpClient.get<Attempt>(`/api/test-attempts/${c.id}`, {
        ...studentRequest,
        signal,
      })
    ).data,
  answer: async (c: Credentials, a: Answer, lock = false) =>
    (
      await httpClient.put<Attempt>(
        `/api/test-attempts/${c.id}/answers`,
        { questionId: a.questionId, optionIds: a.optionIds, text: a.text, lock, revision: a.revision ?? 0, operationId: a.operationId },
        studentRequest,
      )
    ).data,
  progress: async (c: Credentials, questionId: string, revision: number) => (await httpClient.put<Attempt>(`/api/test-attempts/${c.id}/progress`, { questionId, revision }, studentRequest)).data,
  clearInteractions: async (id: string) => { await httpClient.delete(`${root}/attempts/${id}/interactions`); },
  submit: async (c: Credentials) =>
    (
      await httpClient.post<Attempt>(
        `/api/test-attempts/${c.id}/submit`,
        null,
        studentRequest,
      )
    ).data,
  overview: async (params: object) =>
    (await httpClient.get<Overview>(`${root}/statistics`, { params })).data,
  attempts: async (params: object) =>
    (
      await httpClient.get<{
        items: AttemptRow[];
        totalPages: number;
        totalCount: number;
      }>(`${root}/attempts`, { params })
    ).data,
  detail: async (id: string) =>
    (
      await httpClient.get<{
        firstName: string;
        lastName: string;
        grade: number;
        testTitle: string;
        view: Attempt;
        interactions?: import("../types/testing").AnswerInteraction[];
        interactionLimitReached?: boolean;
      }>(`${root}/attempts/${id}`)
    ).data,
  questions: async (id: string, params: object) =>
    (
      await httpClient.get<QuestionStats[]>(
        `${root}/${id}/question-statistics`,
        { params },
      )
    ).data,
};
async function listTests(admin: true, grade?: number): Promise<TestSummary[]>;
async function listTests(
  admin?: false,
  grade?: number,
): Promise<PublicTestSummary[]>;
async function listTests(
  admin = false,
  grade?: number,
): Promise<TestSummary[] | PublicTestSummary[]> {
  return (
    await httpClient.get<TestSummary[] | PublicTestSummary[]>(
      admin ? root : "/api/tests",
      { params: { grade } },
    )
  ).data;
}

