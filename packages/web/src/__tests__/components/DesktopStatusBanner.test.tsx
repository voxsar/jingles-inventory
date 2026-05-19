import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import DesktopStatusBanner from '../../components/DesktopStatusBanner';

function createHealth(overrides: Record<string, unknown> = {}) {
  return {
    pendingCount: 0,
    conflictCount: 0,
    failedPermanentCount: 0,
    lastSuccessfulSyncAt: '2026-05-19T09:00:00.000Z',
    lastSyncError: null,
    lastRealtimeError: null,
    running: false,
    websocketConnected: true,
    cursorLag: 0,
    localCursor: 12,
    latestServerSeq: 12,
    failedPermanentPolicy: { mode: 'auto_keep_server', retainDays: 7 },
    progress: null,
    ...overrides,
  };
}

function installElectronAPI(options: {
  health?: Record<string, unknown>;
  isOnline?: boolean;
  pushResult?: Record<string, unknown>;
} = {}) {
  let networkCallback: ((online: boolean) => void) | undefined;
  let healthCallback: ((health: any) => void) | undefined;
  const push = vi.fn().mockResolvedValue({
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    errors: [],
    ...options.pushResult,
  });

  window.electronAPI = {
    sync: {
      push,
      pull: vi.fn(),
      getStatus: vi.fn(),
      getHealth: vi.fn().mockResolvedValue(createHealth(options.health)),
      onHealthChanged: vi.fn((callback: (health: any) => void) => {
        healthCallback = callback;
        return vi.fn();
      }),
      getOutbox: vi.fn(),
      resolveConflict: vi.fn(),
    },
    network: {
      isOnline: vi.fn(() => options.isOnline ?? true),
      onStatusChange: vi.fn((callback: (online: boolean) => void) => {
        networkCallback = callback;
        return vi.fn();
      }),
    },
  } as any;

  return {
    push,
    emitHealth: (health: Record<string, unknown>) => {
      healthCallback?.(createHealth(health));
    },
    setOnline: (online: boolean) => {
      networkCallback?.(online);
    },
  };
}

describe('DesktopStatusBanner', () => {
  const originalElectronAPI = window.electronAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();

    if (originalElectronAPI) {
      window.electronAPI = originalElectronAPI;
      return;
    }

    delete window.electronAPI;
  });

  it('renders nothing in the browser', () => {
    delete window.electronAPI;

    const { container } = render(<DesktopStatusBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('shows the offline banner for the desktop shell', () => {
    installElectronAPI({ isOnline: false });

    render(<DesktopStatusBanner />);

    expect(
      screen.getByText('Offline mode. Changes will sync when the connection returns.')
    ).toBeInTheDocument();
  });

  it('renders a visual sync progress card while desktop sync is running', async () => {
    installElectronAPI({
      health: {
        running: true,
        progress: {
          phase: 'pulling',
          label: 'Refreshing desktop replica',
          detail: 'Loaded 42 replica rows into the desktop cache.',
          percent: 90,
          pending: 1,
          pushed: 4,
          pulled: 42,
          conflicts: 1,
          startedAt: '2026-05-19T09:00:00.000Z',
          updatedAt: '2026-05-19T09:00:05.000Z',
        },
      },
    });

    render(<DesktopStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('Desktop Sync')).toBeInTheDocument();
      expect(screen.getByText('Refreshing desktop replica')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('42 rows')).toBeInTheDocument();
      expect(screen.getByText('1 issue')).toBeInTheDocument();
    });
  });

  it('triggers a desktop sync when the connection comes back', async () => {
    const { push, setOnline } = installElectronAPI({ isOnline: false });

    render(<DesktopStatusBanner />);
    setOnline(true);

    await waitFor(() => {
      expect(push).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the permanent failure retention banner from sync health', async () => {
    installElectronAPI({
      health: {
        failedPermanentCount: 2,
      },
    });

    render(<DesktopStatusBanner />);

    await waitFor(() => {
      expect(
        screen.getByText(
          '2 desktop changes could not be synced and are being held for review. Server state will be kept automatically after 7 days.'
        )
      ).toBeInTheDocument();
    });
  });

  it('shows a conflict banner from sync health', async () => {
    installElectronAPI({
      health: {
        conflictCount: 2,
      },
    });

    render(<DesktopStatusBanner />);

    await waitFor(() => {
      expect(
        screen.getByText('2 sync conflicts need review in the desktop outbox.')
      ).toBeInTheDocument();
    });
  });

  it('updates the indicator from sync health change events', async () => {
    const { emitHealth } = installElectronAPI();

    render(<DesktopStatusBanner />);

    await waitFor(() => {
      expect(window.electronAPI?.sync.onHealthChanged).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      emitHealth({ cursorLag: 2 });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Desktop replica is 2 server changes behind the host.')
      ).toBeInTheDocument();
    });
  });

  it('shows a stale sync warning when the last successful sync is older than three days', async () => {
    installElectronAPI({
      health: {
        lastSuccessfulSyncAt: '2000-01-01T00:00:00.000Z',
      },
    });

    render(<DesktopStatusBanner />);

    await waitFor(() => {
      expect(
        screen.getByText(/Desktop sync has not completed successfully since/)
      ).toBeInTheDocument();
    });
  });
});
