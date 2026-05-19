export interface ElectronSyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface ElectronSyncOutboxSummary {
  legacyQueueCount: number;
  syncOperationCount: number;
  requestQueueCount: number;
  conflictCount: number;
  totalCount: number;
}

export interface ElectronSyncConflictEntry {
  id: string;
  operationId: string;
  clientId: string;
  aggregateType: string;
  aggregateId: string | null;
  status: string;
  localPayload: Record<string, unknown> | null;
  serverPayload: Record<string, unknown> | null;
  resolutionPayload: Record<string, unknown> | null;
  createdAt: string | null;
  resolvedAt: string | null;
  operationType: string | null;
  operationStatus: string | null;
  operationBaseVersion: number | null;
  operationPayload: Record<string, unknown> | null;
  operationLastError: string | null;
  conflictCode: string | null;
  conflictMessage: string | null;
}

export interface ElectronSyncOutboxSnapshot {
  summary: ElectronSyncOutboxSummary;
  conflicts: ElectronSyncConflictEntry[];
}

export type ElectronSyncConflictResolutionChoice = 'keep_local' | 'keep_server';

export interface ElectronSyncConflictResolutionResult {
  conflictId: string;
  operationId: string;
  resolution: ElectronSyncConflictResolutionChoice;
  operationStatus: string;
  aggregateId: string | null;
}

export interface ElectronFailedPermanentPolicy {
  mode: 'auto_discard' | 'hold' | 'auto_keep_server';
  retainDays: number | null;
}

export interface ElectronSyncStatusOutbox {
  pending: number;
  conflicts: number;
  failedPermanent: number;
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
  outbox: ElectronSyncStatusOutbox;
  failedPermanentPolicy: ElectronFailedPermanentPolicy;
  lastResult: ElectronSyncResult | null;
}

export interface ElectronSyncHealth {
  pendingCount: number;
  conflictCount: number;
  failedPermanentCount: number;
  lastSuccessfulSyncAt: string | null;
  lastSyncError: string | null;
  lastRealtimeError: string | null;
  running: boolean;
  websocketConnected: boolean;
  cursorLag: number;
  localCursor: number;
  latestServerSeq: number;
  failedPermanentPolicy: ElectronFailedPermanentPolicy;
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
    getHealth: () => Promise<ElectronSyncHealth>;
    onHealthChanged: (callback: (health: ElectronSyncHealth) => void) => () => void;
    getOutbox: () => Promise<ElectronSyncOutboxSnapshot>;
    resolveConflict: (
      conflictId: string,
      resolution: ElectronSyncConflictResolutionChoice
    ) => Promise<ElectronSyncConflictResolutionResult>;
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
