function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (import.meta.env.PROD && !configuredApiBaseUrl) {
  throw new Error('VITE_API_BASE_URL must be configured for production builds.');
}

export const apiBaseUrl = normalizeApiBaseUrl(configuredApiBaseUrl ?? 'http://localhost:5293');

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
