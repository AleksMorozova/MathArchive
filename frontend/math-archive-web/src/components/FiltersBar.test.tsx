import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FiltersBar } from './FiltersBar';

describe('FiltersBar', () => {
  it('emits filter changes and clear action', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClear = vi.fn();

    render(
      <FiltersBar
        filters={{ search: '', grade: '', topic: '', documentType: '', page: 1, pageSize: 12 }}
        topics={['Алгебра']}
        onChange={onChange}
        onClear={onClear}
      />
    );

    await user.type(screen.getByLabelText('Пошук матеріалів'), 'тест');
    await user.click(screen.getByText('Очистити фільтри'));

    expect(onChange).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });
  it('shows general materials as a grade filter option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FiltersBar
        filters={{ search: '', grade: '', topic: '', documentType: '', page: 1, pageSize: 12 }}
        topics={[]}
        onChange={onChange}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText('Клас'));
    await user.click(screen.getByText('Загальні матеріали'));

    expect(onChange).toHaveBeenCalledWith({ grade: 'general' });
  });
});
