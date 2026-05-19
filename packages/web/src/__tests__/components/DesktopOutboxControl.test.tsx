import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DesktopOutboxControl from '../../components/DesktopOutboxControl';

const conflictSnapshot = {
  summary: {
    legacyQueueCount: 0,
    syncOperationCount: 1,
    requestQueueCount: 0,
    conflictCount: 1,
    totalCount: 2,
  },
  conflicts: [
    {
      id: 'conflict-001',
      operationId: 'op-001',
      clientId: 'desktop-001',
      aggregateType: 'inventory_record',
      aggregateId: 'inv-001',
      status: 'Pending',
      localPayload: { id: 'inv-001', quantity: 8 },
      serverPayload: { id: 'inv-001', quantity: 12, version: 5 },
      resolutionPayload: null,
      createdAt: '2026-05-19T09:00:00.000Z',
      resolvedAt: null,
      operationType: 'inventory.update',
      operationStatus: 'Conflict',
      operationBaseVersion: 3,
      operationPayload: { id: 'inv-001', quantity: 8 },
      operationLastError: 'Version conflict',
      conflictCode: 'version_mismatch',
      conflictMessage: 'Version conflict',
    },
  ],
};

describe('DesktopOutboxControl', () => {
  const originalElectronAPI = window.electronAPI;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalElectronAPI) {
      window.electronAPI = originalElectronAPI;
      return;
    }

    delete window.electronAPI;
  });

  it('renders a conflict badge and opens the comparison modal', async () => {
    window.electronAPI = {
      sync: {
        push: vi.fn(),
        pull: vi.fn(),
        getStatus: vi.fn(),
        getOutbox: vi.fn().mockResolvedValue(conflictSnapshot),
        resolveConflict: vi.fn(),
      },
      network: {
        isOnline: vi.fn(() => true),
        onStatusChange: vi.fn(() => vi.fn()),
      },
    } as any;

    const user = userEvent.setup();
    render(<DesktopOutboxControl />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /outbox/i })).toBeInTheDocument();
    });

    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /outbox/i }));

    await waitFor(() => {
      expect(screen.getByText('Desktop Outbox')).toBeInTheDocument();
      expect(screen.getAllByText('Version conflict').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'Open both' }));

    expect(screen.getByText('Local version')).toBeInTheDocument();
    expect(screen.getByText('Server version')).toBeInTheDocument();
  });

  it('resolves a conflict and refreshes the outbox snapshot', async () => {
    const resolveConflict = vi.fn().mockResolvedValue({
      conflictId: 'conflict-001',
      operationId: 'op-001',
      resolution: 'keep_server',
      operationStatus: 'failed_permanent',
      aggregateId: 'inv-001',
    });
    const emptySnapshot = {
      summary: {
        legacyQueueCount: 0,
        syncOperationCount: 0,
        requestQueueCount: 0,
        conflictCount: 0,
        totalCount: 0,
      },
      conflicts: [],
    };
    const getOutbox = vi
      .fn()
      .mockResolvedValue(emptySnapshot)
      .mockResolvedValueOnce(conflictSnapshot)
      .mockResolvedValueOnce(conflictSnapshot)
      .mockResolvedValueOnce(emptySnapshot);

    window.electronAPI = {
      sync: {
        push: vi.fn(),
        pull: vi.fn(),
        getStatus: vi.fn(),
        getOutbox,
        resolveConflict,
      },
      network: {
        isOnline: vi.fn(() => true),
        onStatusChange: vi.fn(() => vi.fn()),
      },
    } as any;

    const user = userEvent.setup();
    render(<DesktopOutboxControl />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /outbox/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /outbox/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Keep server' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Keep server' }));

    await waitFor(() => {
      expect(resolveConflict).toHaveBeenCalledWith('conflict-001', 'keep_server');
    });

    await waitFor(() => {
      expect(screen.getByText('No unresolved sync conflicts.')).toBeInTheDocument();
      expect(screen.getByText('Conflict resolved. Operation marked failed permanent.')).toBeInTheDocument();
    });
  });
});
