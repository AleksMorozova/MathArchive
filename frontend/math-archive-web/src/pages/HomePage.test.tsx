import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders the compact hero and class navigation shortcuts', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.queryByText('Бібліотека навчальних матеріалів')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Морозова Тетяна Володимирівна' })).toBeInTheDocument();
    expect(screen.getByText('Вчитель математики з понад 30-річним досвідом')).toBeInTheDocument();
    expect(screen.getByText('Ліцей №23 «Соборний» ДМР')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Навчальні матеріали з математики' })).toBeInTheDocument();
    expect(screen.getByText('Формули, контрольні та самостійні роботи, пам’ятки й методичні матеріали для учнів і вчителів.')).toBeInTheDocument();
    expect(document.querySelector('.teacher-summary-card')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Переглянути матеріали/ })).toHaveAttribute('href', '/materials');
    expect(screen.queryByText('Для вчителів')).not.toBeInTheDocument();
    expect(screen.queryByText('Про сайт')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'За класом' })).not.toBeInTheDocument();

    const classNavigation = screen.getByLabelText('Навігація за класом');

    const links = within(classNavigation).getAllByRole('link');
    expect(links).toHaveLength(8);
    expect(within(classNavigation).getByRole('link', { name: '5 клас' })).toHaveAttribute('href', '/materials?class=5');
    expect(within(classNavigation).getByRole('link', { name: '7 клас' })).toHaveAttribute('href', '/materials?class=7');
    expect(within(classNavigation).getByRole('link', { name: '11 клас' })).toHaveAttribute('href', '/materials?class=11');
    expect(within(classNavigation).getByRole('link', { name: 'Загальні матеріали' })).toHaveAttribute('href', '/materials?class=general');
  });
});
