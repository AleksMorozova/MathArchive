import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DocumentDto } from '../../types/documents';
import { saveBlob } from '../../utils/saveBlob';
import { MaterialQrDialog } from './MaterialQrDialog';

vi.mock('../../utils/saveBlob', () => ({ saveBlob: vi.fn() }));

const material: DocumentDto = {
  id: '12345678-1234-4234-8234-123456789abc',
  title: 'Пам’ятка з геометрії',
  grade: 7,
  topic: 'Геометрія',
  documentType: 'Memo',
  originalFileName: 'geometry.pdf',
  contentType: 'application/pdf',
  fileSize: 100,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  downloadCount: 0,
  displayOrder: 0
};
const publicUrl = `https://morozovamath.com/materials/${material.id}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => vi.restoreAllMocks());

it('uses the same canonical URL after editing the title, file and metadata and copies it', async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');
  const { rerender } = render(<MaterialQrDialog material={material} onClose={vi.fn()} />);
  expect(screen.getByRole('link')).toHaveAttribute('href', publicUrl);
  const changed = { ...material, title: 'Оновлена пам’ятка', originalFileName: 'replacement.pdf', grade: null };
  rerender(<MaterialQrDialog material={changed} onClose={vi.fn()} />);
  expect(screen.getByRole('link')).toHaveAttribute('href', publicUrl);
  await user.click(screen.getByRole('button', { name: 'Копіювати посилання' }));
  expect(writeText).toHaveBeenCalledWith(publicUrl);
  expect(await screen.findByRole('status')).toHaveTextContent('Посилання скопійовано.');
  writeText.mockRejectedValueOnce(new Error());
  await user.click(screen.getByRole('button', { name: 'Копіювати посилання' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Скопіюйте його вручну.');
});

it('downloads a 1024px PNG and a self-contained vector SVG with safe filenames', async () => {
  const user = userEvent.setup();
  const png = new Blob(['png'], { type: 'image/png' });
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    expect(this.width).toBe(1024);
    expect(this.height).toBe(1024);
    callback(png);
  });
  render(<MaterialQrDialog material={material} onClose={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Завантажити PNG' }));
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  expect(saveBlob).toHaveBeenCalledWith(png, `matharchive-qr-${material.id}.png`);

  await user.click(screen.getByRole('button', { name: 'Завантажити SVG' }));
  const [svg, name] = vi.mocked(saveBlob).mock.calls[1];
  expect(svg.type).toBe('image/svg+xml');
  expect(name).toBe(`matharchive-qr-${material.id}.svg`);
  const xml = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(svg);
  });
  const image = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
  expect(image.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(image.querySelector('path[fill="#102F5B"]')).toBeTruthy();
  expect(image.querySelector('path[fill="#FFFFFF"]')).toBeTruthy();
  expect(image.querySelector('[href]')).toBeNull();

  toBlob.mockImplementationOnce((callback) => callback(null));
  await user.click(screen.getByRole('button', { name: 'Завантажити PNG' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося завантажити QR-код');
  expect(saveBlob).toHaveBeenCalledTimes(2);
});

it.each([
  [{ id: '' }, 'Не вдалося визначити посилання'],
  [{ id: '../admin' }, 'Не вдалося визначити посилання'],
  [{ documentType: 'InteractiveTrainer', trainerPublished: false } as const, 'Опублікуйте тренажер']
])('withholds the QR and its actions when the material is unavailable', (overrides, warning) => {
  render(<MaterialQrDialog material={{ ...material, ...overrides }} onClose={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent(warning);
  expect(screen.queryByRole('img', { name: /QR-код/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Завантажити PNG' })).not.toBeInTheDocument();
});
