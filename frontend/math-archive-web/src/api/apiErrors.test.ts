import { describe, expect, it } from 'vitest';
import { ApiError, getApiErrorMessage, normalizeApiError, parseProblemDetails } from './apiErrors';

function axiosError(status: number, data: unknown) {
  return {
    isAxiosError: true,
    response: {
      status,
      data
    }
  };
}

describe('apiErrors', () => {
  it('parses RFC 7807 ProblemDetails responses', () => {
    const problem = parseProblemDetails({
      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
      title: 'Material not found',
      status: 404,
      detail: 'The requested material was not found.',
      instance: '/api/documents/1',
      traceId: 'trace-1'
    });

    expect(problem).toMatchObject({
      title: 'Material not found',
      status: 404,
      detail: 'The requested material was not found.',
      instance: '/api/documents/1',
      traceId: 'trace-1'
    });
  });

  it('preserves validation ProblemDetails errors', () => {
    const error = normalizeApiError(axiosError(400, {
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: {
        Title: ['Title is required.'],
        file: ['File is required.']
      }
    }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.problem?.errors?.Title).toEqual(['Title is required.']);
    expect(getApiErrorMessage(error)).toBe('Перевірте введені дані.');
  });

  it.each([
    [401, 'Потрібно увійти в систему.'],
    [403, 'У вас немає доступу до цієї дії.'],
    [404, 'Матеріал не знайдено.'],
    [409, 'Дані було змінено. Оновіть сторінку та спробуйте ще раз.'],
    [500, 'Щось пішло не так. Спробуйте пізніше.']
  ])('maps status %i to a safe user message', (status, message) => {
    const error = normalizeApiError(axiosError(status, { title: 'Server title', status }));

    expect(error.status).toBe(status);
    expect(getApiErrorMessage(error)).toBe(message);
  });

  it('maps missing physical file ProblemDetails to a clear download message', () => {
    const error = normalizeApiError(axiosError(404, {
      title: 'Material file not found',
      status: 404,
      detail: 'The file associated with this material is unavailable.'
    }));

    expect(getApiErrorMessage(error)).toBe('Файл тимчасово недоступний.');
  });

  it('handles network failures without turning them into backend 500 responses', () => {
    const error = normalizeApiError({ isAxiosError: true, message: 'Network Error' });

    expect(error.status).toBeUndefined();
    expect(error.isNetworkError).toBe(true);
    expect(getApiErrorMessage(error)).toBe('Не вдалося підключитися до сервера. Спробуйте ще раз.');
  });

  it('handles malformed non-ProblemDetails error responses safely', () => {
    const error = normalizeApiError(axiosError(500, '<html>failure</html>'));

    expect(error.problem).toBeUndefined();
    expect(getApiErrorMessage(error)).toBe('Щось пішло не так. Спробуйте пізніше.');
  });
});