import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../api/documentsApi';
import { DocumentFormPage } from './DocumentFormPage';

vi.mock('../../api/documentsApi', () => ({
  createDocument: vi.fn(async () => ({ id: 'document-id' })),
  updateDocument: vi.fn(),
  getDocument: vi.fn()
}));

describe('DocumentFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Ukrainian validation messages for required fields', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();

    renderForm(queryClient);

    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Введіть назву матеріалу')).toBeInTheDocument();
    expect(screen.getByText('Вкажіть тему')).toBeInTheDocument();
    expect(screen.getAllByText('Оберіть файл').length).toBeGreaterThan(0);
    expect(screen.getByText('Оберіть клас')).toBeInTheDocument();
  });

  it('submits a general material without a grade field', async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();

    renderForm(queryClient);

    await user.type(screen.getByLabelText('Назва'), 'Критерії оцінювання');
    await user.type(screen.getByLabelText('Тема'), 'Оцінювання');
    await user.click(screen.getByLabelText('Призначення'));
    await user.click(screen.getByRole('option', { name: 'Загальний матеріал' }));
    await user.click(screen.getByLabelText('Тип матеріалу'));
    await user.click(screen.getByRole('option', { name: 'Методичний матеріал' }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['content'], 'criteria.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(createDocument).toHaveBeenCalled());
    const formData = vi.mocked(createDocument).mock.calls[0][0] as FormData;
    expect(formData.get('title')).toBe('Критерії оцінювання');
    expect(formData.has('grade')).toBe(false);
    expect(formData.get('documentType')).toBe('MethodicalMaterial');
  });
});

function renderForm(queryClient: QueryClient) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DocumentFormPage mode="create" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}