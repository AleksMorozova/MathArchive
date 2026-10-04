import type { AiUsageFilters, AiUsageHistory, AiUsageSummary, GeneratedPosterResult, MaterialAnalysisResult } from '../types/ai';
import { httpClient } from './httpClient';

export async function analyzeMaterial(file: File, signal?: AbortSignal) {
  const data = new FormData();
  data.append('file', file);
  const response = await httpClient.post<MaterialAnalysisResult>('/api/admin/materials/analyze', data, {
    signal, headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
}

export async function transformImagePoster(file: File, signal?: AbortSignal): Promise<GeneratedPosterResult> {
  const data = new FormData();
  data.append('file', file);
  const response = await httpClient.post<Blob>('/api/admin/image-poster/transform', data, {
    signal,
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'blob'
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  const encodedName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  return {
    image: response.data,
    fileName: encodedName ? decodeURIComponent(encodedName) : quotedName ?? 'matharchive-poster.png'
  };
}

export async function getAiUsageSummary(filters: Omit<AiUsageFilters, 'page' | 'pageSize'>, signal?: AbortSignal) {
  const response = await httpClient.get<AiUsageSummary>('/api/admin/ai-usage/summary', { signal, params: filters });
  return response.data;
}

export async function getAiUsageHistory(filters: AiUsageFilters, signal?: AbortSignal) {
  const response = await httpClient.get<AiUsageHistory>('/api/admin/ai-usage/history', { signal, params: filters });
  return response.data;
}

// Student assistant and its admin controls share the established Axios/error pipeline.
export async function getAssistantStatus(signal?: AbortSignal) {
  return (await httpClient.get<{ enabled: boolean; maxPromptLength: number }>('/api/assistant/status', { signal })).data;
}
export async function askAssistant(question: string, grade?: number, topic?: string, signal?: AbortSignal) {
  return (await httpClient.post<import('../types/assistant').AssistantAnswer>('/api/assistant/query', { question, grade, topic }, { signal, timeout: 125000 })).data;
}
export async function getAssistantSettings(signal?: AbortSignal) {
  return (await httpClient.get<import('../types/assistant').AssistantSettings>('/api/admin/assistant/settings', { signal })).data;
}
export async function saveAssistantSettings(settings: import('../types/assistant').AssistantSettings) {
  await httpClient.put('/api/admin/assistant/settings', settings);
}
export async function getAssistantStatistics(range: { from: string; to: string }, signal?: AbortSignal) {
  return (await httpClient.get<import('../types/assistant').AssistantStatistics>('/api/admin/assistant/statistics', { params: range, signal })).data;
}
export async function getAssistantRequests(range: { from: string; to: string }, page: number, signal?: AbortSignal) {
  return (await httpClient.get<import('../types/assistant').AssistantRequestItem[]>('/api/admin/assistant/requests', { params: { ...range, page }, signal })).data;
}
export async function getAssistantRequest(id: string, signal?: AbortSignal) {
  return (await httpClient.get<import('../types/assistant').AssistantRequestDetail>(`/api/admin/assistant/requests/${id}`, { signal })).data;
}
export async function getAssistantDailyBudget(signal?: AbortSignal) {
  return (await httpClient.get<import('../types/assistant').DailyBudget>('/api/admin/assistant/daily-budget', { signal })).data;
}
export async function getRagStatus(signal?: AbortSignal) {
  return (await httpClient.get<import('../types/assistant').RagStatus>('/api/admin/assistant/rag/status', { signal })).data;
}
export async function reindexRag() {
  await httpClient.post('/api/admin/assistant/rag/reindex', undefined, { timeout: 600000 });
}
export async function scheduleRagIndexing(id?: string) {
  await httpClient.post(id ? `/api/admin/assistant/rag/materials/${id}/retry` : '/api/admin/assistant/rag/pending');
}
export async function saveRagText(id: string, text: string) {
  await httpClient.put(`/api/admin/assistant/rag/materials/${id}/text`, { text }, { timeout: 125000 });
}
export async function getRagText(id: string, signal?: AbortSignal) {
  return (await httpClient.get<import('../types/assistant').RagText>(`/api/admin/assistant/rag/materials/${id}/text`, { signal })).data;
}
export async function extractRagVision(id?: string) {
  await httpClient.post(id ? `/api/admin/assistant/rag/materials/${id}/vision` : '/api/admin/assistant/rag/vision', undefined, { timeout: 600000 });
}
