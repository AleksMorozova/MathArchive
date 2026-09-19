import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminLayout } from './AdminLayout';

vi.mock('../seo/Seo', () => ({ Seo: () => null }));

describe('AdminLayout navigation', () => {
  it('places AI creation after manual creation and keeps AI usage separate', () => {
    renderLayout('/admin/documents/ai');
    const navigation = document.querySelector<HTMLElement>('.admin-sidebar')!;
    const links = within(navigation).getAllByRole('link');

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Матеріали',
      'Додати матеріал',
      'Додати з AI',
      'Сховище',
      'Статистика',
      'Використання AI'
    ]);
    expect(within(navigation).getByRole('link', { name: 'Додати з AI' })).toHaveAttribute('href', '/admin/documents/ai');
    expect(within(navigation).getByRole('link', { name: 'Використання AI' })).toHaveAttribute('href', '/admin/ai-usage');
  });

  it('marks only AI creation active on its route', () => {
    renderLayout('/admin/documents/ai');
    const navigation = document.querySelector<HTMLElement>('.admin-sidebar')!;

    expect(within(navigation).getByRole('link', { name: 'Додати з AI' })).toHaveClass('active');
    expect(within(navigation).getByRole('link', { name: 'Матеріали' })).not.toHaveClass('active');
    expect(within(navigation).getByRole('link', { name: 'Використання AI' })).not.toHaveClass('active');
  });

  it('shows the same AI creation link in the mobile drawer', async () => {
    const user = userEvent.setup();
    renderLayout('/admin/documents/ai');

    await user.click(screen.getByRole('button', { name: 'Відкрити меню' }));
    const drawer = await screen.findByRole('presentation');
    expect(within(drawer).getByRole('link', { name: 'Додати з AI' })).toHaveAttribute('href', '/admin/documents/ai');
  });
});

function renderLayout(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="documents/ai" element={<div>AI form</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
