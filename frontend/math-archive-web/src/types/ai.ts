import type { DocumentType, PagedResult } from './documents';

export interface FieldConfidence { title: number | null; grade: number | null; topic: number | null; type: number | null }
export interface MaterialAnalysisResult {
  title: string | null; grade: number | null; topic: string | null; documentType: DocumentType | null;
  description: string | null; confidence: FieldConfidence; requiresReview: boolean;
}
export type AiRequestStatus = 'Succeeded' | 'Failed' | 'TimedOut' | 'Cancelled';
export interface AiUsageSummary {
  requestsToday: number; requestsThisMonth: number; succeeded: number; failed: number;
  inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostThisMonthUsd: number | null;
  averageDurationMilliseconds: number | null; monthlyWarningLimitUsd: number | null; limitUsagePercent: number;
  limitReached: boolean; isBlocked: boolean;
}
export interface AiUsageItem {
  id: string; startedAt: string; operation: string; model: string; status: AiRequestStatus;
  inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  durationMilliseconds: number; estimatedCostUsd: number | null;
}
export interface AiUsageFilters { from?: string; to?: string; status?: string; model?: string; operation?: string; page: number; pageSize: number }
export type AiUsageHistory = PagedResult<AiUsageItem>;
