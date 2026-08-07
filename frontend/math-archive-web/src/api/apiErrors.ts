import axios from 'axios';

export interface ApiProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  status?: number;
  problem?: ApiProblemDetails;
  isNetworkError: boolean;
  isCanceled: boolean;

  constructor(message: string, options: { status?: number; problem?: ApiProblemDetails; isNetworkError?: boolean; isCanceled?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.problem = options.problem;
    this.isNetworkError = options.isNetworkError ?? false;
    this.isCanceled = options.isCanceled ?? false;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function normalizeApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED')) {
    return new ApiError('Запит було скасовано.', { isCanceled: true });
  }

  if (axios.isAxiosError(error)) {
    const problem = parseProblemDetails(error.response?.data);
    const status = problem?.status ?? error.response?.status;

    if (!error.response) {
      return new ApiError('Не вдалося підключитися до сервера. Спробуйте ще раз.', { isNetworkError: true });
    }

    return new ApiError(getMessageForStatus(status, problem), { status, problem });
  }

  return new ApiError('Щось пішло не так. Спробуйте пізніше.');
}

export async function normalizeApiErrorAsync(error: unknown): Promise<ApiError> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    const problem = await parseProblemDetailsBlob(error.response.data);
    const status = problem?.status ?? error.response.status;
    return new ApiError(getMessageForStatus(status, problem), { status, problem });
  }

  return normalizeApiError(error);
}

export function parseProblemDetails(data: unknown): ApiProblemDetails | undefined {
  if (!data) {
    return undefined;
  }

  if (typeof data === 'string') {
    try {
      return parseProblemDetails(JSON.parse(data));
    } catch {
      return undefined;
    }
  }

  if (typeof data !== 'object' || data instanceof Blob) {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const problem: ApiProblemDetails = {};

  if (typeof record.type === 'string') problem.type = record.type;
  if (typeof record.title === 'string') problem.title = record.title;
  if (typeof record.status === 'number') problem.status = record.status;
  if (typeof record.detail === 'string') problem.detail = record.detail;
  if (typeof record.instance === 'string') problem.instance = record.instance;
  if (typeof record.traceId === 'string') problem.traceId = record.traceId;
  if (isValidationErrors(record.errors)) problem.errors = record.errors;

  return Object.keys(problem).length > 0 ? problem : undefined;
}

export async function parseProblemDetailsBlob(blob: Blob): Promise<ApiProblemDetails | undefined> {
  if (!isJsonContentType(blob.type)) {
    return undefined;
  }

  return parseProblemDetails(await readBlobText(blob));
}

export function getApiErrorMessage(error: unknown, fallback = 'Щось пішло не так. Спробуйте пізніше.') {
  const apiError = isApiError(error) ? error : undefined;
  const status = apiError?.status;
  const problem = apiError?.problem;

  if (apiError?.isCanceled) {
    return 'Запит було скасовано.';
  }

  if (apiError?.isNetworkError) {
    return 'Не вдалося підключитися до сервера. Спробуйте ще раз.';
  }

  return getMessageForStatus(status, problem, fallback);
}

export function hasValidationErrors(problem: ApiProblemDetails | undefined): problem is ApiProblemDetails & { errors: Record<string, string[]> } {
  return Boolean(problem?.errors && Object.keys(problem.errors).length > 0);
}

export function fieldNameFromProblemDetails(propertyName: string) {
  return propertyName.charAt(0).toLowerCase() + propertyName.slice(1);
}


function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read error response.'));
    reader.readAsText(blob);
  });
}
function isJsonContentType(contentType: string) {
  return contentType.includes('application/json') || contentType.includes('application/problem+json');
}

function isValidationErrors(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((messages) => Array.isArray(messages) && messages.every((message) => typeof message === 'string'));
}
function getMessageForStatus(status: number | undefined, problem: ApiProblemDetails | undefined, fallback = 'Щось пішло не так. Спробуйте пізніше.') {
  if (problem?.title === 'Material file not found') {
    return 'Файл тимчасово недоступний.';
  }

  if (status === 400) {
    return hasValidationErrors(problem) ? 'Перевірте введені дані.' : 'Запит містить помилку.';
  }

  if (status === 401) {
    return 'Потрібно увійти в систему.';
  }

  if (status === 403) {
    return 'У вас немає доступу до цієї дії.';
  }

  if (status === 404) {
    return 'Матеріал не знайдено.';
  }

  if (status === 409) {
    return 'Дані було змінено. Оновіть сторінку та спробуйте ще раз.';
  }

  if (status && status >= 500) {
    return 'Щось пішло не так. Спробуйте пізніше.';
  }

  return fallback;
}