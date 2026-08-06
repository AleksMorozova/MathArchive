import { authStorage } from './authStorage';
import { httpClient } from './httpClient';

export async function login(username: string, password: string) {
  const response = await httpClient.post<{ token: string }>('/api/auth/login', { username, password });
  authStorage.setToken(response.data.token);
}

export function logout() {
  authStorage.clearToken();
}
