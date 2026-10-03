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
