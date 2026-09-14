import axios from 'axios';
import { apiBaseUrl } from './apiConfig';
import { authStorage } from './authStorage';
import { normalizeApiErrorAsync } from './apiErrors';

export const httpClient = axios.create({
  baseURL: apiBaseUrl
});

httpClient.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const apiError = await normalizeApiErrorAsync(error);

    if (apiError.status === 401) {
      authStorage.clearToken();
      if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
        window.location.assign('/admin/login');
      }
    }

    return Promise.reject(apiError);
  }
);