import { useEffect, useState } from 'react';

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

export default function ElectronApp() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  useEffect(() => {
    if (isElectron) {
      (window as any).electronAPI.network.onStatusChange((online: boolean) => {
        setIsOnline(online);
        if (online) {
          triggerSync();
        }
      });
    }
  }, []);

  const triggerSync = async () => {
    if (!isElectron) return;
    setSyncStatus('syncing');
    try {
      const result = await (window as any).electronAPI.sync.push();
      console.log('[Sync] Push result:', result);
      setSyncStatus('idle');
    } catch (err) {
      console.error('[Sync] Error:', err);
      setSyncStatus('error');
    }
  };

  return (
    <div>
      {!isOnline && (
        <s-banner tone="warning">
          Offline Mode — Changes will sync when connection is restored
        </s-banner>
      )}
      {syncStatus === 'syncing' && (
        <s-banner tone="info">Syncing...</s-banner>
      )}
      {syncStatus === 'error' && (
        <s-banner tone="critical" onClick={() => setSyncStatus('idle')}>
          Sync failed — Click to dismiss
        </s-banner>
      )}
      <s-page>
        <s-section>
          <s-text>
            {isElectron
              ? 'Electron app running. The web interface is loaded from the backend server.'
              : 'Web mode: Use the standard web interface.'}
          </s-text>
        </s-section>
      </s-page>
    </div>
  );
}
