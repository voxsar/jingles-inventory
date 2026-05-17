import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '@jingles/shared';

// Expose safe IPC API to renderer process
const electronAPI: ElectronAPI = {
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
  },

  // Sync engine
  sync: {
    push: () => ipcRenderer.invoke('sync:push'),
    pull: () => ipcRenderer.invoke('sync:pull'),
    getStatus: () => ipcRenderer.invoke('sync:status'),
  },

  // App info
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
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
    electronAPI?: ElectronAPI;
  }
}
