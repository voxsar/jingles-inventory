import { useEffect, useState } from 'react';

type DesktopSyncStatus = 'idle' | 'syncing' | 'error';

function hasElectronBridge() {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

function getInitialOnlineStatus() {
  if (!hasElectronBridge()) {
    return true;
  }

  return window.electronAPI?.network.isOnline() ?? navigator.onLine;
}

export default function DesktopStatusBanner() {
  const [isElectron] = useState(hasElectronBridge);
  const [isOnline, setIsOnline] = useState(getInitialOnlineStatus);
  const [syncStatus, setSyncStatus] = useState<DesktopSyncStatus>('idle');

  const triggerSync = async () => {
    if (!window.electronAPI) {
      return;
    }

    setSyncStatus('syncing');

    try {
      await window.electronAPI.sync.push();
      setSyncStatus('idle');
    } catch (error) {
      console.error('[DesktopSync] Failed to push local changes:', error);
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    return window.electronAPI.network.onStatusChange((online: boolean) => {
      setIsOnline(online);

      if (online) {
        void triggerSync();
      }
    });
  }, []);

  if (!isElectron || (isOnline && syncStatus === 'idle')) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-3 space-y-2">
      {!isOnline && (
        <s-banner tone="warning">
          Offline mode. Changes will sync when the connection returns.
        </s-banner>
      )}
      {syncStatus === 'syncing' && (
        <s-banner tone="info">Syncing desktop changes...</s-banner>
      )}
      {syncStatus === 'error' && (
        <s-banner tone="critical">
          Desktop sync failed. The next reconnect will retry automatically.
        </s-banner>
      )}
    </div>
  );
}
