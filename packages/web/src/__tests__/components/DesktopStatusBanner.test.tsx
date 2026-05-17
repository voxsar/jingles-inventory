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
        getStatus: vi.fn(),
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
        getStatus: vi.fn(),
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
});
