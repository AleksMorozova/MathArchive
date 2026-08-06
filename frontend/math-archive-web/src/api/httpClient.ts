import axios from 'axios';
import { apiBaseUrl } from './apiConfig';
import { authStorage } from './authStorage';

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
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clearToken();
      if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
        window.location.assign('/admin/login');
      }
    }

    return Promise.reject(error);
  }
);
