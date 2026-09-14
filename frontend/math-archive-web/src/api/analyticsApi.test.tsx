import { StrictMode, useEffect } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('analytics dispatch', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('records one site opening across StrictMode and repeated mounts, but another after reload', async () => {
    const { trackSiteVisit } = await import('./analyticsApi');
    function Opening() { useEffect(() => { trackSiteVisit(); }, []); return null; }
    const first = render(<StrictMode><Opening /></StrictMode>);
    first.rerender(<StrictMode><Opening /></StrictMode>);
    first.unmount();
    render(<Opening />);
    expect(fetch).toHaveBeenCalledTimes(1);
    const sessionId = localStorage.getItem('matharchive_session_id');
    vi.resetModules();
    (await import('./analyticsApi')).trackSiteVisit();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).sessionId).toBe(sessionId);
  });

  it('reuses the anonymous UUID and sends only event fields, without credentials or authorization', async () => {
    const { trackEvent } = await import('./analyticsApi');
    trackEvent('DocumentPreview', 'document-id');
    trackEvent('DocumentDownload', 'document-id');
    const payloads = vi.mocked(fetch).mock.calls.map(([, options]) => {
      expect(options!.credentials).toBe('omit');
      expect(options!.headers).toEqual({ 'Content-Type': 'application/json' });
      return JSON.parse(options!.body as string);
    });
    expect(payloads[0]).toEqual({ sessionId: localStorage.getItem('matharchive_session_id'), eventType: 'DocumentPreview', documentId: 'document-id' });
    expect(payloads[1]).toEqual({ ...payloads[0], eventType: 'DocumentDownload' });
  });

  it('includes the existing administrator token so the backend can ignore the event', async () => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const token = `header.${payload}.signature`;
    localStorage.setItem('mathArchiveAdminToken', token);
    const { trackEvent } = await import('./analyticsApi');

    trackEvent('SiteVisit');

    expect(vi.mocked(fetch).mock.calls[0][1]!.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    });
  });

  it('does not throw when storage, network, or fetch fail', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const { trackEvent } = await import('./analyticsApi');
    expect(() => trackEvent('SiteVisit')).not.toThrow();
    await Promise.resolve();
    vi.mocked(fetch).mockImplementation(() => { throw new Error('failed'); });
    expect(() => trackEvent('DocumentDownload', 'id')).not.toThrow();
  });
});
