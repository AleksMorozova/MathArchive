const tokenKey = 'mathArchiveAdminToken';

export const authStorage = {
  getToken() {
    const token = localStorage.getItem(tokenKey);
    if (!token || isExpired(token)) {
      localStorage.removeItem(tokenKey);
      return null;
    }

    return token;
  },
  setToken(token: string) {
    localStorage.setItem(tokenKey, token);
  },
  clearToken() {
    localStorage.removeItem(tokenKey);
  },
  isAuthenticated() {
    return this.getToken() !== null;
  }
};

function isExpired(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
