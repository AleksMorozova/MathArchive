import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupOrphanedFiles, getStorageAudit } from '../../api/storageApi';
import { StorageAuditPage } from './StorageAuditPage';

vi.mock('../../api/storageApi', () => ({ getStorageAudit: vi.fn(), cleanupOrphanedFiles: vi.fn() }));

describe('StorageAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStorageAudit).mockResolvedValue(report());
  });

  it('shows storage problems and requires confirmation before cleanup', async () => {
    const user = userEvent.setup();
    vi.mocked(cleanupOrphanedFiles).mockResolvedValue({ deletedFileCount: 1, reclaimedBytes: 2048, currentState: report({ orphanedFiles: [], reclaimableBytes: 0, isHealthy: true }) });
    renderPage();

    expect(await screen.findByText('lost.pdf')).toBeInTheDocument();
    expect(screen.getByText('orphan.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Очистити 1 осиротілих файлів/ }));
    expect(cleanupOrphanedFiles).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Очистити' }));

    await waitFor(() => expect(cleanupOrphanedFiles).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Видалено файлів: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Сховище узгоджене/)).toBeInTheDocument();
  });

  it('does not start cleanup twice while request is pending', async () => {
    const user = userEvent.setup();
    vi.mocked(cleanupOrphanedFiles).mockReturnValue(new Promise(() => undefined));
    renderPage();
    await screen.findByText('orphan.pdf');
    await user.click(screen.getByRole('button', { name: /Очистити 1 осиротілих файлів/ }));
    await user.dblClick(within(screen.getByRole('dialog')).getByRole('button', { name: 'Очистити' }));
    await waitFor(() => expect(cleanupOrphanedFiles).toHaveBeenCalledTimes(1));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Очищаємо…' })).toBeDisabled();
  });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><StorageAuditPage /></MemoryRouter></QueryClientProvider>);
}

function report(overrides = {}) {
  return {
    checkedAt: '2026-08-29T12:00:00Z', referencedFileCount: 2, storedFileCount: 2,
    storedBytes: 3072, reclaimableBytes: 2048, isHealthy: false,
    missingFiles: [{ documentId: '1', title: 'Втрачений матеріал', storedFileName: 'lost.pdf' }],
    orphanedFiles: [{ storedFileName: 'orphan.pdf', fileSize: 2048, lastModifiedAt: '2026-08-28T12:00:00Z' }],
    sizeMismatches: [], ...overrides
  };
}
