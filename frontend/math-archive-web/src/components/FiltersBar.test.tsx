import { fireEvent, render, screen } from '@testing-library/react';
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

  it('can hide material type and limit public class options', () => {
    render(
      <FiltersBar
        filters={{ search: '', grade: '', topic: '', documentType: '', page: 1, pageSize: 12 }}
        topics={['Алгебра']}
        onChange={vi.fn()}
        onClear={vi.fn()}
        showSearch={false}
        showDocumentType={false}
        gradeOptions={[5, 6, 7, 8, 9, 10, 11]}
      />
    );

    expect(screen.queryByLabelText('Тип матеріалу')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Пошук матеріалів')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Клас')).toBeInTheDocument();
    expect(screen.getByLabelText('Тема')).toBeInTheDocument();
  });

  it('can render topic as a text input for partial topic search', async () => {
    const onChange = vi.fn();

    render(
      <FiltersBar
        filters={{ search: '', grade: '', topic: '', documentType: '', page: 1, pageSize: 12 }}
        topics={[]}
        onChange={onChange}
        onClear={vi.fn()}
        showSearch={false}
        showDocumentType={false}
        topicMode="text"
      />
    );

    fireEvent.change(screen.getByLabelText('Пошук за темою'), { target: { value: 'геом' } });

    expect(screen.queryByLabelText('Тема')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ topic: 'геом' });
  });
});
