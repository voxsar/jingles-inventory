export interface ElectronAPI {
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
    push: () => Promise<unknown>;
    pull: () => Promise<unknown>;
    getStatus: () => Promise<unknown>;
  };
  app: {
    version: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
  };
  network: {
    isOnline: () => boolean;
    onStatusChange: (callback: (online: boolean) => void) => () => void;
  };
}
