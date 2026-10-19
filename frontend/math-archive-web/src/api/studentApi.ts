import { apiBaseUrl } from "./apiConfig";
import { httpClient } from "./httpClient";
import type { AttemptRow } from "../types/testing";
export interface StudentProfile { id: string; firstName: string; lastName: string; grade: number; createdAt: string; lastLoginAt: string | null; isActive: boolean; authenticationMethods?: string[] }
export interface StudentLogin { firstName: string; lastName: string; grade: number; pin: string }
export interface StudentHistory { id: string; testId: string; testTitle: string; attemptNumber: number; status: "InProgress" | "Completed" | "Expired"; startedAt: string; completedAt: string | null; earnedPoints: number | null; maximumPoints: number | null; percentage: number | null; passed: boolean | null }
export interface StudentAccess { resumeAttemptId: string | null; previousAttemptId: string | null; canStart: boolean }
export interface StudentSummary { student: StudentProfile; completedAttempts: number; completedTests: number; averagePercentage: number | null }
export interface StudentStatistics { registeredStudents: number; activeStudents: number; uniqueStudents: number; completedAttempts: number; averagePercentage: number; performance: { studentId: string; testId: string; studentName: string; testTitle: string; attempts: number; firstPercentage: number; latestPercentage: number; bestPercentage: number }[] }
export const studentRequest = { baseURL: import.meta.env.PROD ? "" : apiBaseUrl, withCredentials: true, headers: { "X-Student-Request": "1" } };
export interface GoogleResult { requiresProfile: boolean; student: StudentProfile | null }
export const studentApi = {
  googleChallenge: async (link = false) => (await httpClient.post<{ clientId: string; nonce: string }>(`/api/students/google/${link ? "link/challenge" : "challenge"}`, null, studentRequest)).data,
  googleAuthenticate: async (credential: string) => (await httpClient.post<GoogleResult>("/api/students/google/authenticate", { credential }, studentRequest)).data,
  googlePending: async (signal?: AbortSignal) => (await httpClient.get<{ firstName: string; lastName: string }>("/api/students/google/pending", { ...studentRequest, signal })).data,
  googleComplete: async (input: { firstName: string; lastName: string; grade: number }) => (await httpClient.post<StudentProfile>("/api/students/google/complete", input, studentRequest)).data,
  me: async (signal?: AbortSignal): Promise<StudentProfile | null> => {
    try { return (await httpClient.get<StudentProfile>("/api/students/me", { ...studentRequest, signal })).data; }
    catch (e) { if ((e as {status?: number}).status === 401) return null; throw e; }
  },
  login: async (input: StudentLogin) => (await httpClient.post<StudentProfile>("/api/students/login", input, studentRequest)).data,
  register: async (input: StudentLogin & { confirmPin: string }) => (await httpClient.post<StudentProfile>("/api/students/register", input, studentRequest)).data,
  logout: async () => { await httpClient.post("/api/students/logout", null, studentRequest); },
  history: async (signal?: AbortSignal) => (await httpClient.get<StudentHistory[]>("/api/students/me/attempts", { ...studentRequest, signal })).data,
  access: async (id: string, signal?: AbortSignal) => (await httpClient.get<StudentAccess>(`/api/students/me/tests/${id}/access`, { ...studentRequest, signal })).data,
  students: async (params: object) => (await httpClient.get<{ items: StudentProfile[]; totalPages: number; totalCount: number }>("/api/admin/students", { params })).data,
  summary: async (id: string) => (await httpClient.get<StudentSummary>(`/api/admin/students/${id}`)).data,
  attempts: async (id: string, page = 1) => (await httpClient.get<{ items: AttemptRow[]; totalPages: number }>(`/api/admin/students/${id}/attempts`, { params: { page } })).data,
  resetPin: async (id: string, pin: string) => { await httpClient.put(`/api/admin/students/${id}/pin`, { pin }); },
  setActive: async (id: string, isActive: boolean) => { await httpClient.put(`/api/admin/students/${id}/active`, { isActive }); },
  statistics: async (params: object) => (await httpClient.get<StudentStatistics>("/api/admin/tests/student-statistics", { params })).data,
};

