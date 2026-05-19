import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DesktopStatusBanner from '../../components/DesktopStatusBanner';

describe('DesktopStatusBanner', () => {
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

  it('renders nothing in the browser', () => {
    delete window.electronAPI;

    const { container } = render(<DesktopStatusBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('shows the offline banner for the desktop shell', () => {
    window.electronAPI = {
      sync: {
        push: vi.fn(),
        pull: vi.fn(),
        getStatus: vi.fn().mockResolvedValue({
          lastResult: { errors: [] },
          outbox: { failedPermanent: 0 },
          failedPermanentPolicy: { mode: 'auto_keep_server', retainDays: 7 },
        }),
        getOutbox: vi.fn().mockResolvedValue({
          summary: {
            legacyQueueCount: 0,
            syncOperationCount: 0,
            requestQueueCount: 0,
            conflictCount: 0,
            totalCount: 0,
          },
          conflicts: [],
        }),
      },
      network: {
        isOnline: vi.fn(() => false),
        onStatusChange: vi.fn(() => vi.fn()),
      },
    } as any;

    render(<DesktopStatusBanner />);

    expect(screen.getByText('Offline mode. Changes will sync when the connection returns.')).toBeInTheDocument();
  });

  it('triggers a desktop sync when the connection comes back', async () => {
    const push = vi.fn().mockResolvedValue({});
    let statusCallback: ((online: boolean) => void) | undefined;

    window.electronAPI = {
      sync: {
        push,
        pull: vi.fn(),
        getStatus: vi.fn().mockResolvedValue({
          lastResult: { errors: [] },
          outbox: { failedPermanent: 0 },
          failedPermanentPolicy: { mode: 'auto_keep_server', retainDays: 7 },
        }),
        getOutbox: vi.fn().mockResolvedValue({
          summary: {
            legacyQueueCount: 0,
            syncOperationCount: 0,
            requestQueueCount: 0,
            conflictCount: 0,
            totalCount: 0,
          },
          conflicts: [],
        }),
      },
      network: {
        isOnline: vi.fn(() => false),
        onStatusChange: vi.fn((callback: (online: boolean) => void) => {
          statusCallback = callback;
          return vi.fn();
        }),
      },
    } as any;

    render(<DesktopStatusBanner />);
    statusCallback?.(true);

    await waitFor(() => {
      expect(push).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the permanent failure retention banner when the outbox has held failures', async () => {
    window.electronAPI = {
      sync: {
        push: vi.fn(),
        pull: vi.fn(),
        getStatus: vi.fn().mockResolvedValue({
          lastResult: { errors: [] },
          outbox: { failedPermanent: 2 },
          failedPermanentPolicy: { mode: 'auto_keep_server', retainDays: 7 },
        }),
        getOutbox: vi.fn().mockResolvedValue({
          summary: {
            legacyQueueCount: 0,
            syncOperationCount: 0,
            requestQueueCount: 0,
            conflictCount: 0,
            totalCount: 0,
          },
          conflicts: [],
        }),
      },
      network: {
        isOnline: vi.fn(() => true),
        onStatusChange: vi.fn(() => vi.fn()),
      },
    } as any;

    render(<DesktopStatusBanner />);

    await waitFor(() => {
      expect(
        screen.getByText(
          '2 desktop changes could not be synced and are being held for review. Server state will be kept automatically after 7 days.'
        )
      ).toBeInTheDocument();
    });
  });

  it('shows a conflict banner when the outbox contains unresolved sync conflicts', async () => {
    window.electronAPI = {
      sync: {
        push: vi.fn(),
        pull: vi.fn(),
        getStatus: vi.fn().mockResolvedValue({
          lastResult: { errors: [] },
          outbox: { failedPermanent: 0 },
          failedPermanentPolicy: { mode: 'auto_keep_server', retainDays: 7 },
        }),
        getOutbox: vi.fn().mockResolvedValue({
          summary: {
            legacyQueueCount: 0,
            syncOperationCount: 0,
            requestQueueCount: 0,
            conflictCount: 2,
            totalCount: 2,
          },
          conflicts: [],
        }),
      },
      network: {
        isOnline: vi.fn(() => true),
        onStatusChange: vi.fn(() => vi.fn()),
      },
    } as any;

    render(<DesktopStatusBanner />);

    await waitFor(() => {
      expect(
        screen.getByText('2 sync conflicts need review in the desktop outbox.')
      ).toBeInTheDocument();
    });
  });
});
