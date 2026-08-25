import { lazy, Suspense } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AboutPage } from './pages/AboutPage';
import { DocumentDetailsPage } from './pages/DocumentDetailsPage';
import { HomePage } from './pages/HomePage';
import { MaterialsPage } from './pages/MaterialsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoadingState } from './components/StateView';

const AdminLayout = lazy(() => import('./layouts/AdminLayout').then((module) => ({ default: module.AdminLayout })));
const AdminDocumentsPage = lazy(() => import('./pages/admin/AdminDocumentsPage').then((module) => ({ default: module.AdminDocumentsPage })));
const DocumentFormPage = lazy(() => import('./pages/admin/DocumentFormPage').then((module) => ({ default: module.DocumentFormPage })));
const LoginPage = lazy(() => import('./pages/admin/LoginPage').then((module) => ({ default: module.LoginPage })));

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/materials', element: <MaterialsPage /> },
      { path: '/materials/:id', element: <DocumentDetailsPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  },
  { path: '/admin/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/documents" replace /> },
      { path: 'documents', element: <AdminDocumentsPage /> },
      { path: 'documents/new', element: <DocumentFormPage mode="create" /> },
      { path: 'documents/:id/edit', element: <DocumentFormPage mode="edit" /> }
    ]
  }
]);

export function App() {
  return (
    <Suspense fallback={<LoadingState text="Завантажуємо сторінку…" />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
