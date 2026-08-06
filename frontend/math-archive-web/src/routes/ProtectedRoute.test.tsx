import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { authStorage } from '../api/authStorage';
import { ProtectedRoute } from './ProtectedRoute';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authStorage.clearToken();
  });

  it('redirects unauthenticated users to login', () => {
    render(
      <MemoryRouter initialEntries={['/admin/documents']}>
        <Routes>
          <Route path="/admin/login" element={<p>Вхід до панелі керування</p>} />
          <Route path="/admin/documents" element={<ProtectedRoute><p>Матеріали</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Вхід до панелі керування')).toBeInTheDocument();
  });
});
