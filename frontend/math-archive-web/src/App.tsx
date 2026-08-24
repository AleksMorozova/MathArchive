import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AboutPage } from './pages/AboutPage';
import { AdminDocumentsPage } from './pages/admin/AdminDocumentsPage';
import { DocumentFormPage } from './pages/admin/DocumentFormPage';
import { LoginPage } from './pages/admin/LoginPage';
import { DocumentDetailsPage } from './pages/DocumentDetailsPage';
import { HomePage } from './pages/HomePage';
import { MaterialsPage } from './pages/MaterialsPage';
import { NotFoundPage } from './pages/NotFoundPage';

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
  return <RouterProvider router={router} />;
}
