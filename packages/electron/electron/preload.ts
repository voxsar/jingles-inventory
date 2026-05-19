import { contextBridge, ipcRenderer } from 'electron';

const FALLBACK_DESKTOP_LOCAL_API_URL = 'http://127.0.0.1:3630';

function readDesktopLocalApiUrl() {
  try {
    const resolvedUrl = ipcRenderer.sendSync('app:backend-url-sync');
    return typeof resolvedUrl === 'string' && resolvedUrl.trim()
      ? resolvedUrl.trim()
      : FALLBACK_DESKTOP_LOCAL_API_URL;
  } catch (error) {
    console.error('[Electron preload] Failed to resolve the desktop backend URL.', error);
    return FALLBACK_DESKTOP_LOCAL_API_URL;
  }
}

const DESKTOP_LOCAL_API_URL = readDesktopLocalApiUrl();

// Expose safe IPC API to renderer process
const electronAPI = {
  // Barcode scanner
  barcode: {
    onScan: (callback: (barcode: string) => void) => {
      ipcRenderer.on('barcode:scan', (_event, barcode) => callback(barcode));
    },
    offScan: () => {
      ipcRenderer.removeAllListeners('barcode:scan');
    },
    startListening: (port?: string) => ipcRenderer.invoke('barcode:start', port),
    stopListening: () => ipcRenderer.invoke('barcode:stop'),
  },

  // Offline/Local DB operations
  db: {
    getInventory: (filters?: Record<string, any>) =>
      ipcRenderer.invoke('db:inventory:get', filters),
    upsertInventory: (record: any) =>
      ipcRenderer.invoke('db:inventory:upsert', record),
    getGRNs: (filters?: Record<string, any>) =>
      ipcRenderer.invoke('db:grns:get', filters),
    upsertGRN: (grn: any) =>
      ipcRenderer.invoke('db:grns:upsert', grn),
    getSKUs: () => ipcRenderer.invoke('db:skus:get'),
    upsertSKU: (sku: any) => ipcRenderer.invoke('db:skus:upsert', sku),
    getSyncQueue: () => ipcRenderer.invoke('db:sync:getQueue'),
    addToSyncQueue: (operation: any) =>
      ipcRenderer.invoke('db:sync:add', operation),
    clearProcessed: () => ipcRenderer.invoke('db:sync:clearProcessed'),
    getInfo: () => ipcRenderer.invoke('db:info'),
    backup: () => ipcRenderer.invoke('db:backup'),
    switchFile: (mode: 'new' | 'existing' | 'default') =>
      ipcRenderer.invoke('db:switch-file', mode),
    revealFile: () => ipcRenderer.invoke('db:reveal-file'),
  },

  // Sync engine
  sync: {
    runNow: () => ipcRenderer.invoke('sync:run'),
    pushOnly: () => ipcRenderer.invoke('sync:push-only'),
    pullOnly: () => ipcRenderer.invoke('sync:pull-only'),
    push: () => ipcRenderer.invoke('sync:push'),
    pull: () => ipcRenderer.invoke('sync:pull'),
    getStatus: () => ipcRenderer.invoke('sync:status'),
    getHealth: () => ipcRenderer.invoke('sync:health'),
    onHealthChanged: (callback: (health: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, health: unknown) => callback(health);
      ipcRenderer.on('sync:health-changed', listener);

      return () => {
        ipcRenderer.removeListener('sync:health-changed', listener);
      };
    },
    getOutbox: () => ipcRenderer.invoke('sync:outbox'),
    resolveConflict: (
      conflictId: string,
      resolution: 'keep_local' | 'keep_server'
    ) =>
      ipcRenderer.invoke('sync:resolve-conflict', conflictId, resolution),
  },

  // App info
  app: {
    backendUrl: DESKTOP_LOCAL_API_URL,
    version: () => ipcRenderer.invoke('app:version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    setAuthCache: (auth: { token: string; user: unknown }) =>
      ipcRenderer.invoke('app:set-auth-cache', auth),
    clearAuthCache: () => ipcRenderer.invoke('app:clear-auth-cache'),
  },

  // Online/offline detection
  network: {
    isOnline: () => navigator.onLine,
    onStatusChange: (callback: (online: boolean) => void) => {
      const handleOnline = () => callback(true);
      const handleOffline = () => callback(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer
declare global {
  interface Window {
    electronAPI?: typeof electronAPI;
  }
}
