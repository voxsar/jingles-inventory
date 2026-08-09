export interface ElectronSyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface RuntimeBuildInfo {
  packageName: string;
  appVersion: string;
  buildNumber: string | null;
  commitHash: string | null;
  commitShortHash: string | null;
  builtAt: string | null;
}

export interface BackendRuntimeInfo {
  mode: 'local_replica' | 'server';
  build: RuntimeBuildInfo;
  upstream: {
    url: string;
    build: RuntimeBuildInfo | null;
    error: string | null;
  } | null;
}

export type ElectronAppLogSource = 'main' | 'renderer' | 'backend';
export type ElectronAppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ElectronAppLogEntry {
  id: number;
  timestamp: string;
  source: ElectronAppLogSource;
  level: ElectronAppLogLevel;
  message: string;
}

export interface ElectronSyncOutboxSummary {
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

export type ElectronSyncProgressPhase =
  | 'preparing'
  | 'pushing'
  | 'pulling'
  | 'finalizing';

export interface ElectronSyncProgress {
  phase: ElectronSyncProgressPhase;
  label: string;
  detail: string | null;
  percent: number;
  pending: number;
  pushed: number;
  pulled: number;
  conflicts: number;
  startedAt: string | null;
  updatedAt: string | null;
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
  progress: ElectronSyncProgress | null;
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
  progress: ElectronSyncProgress | null;
}

export interface ElectronDatabaseInfo {
  currentPath: string;
  defaultPath: string;
  directory: string;
  exists: boolean;
  sizeBytes: number;
  lastModifiedAt: string | null;
  usesCustomPath: boolean;
}

export interface ElectronDatabaseBackupResult {
  canceled: boolean;
  backupPath: string | null;
  sizeBytes: number | null;
}

export type ElectronDatabaseSwitchMode = 'new' | 'existing' | 'default';

export interface ElectronDatabaseSwitchResult {
  canceled: boolean;
  mode: ElectronDatabaseSwitchMode;
  selectedPath: string | null;
  relaunching: boolean;
}

export interface ElectronDiscoveredDevice {
  deviceId: string;
  deviceName: string;
  application: 'inventory' | 'pos';
  applicationVersion: string;
  address: string;
  port: number;
  protocol?: 'http' | 'https';
  apiPath?: string;
  branchId?: string;
  terminalId?: string;
  hostname: string;
  instanceName: string;
  discoveredAt: string;
  lastSeenAt: string;
  expiresAt: string;
  source: 'mdns';
}

export type ElectronUpdatePolicy = 'automatic' | 'ask' | 'manual';

export interface ElectronUpdateStatus {
  state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'current' | 'error';
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number | null;
  message: string;
  policy: ElectronUpdatePolicy;
  portable: boolean;
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
    getInfo: () => Promise<ElectronDatabaseInfo>;
    backup: () => Promise<ElectronDatabaseBackupResult>;
    switchFile: (mode: ElectronDatabaseSwitchMode) => Promise<ElectronDatabaseSwitchResult>;
    revealFile: () => Promise<void>;
  };
  sync: {
    runNow: () => Promise<ElectronSyncResult>;
    pushOnly: () => Promise<ElectronSyncResult>;
    pullOnly: () => Promise<ElectronSyncResult>;
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
    getBuildInfo: () => Promise<RuntimeBuildInfo>;
    getRuntimeInfo: () => Promise<BackendRuntimeInfo>;
    openExternal: (url: string) => Promise<void>;
    setAuthCache: (auth: {
      token: string;
      user: unknown;
      syncToken?: string | null;
    }) => Promise<void>;
    setSyncToken: (sync: {
      token: string;
      userId?: string | null;
    }) => Promise<void>;
    clearAuthCache: () => Promise<void>;
  };
  logs: {
    list: (options?: { afterId?: number; limit?: number }) => Promise<ElectronAppLogEntry[]>;
    clear: () => Promise<void>;
    onEntry: (callback: (entry: ElectronAppLogEntry) => void) => () => void;
  };
  devices: {
    list: () => Promise<ElectronDiscoveredDevice[]>;
    refresh: () => Promise<ElectronDiscoveredDevice[]>;
    onChanged: (callback: (devices: ElectronDiscoveredDevice[]) => void) => () => void;
  };
  updates: {
    getStatus: () => Promise<ElectronUpdateStatus>;
    check: () => Promise<ElectronUpdateStatus>;
    choosePolicy: () => Promise<ElectronUpdatePolicy>;
    install: () => Promise<boolean>;
    onStatus: (callback: (status: ElectronUpdateStatus) => void) => () => void;
  };
  network: {
    isOnline: () => boolean;
    onStatusChange: (callback: (online: boolean) => void) => () => void;
  };
}
