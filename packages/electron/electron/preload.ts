import { contextBridge, ipcRenderer } from 'electron';

// Expose safe IPC API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
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
      window.addEventListener('online', () => callback(true));
      window.addEventListener('offline', () => callback(false));
    },
  },
});

// Type declaration for renderer
declare global {
  interface Window {
    electronAPI: {
      barcode: {
        onScan: (callback: (barcode: string) => void) => void;
        offScan: () => void;
        startListening: (port?: string) => Promise<{ success: boolean; mode: string }>;
        stopListening: () => Promise<{ success: boolean }>;
      };
      db: {
        getInventory: (filters?: Record<string, any>) => Promise<any[]>;
        upsertInventory: (record: any) => Promise<any>;
        getGRNs: (filters?: Record<string, any>) => Promise<any[]>;
        upsertGRN: (grn: any) => Promise<any>;
        getSKUs: () => Promise<any[]>;
        upsertSKU: (sku: any) => Promise<any>;
        getSyncQueue: () => Promise<any[]>;
        addToSyncQueue: (operation: any) => Promise<any>;
        clearProcessed: () => Promise<void>;
      };
      sync: {
        push: () => Promise<any>;
        pull: () => Promise<any>;
        getStatus: () => Promise<any>;
      };
      app: {
        version: () => Promise<string>;
        openExternal: (url: string) => Promise<void>;
      };
      network: {
        isOnline: () => boolean;
        onStatusChange: (callback: (online: boolean) => void) => void;
      };
    };
  }
}
