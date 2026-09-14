import { apiBaseUrl } from './apiConfig';
import { authStorage } from './authStorage';
import { httpClient } from './httpClient';

type EventType = 'SiteVisit' | 'DocumentPreview' | 'DocumentDownload';
export interface AnalyticsReport {
  summary: { siteVisits: number; documentPreviews: number; documentDownloads: number };
  documents: { documentId: string; title: string | null; previewCount: number; downloadCount: number }[];
}

const sessionKey = 'matharchive_session_id';
let memorySessionId: string | undefined;
let siteVisitRecorded = false;

function getSessionId() {
  if (memorySessionId) return memorySessionId;
  try {
    const stored = localStorage.getItem(sessionKey);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      memorySessionId = stored;
      return stored;
    }
  } catch { /* Storage may be unavailable in private/restricted browsing. */ }
  memorySessionId = crypto.randomUUID();
  try { localStorage.setItem(sessionKey, memorySessionId); } catch { /* Reuse the in-memory ID for this page. */ }
  return memorySessionId;
}

export function trackEvent(eventType: EventType, documentId: string | null = null): void {
  // Bypass response interceptors so analytics failures never alter login state, but include the
  // existing token so the backend can ignore authenticated administrator activity.
  try {
    const token = authStorage.getToken();
    void fetch(`${apiBaseUrl}/api/analytics/events`, {
      method: 'POST', credentials: 'omit', keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ sessionId: getSessionId(), eventType, documentId })
    }).catch(() => undefined);
  } catch { /* Analytics must never interrupt navigation or file access. */ }
}

export function trackSiteVisit(): void {
  if (siteVisitRecorded) return;
  siteVisitRecorded = true;
  trackEvent('SiteVisit');
}

export async function getAnalytics(from: string, to: string, signal?: AbortSignal) {
  const response = await httpClient.get<AnalyticsReport>('/api/admin/analytics', { params: { from, to }, signal });
  return response.data;
}
