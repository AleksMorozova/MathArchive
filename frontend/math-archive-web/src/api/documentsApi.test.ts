import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './apiErrors';
import { downloadDocument, getDocuments } from './documentsApi';
import { httpClient } from './httpClient';

const originalAdapter = httpClient.defaults.adapter;

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('documentsApi', () => {
  it('returns data for a successful request', async () => {
    httpClient.defaults.adapter = resolveAdapter({
      items: [],
      page: 1,
      pageSize: 12,
      totalCount: 0,
      totalPages: 0
    });

    await expect(getDocuments({ page: 1, pageSize: 12 })).resolves.toMatchObject({ totalCount: 0 });
  });


  it('sends generalOnly instead of a fake grade for general materials', async () => {
    let requestConfig: InternalAxiosRequestConfig | undefined;
    httpClient.defaults.adapter = async (config) => {
      requestConfig = config as InternalAxiosRequestConfig;
      return {
        data: { items: [], page: 1, pageSize: 12, totalCount: 0, totalPages: 0 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config as InternalAxiosRequestConfig
      };
    };

    await getDocuments({ page: 1, pageSize: 12, grade: 'general' });

    expect(requestConfig?.params).toMatchObject({ generalOnly: true, grade: undefined });
  });

  it('sends class, search, and pagination parameters together', async () => {
    let requestConfig: InternalAxiosRequestConfig | undefined;
    httpClient.defaults.adapter = async (config) => {
      requestConfig = config as InternalAxiosRequestConfig;
      return {
        data: { items: [], page: 2, pageSize: 12, totalCount: 13, totalPages: 2 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config as InternalAxiosRequestConfig
      };
    };

    await getDocuments({ page: 2, pageSize: 12, grade: '7', search: 'Геометрія' });

    expect(requestConfig?.params).toMatchObject({
      grade: '7',
      search: 'Геометрія',
      topic: undefined,
      page: 2,
      pageSize: 12
    });
  });

  it('downloads binary file content on success', async () => {
    const blob = new Blob(['file-content'], { type: 'application/pdf' });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:material');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    httpClient.defaults.adapter = resolveAdapter(blob, {
      'content-disposition': 'attachment; filename="algebra.pdf"'
    });

    await downloadDocument('document-id');

    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:material');
  });

  it('parses ProblemDetails returned from a failed file download', async () => {
    const problemBlob = new Blob([
      JSON.stringify({
        title: 'Material file not found',
        status: 404,
        detail: 'The file associated with this material is unavailable.',
        traceId: 'trace-1'
      })
    ], { type: 'application/problem+json' });

    httpClient.defaults.adapter = rejectAdapter(404, problemBlob);

    await expect(downloadDocument('missing-file-id')).rejects.toMatchObject({
      status: 404,
      message: 'Файл тимчасово недоступний.'
    });
  });
});

function resolveAdapter(data: unknown, headers: Record<string, string> = {}): AxiosAdapter {
  return async (config) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers,
    config: config as InternalAxiosRequestConfig
  });
}

function rejectAdapter(status: number, data: unknown): AxiosAdapter {
  return async (config) => {
    const response: AxiosResponse = {
      data,
      status,
      statusText: 'Error',
      headers: { 'content-type': data instanceof Blob ? data.type : 'application/problem+json' },
      config: config as InternalAxiosRequestConfig
    };

    return Promise.reject({
      isAxiosError: true,
      response
    });
  };
}
