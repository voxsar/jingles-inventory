export interface ElectronSyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface ElectronSyncStatus {
  configured: boolean;
  running: boolean;
  serverUrl: string | null;
  clientId: string | null;
  autoSyncIntervalMs: number | null;
  websocketConnected: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastRealtimeEventAt: string | null;
  lastRealtimeError: string | null;
  lastResult: ElectronSyncResult | null;
}

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
    push: () => Promise<ElectronSyncResult>;
    pull: () => Promise<ElectronSyncResult>;
    getStatus: () => Promise<ElectronSyncStatus>;
  };
  app: {
    backendUrl: string;
    version: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    setAuthCache: (auth: { token: string; user: unknown }) => Promise<void>;
    clearAuthCache: () => Promise<void>;
  };
  network: {
    isOnline: () => boolean;
    onStatusChange: (callback: (online: boolean) => void) => () => void;
  };
}
