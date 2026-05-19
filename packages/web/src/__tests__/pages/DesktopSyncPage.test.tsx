import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DesktopSyncPage from '../../pages/DesktopSyncPage';

function createDesktopSyncState() {
  return {
    databaseInfo: {
      currentPath: 'D:/Data/jingles.sqlite',
      defaultPath: 'D:/Default/jingles.sqlite',
      directory: 'D:/Data',
      exists: true,
      sizeBytes: 4096,
      lastModifiedAt: '2026-05-19T09:00:00.000Z',
      usesCustomPath: true,
    },
    syncStatus: {
      configured: true,
      running: false,
      serverUrl: 'https://inv.theredsun.org',
      clientId: 'desktop-1',
      autoSyncIntervalMs: 30000,
      websocketConnected: true,
      lastStartedAt: '2026-05-19T09:01:00.000Z',
      lastCompletedAt: '2026-05-19T09:02:00.000Z',
      lastSuccessfulSyncAt: '2026-05-19T09:02:00.000Z',
      lastRealtimeEventAt: '2026-05-19T09:02:30.000Z',
      lastRealtimeError: null,
      outbox: {
        pending: 2,
        conflicts: 1,
        failedPermanent: 0,
      },
      failedPermanentPolicy: {
        mode: 'auto_keep_server',
        retainDays: 7,
      },
      lastResult: {
        pushed: 2,
        pulled: 5,
        conflicts: 0,
        errors: [],
      },
      progress: null,
    },
    syncHealth: {
      pendingCount: 2,
      conflictCount: 1,
      failedPermanentCount: 0,
      lastSuccessfulSyncAt: '2026-05-19T09:02:00.000Z',
      lastSyncError: null,
      lastRealtimeError: null,
      running: false,
      websocketConnected: true,
      cursorLag: 0,
      localCursor: 10,
      latestServerSeq: 10,
      failedPermanentPolicy: {
        mode: 'auto_keep_server',
        retainDays: 7,
      },
      progress: null,
    },
    outboxSnapshot: {
      summary: {
        legacyQueueCount: 0,
        syncOperationCount: 1,
        requestQueueCount: 1,
        conflictCount: 1,
        totalCount: 3,
      },
      conflicts: [],
    },
  };
}

function installElectronAPI() {
  const state = createDesktopSyncState();
  const runNow = vi.fn().mockResolvedValue({
    pushed: 2,
    pulled: 5,
    conflicts: 0,
    errors: [],
  });
  const pushOnly = vi.fn().mockResolvedValue({
    pushed: 2,
    pulled: 0,
    conflicts: 0,
    errors: [],
  });
  const pullOnly = vi.fn().mockResolvedValue({
    pushed: 0,
    pulled: 5,
    conflicts: 0,
    errors: [],
  });
  const switchFile = vi.fn().mockResolvedValue({
    canceled: false,
    mode: 'new',
    selectedPath: 'D:/Data/new.sqlite',
    relaunching: true,
  });

  window.electronAPI = {
    db: {
      getInfo: vi.fn().mockResolvedValue(state.databaseInfo),
      backup: vi.fn().mockResolvedValue({
        canceled: false,
        backupPath: 'D:/Backups/jingles.sqlite',
        sizeBytes: 4096,
      }),
      switchFile,
      revealFile: vi.fn().mockResolvedValue(undefined),
    },
    sync: {
      runNow,
      pushOnly,
      pullOnly,
      push: vi.fn(),
      pull: vi.fn(),
      getStatus: vi.fn().mockResolvedValue(state.syncStatus),
      getHealth: vi.fn().mockResolvedValue(state.syncHealth),
      onHealthChanged: vi.fn(() => vi.fn()),
      getOutbox: vi.fn().mockResolvedValue(state.outboxSnapshot),
      resolveConflict: vi.fn(),
    },
    network: {
      isOnline: vi.fn(() => true),
      onStatusChange: vi.fn(() => vi.fn()),
    },
  } as any;

  return {
    runNow,
    pushOnly,
    pullOnly,
    switchFile,
  };
}

describe('DesktopSyncPage', () => {
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

  it('renders database details and desktop sync controls', async () => {
    installElectronAPI();

    render(<DesktopSyncPage />);

    await waitFor(() => {
      expect(screen.getByText('Sync and local database')).toBeInTheDocument();
      expect(screen.getByText('D:/Data/jingles.sqlite')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sync Now' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Manual Forward Only Sync' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Manual Backward Only Sync' })).toBeInTheDocument();
    });
  });

  it('wires the explicit one-way sync and switch-file actions', async () => {
    const { pushOnly, switchFile } = installElectronAPI();
    const user = userEvent.setup();

    render(<DesktopSyncPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Manual Forward Only Sync' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Manual Forward Only Sync' }));

    await waitFor(() => {
      expect(pushOnly).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Forward-only sync finished. Pushed 2, pulled 0, conflicts 0.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Switch To New File' }));

    await waitFor(() => {
      expect(switchFile).toHaveBeenCalledWith('new');
    });
  });
});
