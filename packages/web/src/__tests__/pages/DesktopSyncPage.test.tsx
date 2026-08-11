import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DesktopSyncPage from '../../pages/DesktopSyncPage';

const refreshSyncTokenMock = vi.fn();

vi.mock('../../api/client', () => ({
  authApi: {
    refreshSyncToken: (...args: unknown[]) => refreshSyncTokenMock(...args),
  },
}));

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
        syncOperationCount: 1,
        requestQueueCount: 1,
        conflictCount: 1,
        totalCount: 3,
      },
      conflicts: [],
    },
    desktopBuildInfo: {
      packageName: 'jingles-inventory-desktop',
      appVersion: '1.0.1',
      buildNumber: '101',
      commitHash: 'desktop-commit-hash',
      commitShortHash: 'desktophash',
      builtAt: '2026-05-19T09:05:00.000Z',
    },
    runtimeInfo: {
      mode: 'local_replica',
      build: {
        packageName: '@jingles/backend',
        appVersion: '1.0.1',
        buildNumber: '101',
        commitHash: 'desktop-commit-hash',
        commitShortHash: 'desktophash',
        builtAt: '2026-05-19T09:05:00.000Z',
      },
      upstream: {
        url: 'https://inv.theredsun.org',
        build: {
          packageName: '@jingles/backend',
          appVersion: '1.0.1',
          buildNumber: '101',
          commitHash: 'desktop-commit-hash',
          commitShortHash: 'desktophash',
          builtAt: '2026-05-19T09:05:00.000Z',
        },
        error: null,
      },
    },
    logs: [
      {
        id: 1,
        timestamp: '2026-05-19T09:06:00.000Z',
        source: 'backend',
        level: 'info',
        message: 'Replica realtime listener connected',
      },
    ],
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
    app: {
      backendUrl: 'http://127.0.0.1:3630',
      version: vi.fn().mockResolvedValue('1.0.1'),
      getBuildInfo: vi.fn().mockResolvedValue(state.desktopBuildInfo),
      getRuntimeInfo: vi.fn().mockResolvedValue(state.runtimeInfo),
      openExternal: vi.fn().mockResolvedValue(undefined),
      setAuthCache: vi.fn().mockResolvedValue(undefined),
      setSyncToken: vi.fn().mockResolvedValue(undefined),
      clearAuthCache: vi.fn().mockResolvedValue(undefined),
    },
    logs: {
      list: vi.fn().mockResolvedValue(state.logs),
      clear: vi.fn().mockResolvedValue(undefined),
      onEntry: vi.fn(() => vi.fn()),
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
    refreshSyncTokenMock.mockReset();
  });

  afterEach(() => {
    if (originalElectronAPI) {
      window.electronAPI = originalElectronAPI;
      return;
    }

    delete window.electronAPI;
  });

  it('renders database details, build comparison, and desktop sync controls', async () => {
    installElectronAPI();

    render(<DesktopSyncPage />);

    await waitFor(() => {
      expect(screen.getByText('Sync and local database')).toBeInTheDocument();
      expect(screen.getByText('D:/Data/jingles.sqlite')).toBeInTheDocument();
      expect(screen.getByText('Desktop versus host versions')).toBeInTheDocument();
      expect(screen.getByText('Replica realtime listener connected')).toBeInTheDocument();
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

  it('prompts for host sync credentials and retries the sync action when the host token is missing', async () => {
    const { runNow } = installElectronAPI();
    const setSyncToken = window.electronAPI?.app.setSyncToken as ReturnType<typeof vi.fn>;
    const user = userEvent.setup();

    runNow
      .mockResolvedValueOnce({
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        errors: ['No cached host sync token'],
      })
      .mockResolvedValueOnce({
        pushed: 2,
        pulled: 5,
        conflicts: 0,
        errors: [],
      });
    refreshSyncTokenMock.mockResolvedValue({
      data: {
        syncToken: 'upstream-sync-token-001',
        userId: 'user-001',
      },
    });

    render(<DesktopSyncPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sync Now' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Sync Now' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reconnect host sync' })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Host password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Refresh Host Sync' }));

    await waitFor(() => {
      expect(refreshSyncTokenMock).toHaveBeenCalledWith('password123');
      expect(setSyncToken).toHaveBeenCalledWith({
        token: 'upstream-sync-token-001',
        userId: 'user-001',
      });
      expect(runNow).toHaveBeenCalledTimes(2);
      expect(
        screen.getByText('Full sync finished. Pushed 2, pulled 5, conflicts 0.')
      ).toBeInTheDocument();
    });
  });
});
