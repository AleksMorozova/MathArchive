import type { AiUsageFilters, AiUsageHistory, AiUsageSummary, MaterialAnalysisResult } from '../types/ai';
import { httpClient } from './httpClient';

export async function analyzeMaterial(file: File, signal?: AbortSignal) {
  const data = new FormData();
  data.append('file', file);
  const response = await httpClient.post<MaterialAnalysisResult>('/api/admin/materials/analyze', data, {
    signal, headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
}

export async function getAiUsageSummary(signal?: AbortSignal) {
  const response = await httpClient.get<AiUsageSummary>('/api/admin/ai-usage/summary', { signal });
  return response.data;
}

export async function getAiUsageHistory(filters: AiUsageFilters, signal?: AbortSignal) {
  const response = await httpClient.get<AiUsageHistory>('/api/admin/ai-usage/history', { signal, params: filters });
  return response.data;
}
