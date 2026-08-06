import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DocumentFormPage } from './DocumentFormPage';

describe('DocumentFormPage', () => {
  it('shows Ukrainian validation messages for required fields', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DocumentFormPage mode="create" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Введіть назву матеріалу')).toBeInTheDocument();
    expect(screen.getByText('Вкажіть тему')).toBeInTheDocument();
    expect(screen.getAllByText('Оберіть файл').length).toBeGreaterThan(0);
  });
});
