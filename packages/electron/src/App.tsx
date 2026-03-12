import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Check if running in Electron
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
    <div className="min-h-screen bg-gray-50">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white text-center py-1 text-sm font-medium">
          ⚠️ Offline Mode — Changes will sync when connection is restored
        </div>
      )}

      {/* Sync Status */}
      {syncStatus === 'syncing' && (
        <div className="fixed bottom-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          🔄 Syncing...
        </div>
      )}
      {syncStatus === 'error' && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg text-sm shadow-lg cursor-pointer" onClick={() => setSyncStatus('idle')}>
          ❌ Sync failed — Click to dismiss
        </div>
      )}

      {/* Main App Content - Renders the web app inside Electron */}
      <div className={!isOnline ? 'mt-7' : ''}>
        <p className="text-center text-gray-500 p-8">
          {isElectron
            ? 'Electron app running. The web interface is loaded from the backend server.'
            : 'Web mode: Use the standard web interface.'}
        </p>
      </div>
    </div>
  );
}
