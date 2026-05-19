import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  FAILED_PERMANENT_STATUS,
  addToSyncQueue,
  applyReplicaMutation,
  clearProcessedQueue,
  clearProcessedRequestSyncQueue,
  deleteInventoryRecord,
  getConfig,
  getPendingSyncConflicts,
  getPendingSyncConflictDetailById,
  getPendingSyncConflictDetails,
  getPendingSyncQueue,
  getPendingSyncOperationLogs,
  getPendingRequestSyncQueue,
  getSyncOutboxSummary,
  insertPendingSyncConflict,
  markRequestSyncFailed,
  markRequestSyncProcessed,
  markSyncConflictResolved,
  markSyncOperationLogConflict,
  markSyncOperationLogFailed,
  markSyncOperationLogProcessed,
  markSyncProcessed,
  pruneFailedPermanentOutbox,
  replaceReplicaSnapshot,
  setConfig,
  upsertInventoryRecord,
} from '../offline/localDB';
import type { SyncOutboxSummary } from '../offline/localDB';
import type { ReplicaSyncEvent } from './replicaEvents';

interface SyncConfig {
  serverUrl: string;
  clientId: string;
  getToken: () => string | null;
}

interface SyncRunOptions {
  forcePull?: boolean;
}

type QueuedRequestFile = {
  fieldname: string;
  path: string;
  originalname: string;
  mimetype: string;
};

type QueuedRequestRecord = {
  id: string;
  method: string;
  path: string;
  content_type: string | null;
  body: string | null;
  files: string | null;
};

type QueuedSyncOperationRecord = {
  id: string;
  client_id: string;
  op_type: string;
  aggregate_id: string | null;
  idempotency_key: string;
  payload: string | null;
  base_version: number | null;
  status: string;
};

type QueuedSyncConflictRecord = {
  id: string;
  operation_id: string;
  client_id: string;
  aggregate_type: string;
  aggregate_id: string | null;
  status: string;
};

type SyncConflictDetailRecord = QueuedSyncConflictRecord & {
  local_payload: string | null;
  server_payload: string | null;
  resolution_payload: string | null;
  created_at: string | null;
  resolved_at: string | null;
  operation_type: string | null;
  operation_status: string | null;
  operation_base_version: number | null;
  operation_payload: string | null;
  operation_last_error: string | null;
  operation_conflict_data: string | null;
};

type SyncLogItem = {
  seq: number;
  table: string;
  action: 'upsert' | 'delete';
  row: Record<string, unknown>;
  emittedAt: string;
};

type FailedPermanentPolicyMode = 'auto_discard' | 'hold' | 'auto_keep_server';

type FailedPermanentPolicy =
  | { mode: 'auto_discard'; retainDays: 0 }
  | { mode: 'hold'; retainDays: null }
  | { mode: 'auto_keep_server'; retainDays: number };

type FailedPermanentPolicyDescriptor = {
  mode: FailedPermanentPolicyMode;
  retainDays: number | null;
};

type ElectronSyncConflictEntry = {
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
};

type ElectronSyncOutboxSnapshot = {
  summary: {
    legacyQueueCount: number;
    syncOperationCount: number;
    requestQueueCount: number;
    conflictCount: number;
    totalCount: number;
  };
  conflicts: ElectronSyncConflictEntry[];
};

type ElectronSyncConflictResolutionChoice = 'keep_local' | 'keep_server';

type ElectronSyncConflictResolutionResult = {
  conflictId: string;
  operationId: string;
  resolution: ElectronSyncConflictResolutionChoice;
  operationStatus: string;
  aggregateId: string | null;
};

export interface SyncRunResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface SyncStatus {
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
  outbox: SyncOutboxSummary;
  failedPermanentPolicy: FailedPermanentPolicyDescriptor;
  lastResult: SyncRunResult | null;
}

const EMPTY_OUTBOX_SUMMARY: SyncOutboxSummary = {
  pending: 0,
  conflicts: 0,
  failedPermanent: 0,
};

const DEFAULT_FAILED_PERMANENT_RETENTION_DAYS = 7;

function resolveFailedPermanentPolicy(): FailedPermanentPolicy {
  const normalizedMode = process.env.ELECTRON_SYNC_FAILED_PERMANENT_POLICY?.trim()
    .toLowerCase()
    .replace(/-/g, '_');

  if (normalizedMode === 'auto_discard') {
    return { mode: 'auto_discard', retainDays: 0 };
  }

  if (normalizedMode === 'hold') {
    return { mode: 'hold', retainDays: null };
  }

  const parsedDays = Number.parseInt(
    process.env.ELECTRON_SYNC_FAILED_PERMANENT_RETENTION_DAYS ?? '',
    10
  );
  const retainDays =
    Number.isFinite(parsedDays) && parsedDays >= 0
      ? parsedDays
      : DEFAULT_FAILED_PERMANENT_RETENTION_DAYS;

  return { mode: 'auto_keep_server', retainDays };
}

const FAILED_PERMANENT_POLICY = resolveFailedPermanentPolicy();

function getFailedPermanentPolicyDescriptor(): FailedPermanentPolicyDescriptor {
  return {
    mode: FAILED_PERMANENT_POLICY.mode,
    retainDays: FAILED_PERMANENT_POLICY.retainDays,
  };
}

let syncConfig: SyncConfig | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let activeSyncPromise: Promise<SyncRunResult> | null = null;
let syncWebSocket: WebSocket | null = null;
let syncWebSocketTarget: string | null = null;
let syncWebSocketReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeReconnectDelayMs = 1000;
let needsFullReplicaPull = true;
let autoSyncEnabled = false;
let syncStatus: SyncStatus = {
  configured: false,
  running: false,
  serverUrl: null,
  clientId: null,
  autoSyncIntervalMs: null,
  websocketConnected: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastSuccessfulSyncAt: null,
  lastRealtimeEventAt: null,
  lastRealtimeError: null,
  outbox: EMPTY_OUTBOX_SUMMARY,
  failedPermanentPolicy: getFailedPermanentPolicyDescriptor(),
  lastResult: null,
};

function cloneResult(result: SyncRunResult): SyncRunResult {
  return {
    pushed: result.pushed,
    pulled: result.pulled,
    conflicts: result.conflicts,
    errors: [...result.errors],
  };
}

function refreshOutboxState() {
  if (FAILED_PERMANENT_POLICY.mode !== 'hold') {
    pruneFailedPermanentOutbox(FAILED_PERMANENT_POLICY.retainDays ?? 0);
  }

  syncStatus = {
    ...syncStatus,
    outbox: getSyncOutboxSummary(),
    failedPermanentPolicy: getFailedPermanentPolicyDescriptor(),
  };
}

function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readStringProperty(
  payload: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function mapConflictEntry(conflict: SyncConflictDetailRecord): ElectronSyncConflictEntry {
  const localPayload = parseJsonValue<Record<string, unknown> | null>(
    conflict.local_payload,
    null
  );
  const serverPayload = parseJsonValue<Record<string, unknown> | null>(
    conflict.server_payload,
    null
  );
  const resolutionPayload = parseJsonValue<Record<string, unknown> | null>(
    conflict.resolution_payload,
    null
  );
  const operationPayload = parseJsonValue<Record<string, unknown> | null>(
    conflict.operation_payload,
    null
  );
  const conflictData = parseJsonValue<Record<string, unknown> | null>(
    conflict.operation_conflict_data,
    null
  );

  return {
    id: conflict.id,
    operationId: conflict.operation_id,
    clientId: conflict.client_id,
    aggregateType: conflict.aggregate_type,
    aggregateId: conflict.aggregate_id,
    status: conflict.status,
    localPayload,
    serverPayload,
    resolutionPayload,
    createdAt: conflict.created_at,
    resolvedAt: conflict.resolved_at,
    operationType: conflict.operation_type,
    operationStatus: conflict.operation_status,
    operationBaseVersion: conflict.operation_base_version,
    operationPayload,
    operationLastError: conflict.operation_last_error,
    conflictCode: readStringProperty(conflictData, 'code'),
    conflictMessage: readStringProperty(conflictData, 'message'),
  };
}

function isNetworkRetriableStatus(status: number) {
  return status >= 500 || status === 408 || status === 429;
}

async function replayQueuedRequest(
  request: QueuedRequestRecord,
  serverUrl: string,
  token: string
) {
  const targetUrl = `${serverUrl}${request.path}`;
  const files = parseJsonValue<QueuedRequestFile[]>(request.files, []);
  const requestBody = parseJsonValue<unknown>(request.body, null);
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'X-Jingles-Sync-Replay': '1',
  });

  let body: BodyInit | undefined;

  if (files.length > 0) {
    const formData = new FormData();
    const fields =
      requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)
        ? (requestBody as Record<string, unknown>)
        : {};

    for (const [field, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        value.forEach((entry) => formData.append(field, String(entry)));
      } else if (value !== undefined && value !== null) {
        formData.append(field, String(value));
      }
    }

    for (const file of files) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`Queued file not found at ${file.path}`);
      }

      const fileBuffer = fs.readFileSync(file.path);
      const blob = new Blob([fileBuffer], {
        type: file.mimetype || 'application/octet-stream',
      });
      formData.append(file.fieldname, blob, file.originalname);
    }

    body = formData;
  } else if (requestBody !== null) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(requestBody);
  }

  return fetch(targetUrl, {
    method: request.method.toUpperCase(),
    headers,
    body,
  });
}

async function readErrorMessage(response: Response) {
  const body = await response.text();
  if (!body) {
    return `HTTP ${response.status}`;
  }

  try {
    const payload = JSON.parse(body) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? `HTTP ${response.status}`;
  } catch {
    return body;
  }
}

async function readJsonBody<T>(response: Response): Promise<T | null> {
  const body = await response.text();
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

function copyFirstPresentKey(
  source: Record<string, unknown> | null,
  keys: string[],
  target: Record<string, unknown>,
  targetKey = keys[0]
) {
  if (!source) {
    return;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[targetKey] = source[key];
      return;
    }
  }
}

async function sendAuthorizedJsonRequest<T>(
  serverUrl: string,
  token: string,
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: Record<string, unknown>;
  } = {}
) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
  });

  if (init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${serverUrl}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readJsonBody<T>(response);
}

async function refreshInventoryRecordFromServer(
  serverUrl: string,
  token: string,
  inventoryRecordId: string,
  options: { deleteWhenMissing?: boolean } = {}
) {
  const response = await fetch(`${serverUrl}/api/inventory/${inventoryRecordId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    if (options.deleteWhenMissing) {
      deleteInventoryRecord(inventoryRecordId);
      return null;
    }

    throw new Error(`Inventory record ${inventoryRecordId} was not found on the server.`);
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = await readJsonBody<{ data?: Record<string, unknown> }>(response);
  if (!isRecord(payload?.data)) {
    throw new Error(`Inventory refresh for ${inventoryRecordId} returned an invalid payload.`);
  }

  upsertInventoryRecord(payload.data, { markDirty: false });
  return payload.data;
}

async function applyKeepLocalInventoryCreate(
  serverUrl: string,
  token: string,
  localPayload: Record<string, unknown>,
  serverPayload: Record<string, unknown> | null
) {
  const recordId = readStringProperty(localPayload, 'id');
  if (!recordId) {
    throw new Error('inventory.create resolution requires an id.');
  }

  if (!serverPayload) {
    await sendAuthorizedJsonRequest(serverUrl, token, '/api/inventory', {
      method: 'POST',
      body: localPayload,
    });
    return recordId;
  }

  const localSkuId = readStringProperty(localPayload, 'skuId', 'sku_id');
  const serverSkuId = readStringProperty(serverPayload, 'skuId', 'sku_id');
  const localVariantId = readStringProperty(localPayload, 'variantId', 'variant_id');
  const serverVariantId = readStringProperty(serverPayload, 'variantId', 'variant_id');

  if (localSkuId && serverSkuId && localSkuId !== serverSkuId) {
    throw new Error(
      'This inventory.create conflict cannot be auto-resolved because the server record belongs to a different SKU.'
    );
  }

  if ((localVariantId ?? null) !== (serverVariantId ?? null)) {
    throw new Error(
      'This inventory.create conflict cannot be auto-resolved because the server record belongs to a different variant.'
    );
  }

  const updateBody: Record<string, unknown> = {};
  copyFirstPresentKey(localPayload, ['floorId', 'floor_id'], updateBody, 'floorId');
  copyFirstPresentKey(localPayload, ['shelfId', 'shelf_id'], updateBody, 'shelfId');
  copyFirstPresentKey(localPayload, ['boxId', 'box_id'], updateBody, 'boxId');
  copyFirstPresentKey(localPayload, ['batchId', 'batch_id'], updateBody, 'batchId');
  copyFirstPresentKey(localPayload, ['quantity'], updateBody, 'quantity');

  if (Object.keys(updateBody).length > 0) {
    await sendAuthorizedJsonRequest(serverUrl, token, `/api/inventory/${recordId}`, {
      method: 'PUT',
      body: updateBody,
    });
  }

  const localState = readStringProperty(localPayload, 'state');
  const serverState = readStringProperty(serverPayload, 'state');
  if (localState && serverState && localState !== serverState) {
    await sendAuthorizedJsonRequest(serverUrl, token, `/api/inventory/${recordId}/transition`, {
      method: 'POST',
      body: {
        toState: localState,
        reason: 'Resolved from desktop sync conflict',
      },
    });
  }

  return recordId;
}

async function applyKeepLocalInventoryUpdate(
  serverUrl: string,
  token: string,
  localPayload: Record<string, unknown>
) {
  const recordId = readStringProperty(localPayload, 'id');
  if (!recordId) {
    throw new Error('inventory.update resolution requires an id.');
  }

  const updateBody: Record<string, unknown> = {};
  copyFirstPresentKey(localPayload, ['floorId', 'floor_id'], updateBody, 'floorId');
  copyFirstPresentKey(localPayload, ['shelfId', 'shelf_id'], updateBody, 'shelfId');
  copyFirstPresentKey(localPayload, ['boxId', 'box_id'], updateBody, 'boxId');
  copyFirstPresentKey(localPayload, ['batchId', 'batch_id'], updateBody, 'batchId');
  copyFirstPresentKey(localPayload, ['quantity'], updateBody, 'quantity');

  if (Object.keys(updateBody).length > 0) {
    await sendAuthorizedJsonRequest(serverUrl, token, `/api/inventory/${recordId}`, {
      method: 'PUT',
      body: updateBody,
    });
  }

  return recordId;
}

async function applyKeepLocalInventoryBoxOpen(
  serverUrl: string,
  token: string,
  localPayload: Record<string, unknown>
) {
  const inventoryRecordId = readStringProperty(
    localPayload,
    'inventoryRecordId',
    'inventory_record_id'
  );
  if (!inventoryRecordId) {
    throw new Error('inventory.box-open resolution requires inventoryRecordId.');
  }

  const requestBody: Record<string, unknown> = {
    inventoryRecordId,
  };
  copyFirstPresentKey(localPayload, ['quantityToOpen', 'quantity_to_open'], requestBody, 'quantityToOpen');
  copyFirstPresentKey(localPayload, ['targetFloorId', 'target_floor_id'], requestBody, 'targetFloorId');

  const payload = await sendAuthorizedJsonRequest<{
    data?: {
      boxRecord?: Record<string, unknown>;
      pieceRecord?: Record<string, unknown>;
    };
  }>(serverUrl, token, '/api/inventory/box-open', {
    method: 'POST',
    body: requestBody,
  });

  if (isRecord(payload?.data?.boxRecord)) {
    upsertInventoryRecord(payload.data.boxRecord, { markDirty: false });
  }

  if (isRecord(payload?.data?.pieceRecord)) {
    upsertInventoryRecord(payload.data.pieceRecord, { markDirty: false });
  }

  return inventoryRecordId;
}

async function applyKeepLocalInventoryTransition(
  serverUrl: string,
  token: string,
  localPayload: Record<string, unknown>
) {
  const inventoryRecordId = readStringProperty(
    localPayload,
    'inventoryRecordId',
    'inventory_record_id'
  );
  const toState = readStringProperty(localPayload, 'toState', 'to_state');

  if (!inventoryRecordId || !toState) {
    throw new Error('inventory.transition resolution requires inventoryRecordId and toState.');
  }

  const requestBody: Record<string, unknown> = {
    toState,
  };
  copyFirstPresentKey(localPayload, ['reason'], requestBody, 'reason');

  await sendAuthorizedJsonRequest(serverUrl, token, `/api/inventory/${inventoryRecordId}/transition`, {
    method: 'POST',
    body: requestBody,
  });

  return inventoryRecordId;
}

async function applyKeepLocalResolution(
  serverUrl: string,
  token: string,
  conflict: SyncConflictDetailRecord
) {
  const localPayload = parseJsonValue<Record<string, unknown> | null>(conflict.local_payload, null);
  const serverPayload = parseJsonValue<Record<string, unknown> | null>(conflict.server_payload, null);

  if (!localPayload) {
    throw new Error('Sync conflict does not include a local payload to apply.');
  }

  switch (conflict.operation_type) {
    case 'inventory.create':
      return applyKeepLocalInventoryCreate(serverUrl, token, localPayload, serverPayload);
    case 'inventory.update':
      return applyKeepLocalInventoryUpdate(serverUrl, token, localPayload);
    case 'inventory.box-open':
      return applyKeepLocalInventoryBoxOpen(serverUrl, token, localPayload);
    case 'inventory.transition':
      return applyKeepLocalInventoryTransition(serverUrl, token, localPayload);
    default:
      throw new Error(
        `Sync conflict resolution is not implemented for operation type ${conflict.operation_type ?? 'unknown'}.`
      );
  }
}

function getSyncV2Cursor() {
  const rawValue = getConfig('syncV2Cursor');
  if (!rawValue) {
    return 0;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function setSyncV2Cursor(seq: number) {
  setConfig('syncV2Cursor', String(Math.max(0, Math.trunc(seq))));
}

export function configureSyncEngine(config: SyncConfig) {
  syncConfig = config;
  needsFullReplicaPull = true;
  syncStatus = {
    ...syncStatus,
    configured: true,
    serverUrl: config.serverUrl,
    clientId: config.clientId,
  };
  refreshOutboxState();

  if (autoSyncEnabled) {
    refreshRealtimeSyncConnection();
  }
}

export function getSyncStatus(): SyncStatus {
  refreshOutboxState();
  return {
    ...syncStatus,
    lastResult: syncStatus.lastResult ? cloneResult(syncStatus.lastResult) : null,
  };
}

export function getSyncOutbox(): ElectronSyncOutboxSnapshot {
  refreshOutboxState();

  const conflicts = (getPendingSyncConflictDetails() as SyncConflictDetailRecord[]).map(
    mapConflictEntry
  );
  const legacyQueueCount = getPendingSyncQueue().length;
  const syncOperationCount = (getPendingSyncOperationLogs() as QueuedSyncOperationRecord[]).length;
  const requestQueueCount = (getPendingRequestSyncQueue() as QueuedRequestRecord[]).length;

  return {
    summary: {
      legacyQueueCount,
      syncOperationCount,
      requestQueueCount,
      conflictCount: conflicts.length,
      totalCount:
        legacyQueueCount +
        syncOperationCount +
        requestQueueCount +
        conflicts.length,
    },
    conflicts,
  };
}

export async function resolveSyncConflict(
  conflictId: string,
  resolution: ElectronSyncConflictResolutionChoice
): Promise<ElectronSyncConflictResolutionResult> {
  if (!syncConfig) {
    throw new Error('Sync not configured');
  }

  const token = syncConfig.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const conflict = getPendingSyncConflictDetailById(conflictId) as
    | SyncConflictDetailRecord
    | undefined;
  if (!conflict) {
    throw new Error(`Pending sync conflict ${conflictId} was not found.`);
  }

  let aggregateId = conflict.aggregate_id;

  if (resolution === 'keep_local') {
    aggregateId =
      (await applyKeepLocalResolution(syncConfig.serverUrl, token, conflict)) ?? aggregateId;

    if (aggregateId && conflict.aggregate_type === 'inventory_record') {
      await refreshInventoryRecordFromServer(syncConfig.serverUrl, token, aggregateId);
    }

    markSyncOperationLogProcessed(conflict.operation_id, null);
  } else {
    if (aggregateId && conflict.aggregate_type === 'inventory_record') {
      await refreshInventoryRecordFromServer(syncConfig.serverUrl, token, aggregateId, {
        deleteWhenMissing: true,
      });
    }

    markSyncOperationLogFailed(
      conflict.operation_id,
      'Resolved by keeping the server version.',
      'permanent'
    );
  }

  markSyncConflictResolved(conflict.id, {
    resolution,
    resolvedAt: new Date().toISOString(),
    operationStatus:
      resolution === 'keep_local' ? 'Processed' : FAILED_PERMANENT_STATUS,
    aggregateId,
  });

  needsFullReplicaPull = true;
  refreshOutboxState();

  return {
    conflictId: conflict.id,
    operationId: conflict.operation_id,
    resolution,
    operationStatus:
      resolution === 'keep_local' ? 'Processed' : FAILED_PERMANENT_STATUS,
    aggregateId,
  };
}

export function startAutoSync(intervalMs = 30000) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  autoSyncEnabled = true;
  needsFullReplicaPull = true;
  syncStatus = {
    ...syncStatus,
    autoSyncIntervalMs: intervalMs,
  };
  refreshOutboxState();

  syncInterval = setInterval(() => {
    void syncAll();
  }, intervalMs);

  refreshRealtimeSyncConnection();
  void syncAll({ forcePull: true });
}

export function stopAutoSync() {
  autoSyncEnabled = false;

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  clearRealtimeReconnectTimer();
  closeRealtimeSyncSocket();
  syncStatus = {
    ...syncStatus,
    autoSyncIntervalMs: null,
    websocketConnected: false,
  };
  refreshOutboxState();
}

export function refreshRealtimeSyncConnection() {
  if (!autoSyncEnabled || !syncConfig) {
    clearRealtimeReconnectTimer();
    closeRealtimeSyncSocket();
    return;
  }

  if (typeof WebSocket === 'undefined') {
    syncStatus = {
      ...syncStatus,
      websocketConnected: false,
      lastRealtimeError: 'WebSocket is not available in this runtime.',
    };
    return;
  }

  const token = syncConfig.getToken();
  if (!token) {
    clearRealtimeReconnectTimer();
    closeRealtimeSyncSocket();
    return;
  }

  const target = buildRealtimeSyncUrl(syncConfig.serverUrl, token, syncConfig.clientId);
  if (
    syncWebSocket &&
    syncWebSocketTarget === target &&
    syncWebSocket.readyState !== WebSocket.CLOSING &&
    syncWebSocket.readyState !== WebSocket.CLOSED
  ) {
    return;
  }

  clearRealtimeReconnectTimer();
  closeRealtimeSyncSocket();
  connectRealtimeSync(target);
}

export async function syncAll(options: SyncRunOptions = {}): Promise<SyncRunResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  refreshOutboxState();
  activeSyncPromise = (async () => {
    const result: SyncRunResult = {
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
    };

    if (!syncConfig) {
      result.errors.push('Sync not configured');
      syncStatus = {
        ...syncStatus,
        configured: false,
        lastResult: cloneResult(result),
      };
      return result;
    }

    syncStatus = {
      ...syncStatus,
      configured: true,
      running: true,
      serverUrl: syncConfig.serverUrl,
      clientId: syncConfig.clientId,
      lastStartedAt: new Date().toISOString(),
    };

    try {
      const pushResult = await pushChanges();
      result.pushed = pushResult.pushed;
      result.conflicts = pushResult.conflicts;
      result.errors.push(...pushResult.errors);

      const shouldPull =
        options.forcePull || needsFullReplicaPull || !syncStatus.websocketConnected;

      if (pushResult.blockPull) {
        result.errors.push('Replica pull skipped because some local changes are still pending sync.');
      } else if (shouldPull) {
        const pullResult = await pullChanges();
        result.pulled = pullResult.pulled;
        result.errors.push(...pullResult.errors);
        if (pullResult.errors.length === 0) {
          needsFullReplicaPull = false;
        }
      }
    } catch (err: any) {
      result.errors.push(`Sync failed: ${err.message}`);
    }

    const completedAt = new Date().toISOString();
    syncStatus = {
      ...syncStatus,
      running: false,
      lastCompletedAt: completedAt,
      lastSuccessfulSyncAt: result.errors.length === 0 ? completedAt : syncStatus.lastSuccessfulSyncAt,
      lastResult: cloneResult(result),
    };
    refreshOutboxState();

    return result;
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

async function pushLegacySyncQueue(serverUrl: string, token: string) {
  const queuedOps = getPendingSyncQueue();
  const result = {
    pushed: 0,
    conflicts: 0,
    errors: [] as string[],
  };

  if (queuedOps.length === 0) {
    return result;
  }

  try {
    const response = await fetch(`${serverUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: syncConfig?.clientId,
        operations: queuedOps.map((operation: any) => ({
          ...operation,
          payload: parseJsonValue(operation.payload, {}),
        })),
      }),
    });

    if (!response.ok) {
      result.errors.push(await readErrorMessage(response));
      return result;
    }

    const payload = (await response.json()) as {
      data?: { processed?: Array<{ id: string; status: 'Processed' | 'Conflict' | 'Failed'; conflictNotes?: string; error?: string }> };
    };
    const processed = payload.data?.processed ?? [];

    for (const item of processed) {
      if (item.status === 'Processed') {
        markSyncProcessed(item.id, 'Processed');
        result.pushed++;
      } else if (item.status === 'Conflict') {
        markSyncProcessed(item.id, 'Conflict', item.conflictNotes);
        result.conflicts++;
      } else {
        markSyncProcessed(item.id, 'failed_permanent', item.error ?? 'Unknown error');
        result.errors.push(`Legacy sync operation ${item.id} failed: ${item.error ?? 'Unknown error'}`);
      }
    }

    clearProcessedQueue();
  } catch (error: any) {
    result.errors.push(`Legacy sync push failed: ${error.message}`);
  }

  return result;
}

async function pushSyncV2OperationLog(serverUrl: string, token: string) {
  const result = {
    pushed: 0,
    conflicts: 0,
    errors: [] as string[],
    blockPull: false,
  };

  const pendingConflicts = getPendingSyncConflicts() as QueuedSyncConflictRecord[];
  if (pendingConflicts.length > 0) {
    result.errors.push('Sync blocked by unresolved local conflicts.');
    result.blockPull = true;
    return result;
  }

  const queuedOps = getPendingSyncOperationLogs() as QueuedSyncOperationRecord[];
  if (queuedOps.length === 0) {
    return result;
  }

  const queuedOpById = new Map(queuedOps.map((operation) => [operation.id, operation]));
  const queuedOpByIdempotencyKey = new Map(
    queuedOps.map((operation) => [operation.idempotency_key, operation])
  );

  try {
    const response = await fetch(`${serverUrl}/api/sync/push-ops`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: syncConfig?.clientId,
        operations: queuedOps.map((operation) => ({
          id: operation.id,
          opType: operation.op_type,
          aggregateId: operation.aggregate_id,
          idempotencyKey: operation.idempotency_key,
          payload: parseJsonValue(operation.payload, {}),
          baseVersion: operation.base_version,
        })),
      }),
    });

    const payload = (await readJsonBody<{
      error?: string;
      data?: {
        processed?: Array<{
          clientOperationId?: string | null;
          idempotencyKey: string;
          status: 'Applied' | 'Conflict' | 'Duplicate' | 'Failed';
          serverSeq?: number | null;
          conflict?: { message?: string; serverRecord?: Record<string, unknown> | null };
          error?: string;
        }>;
      };
    }>(response)) ?? { data: { processed: [] } };

    if (!response.ok && response.status !== 409) {
      const message = payload.error ?? `HTTP ${response.status}`;
      const disposition = isNetworkRetriableStatus(response.status) ? 'retry' : 'permanent';

      for (const operation of queuedOps) {
        markSyncOperationLogFailed(operation.id, message, disposition);
      }

      result.errors.push(`Sync v2 push failed: ${message}`);
      if (disposition === 'retry') {
        result.blockPull = true;
      }
      return result;
    }

    const processed = payload.data?.processed ?? [];
    for (const item of processed) {
      const localOperation =
        (item.clientOperationId ? queuedOpById.get(item.clientOperationId) : undefined) ??
        queuedOpByIdempotencyKey.get(item.idempotencyKey);

      if (!localOperation) {
        continue;
      }

      if (item.status === 'Applied' || item.status === 'Duplicate') {
        markSyncOperationLogProcessed(localOperation.id, item.serverSeq ?? null);
        result.pushed++;
        continue;
      }

      if (item.status === 'Conflict') {
        markSyncOperationLogConflict(localOperation.id, item.conflict ?? null);
        insertPendingSyncConflict({
          operation_id: localOperation.id,
          client_id: localOperation.client_id,
          aggregate_type: 'inventory_record',
          aggregate_id: localOperation.aggregate_id ?? null,
          local_payload: parseJsonValue(localOperation.payload, null),
          server_payload: item.conflict?.serverRecord ?? null,
        });
        result.conflicts++;
        result.errors.push(
          `Sync conflict for ${localOperation.op_type}: ${item.conflict?.message ?? 'Conflict detected'}`
        );
        continue;
      }

      markSyncOperationLogFailed(
        localOperation.id,
        item.error ?? 'Unknown sync-v2 failure',
        'permanent'
      );
      result.errors.push(
        `Sync v2 operation ${localOperation.id} failed: ${item.error ?? 'Unknown error'}`
      );
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Unknown sync-v2 error';
    for (const operation of queuedOps) {
      markSyncOperationLogFailed(operation.id, message, 'retry');
    }
    result.errors.push(`Sync v2 push failed: ${message}`);
    result.blockPull = true;
  }

  if (
    (getPendingSyncOperationLogs() as QueuedSyncOperationRecord[]).length > 0 ||
    (getPendingSyncConflicts() as QueuedSyncConflictRecord[]).length > 0
  ) {
    result.blockPull = true;
  }

  return result;
}

async function pushChanges(): Promise<{ pushed: number; conflicts: number; errors: string[]; blockPull: boolean }> {
  if (!syncConfig) {
    return { pushed: 0, conflicts: 0, errors: ['Not configured'], blockPull: true };
  }

  const token = syncConfig.getToken();
  if (!token) {
    return { pushed: 0, conflicts: 0, errors: ['Not authenticated'], blockPull: true };
  }

  const result = {
    pushed: 0,
    conflicts: 0,
    errors: [] as string[],
    blockPull: false,
  };

  const syncV2Result = await pushSyncV2OperationLog(syncConfig.serverUrl, token);
  result.pushed += syncV2Result.pushed;
  result.conflicts += syncV2Result.conflicts;
  result.errors.push(...syncV2Result.errors);
  if (syncV2Result.blockPull) {
    result.blockPull = true;
  }

  const legacyResult = await pushLegacySyncQueue(syncConfig.serverUrl, token);
  result.pushed += legacyResult.pushed;
  result.conflicts += legacyResult.conflicts;
  result.errors.push(...legacyResult.errors);
  if (getPendingSyncQueue().length > 0) {
    result.blockPull = true;
  }

  const queuedRequests = getPendingRequestSyncQueue() as QueuedRequestRecord[];
  for (const queuedRequest of queuedRequests) {
    try {
      const response = await replayQueuedRequest(queuedRequest, syncConfig.serverUrl, token);

      if (response.ok) {
        markRequestSyncProcessed(queuedRequest.id);
        result.pushed++;
        continue;
      }

      const message = await readErrorMessage(response);
      const disposition = isNetworkRetriableStatus(response.status) ? 'retry' : 'permanent';
      markRequestSyncFailed(
        queuedRequest.id,
        `HTTP ${response.status}: ${message}`,
        disposition
      );
      result.errors.push(`Request sync failed for ${queuedRequest.method} ${queuedRequest.path}: ${message}`);
      if (disposition === 'retry') {
        result.blockPull = true;
      }
    } catch (error: any) {
      markRequestSyncFailed(queuedRequest.id, error.message, 'retry');
      result.errors.push(
        `Request sync failed for ${queuedRequest.method} ${queuedRequest.path}: ${error.message}`
      );
      result.blockPull = true;
    }
  }

  if (getPendingRequestSyncQueue().length > 0) {
    result.blockPull = true;
  }

  return result;
}

async function pullSyncV2ChangeLog(serverUrl: string, token: string) {
  const result = { pulled: 0, errors: [] as string[] };

  let cursor = getSyncV2Cursor();

  while (true) {
    try {
      const url = new URL(`${serverUrl}/api/sync/log`);
      url.searchParams.set('sinceSeq', String(cursor));
      url.searchParams.set('limit', '200');

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        result.errors.push(await readErrorMessage(response));
        return result;
      }

      const payload = await readJsonBody<{
        data?: {
          changes?: SyncLogItem[];
          lastServerSeq?: number;
          hasMore?: boolean;
        };
      }>(response);
      const changes = payload?.data?.changes ?? [];

      for (const change of changes) {
        applyReplicaMutation({
          type: 'replica.mutation',
          table: change.table as any,
          action: change.action === 'delete' ? 'delete' : 'upsert',
          row: change.row,
          emittedAt: change.emittedAt,
        });
        cursor = Math.max(cursor, change.seq);
        result.pulled++;
      }

      const lastServerSeq = payload?.data?.lastServerSeq;
      if (typeof lastServerSeq === 'number') {
        cursor = Math.max(cursor, lastServerSeq);
      }

      setSyncV2Cursor(cursor);

      if (!payload?.data?.hasMore) {
        break;
      }
    } catch (error: any) {
      result.errors.push(`Sync v2 log pull failed: ${error.message}`);
      return result;
    }
  }

  return result;
}

async function pullChanges(): Promise<{ pulled: number; errors: string[] }> {
  if (!syncConfig) {
    return { pulled: 0, errors: ['Not configured'] };
  }

  const token = syncConfig.getToken();
  if (!token) {
    return { pulled: 0, errors: ['Not authenticated'] };
  }

  const result = { pulled: 0, errors: [] as string[] };

  try {
    const syncV2Result = await pullSyncV2ChangeLog(syncConfig.serverUrl, token);
    result.pulled += syncV2Result.pulled;
    result.errors.push(...syncV2Result.errors);

    const response = await fetch(`${syncConfig.serverUrl}/api/sync/replica/export`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      result.errors.push(await readErrorMessage(response));
      return result;
    }

    const payload = (await response.json()) as {
      data?: Partial<Record<string, unknown[]>>;
    };

    const snapshot = payload.data ?? {};
    replaceReplicaSnapshot(snapshot);
    clearProcessedRequestSyncQueue();

    result.pulled = Object.values(snapshot).reduce((total, rows) => {
      return total + (Array.isArray(rows) ? rows.length : 0);
    }, 0);

    setConfig('lastSyncTime', new Date().toISOString());
  } catch (error: any) {
    result.errors.push(`Replica pull failed: ${error.message}`);
  }

  return result;
}

export function queueOperation(operation: string, payload: any) {
  const clientId = getConfig('clientId') ?? uuidv4();
  setConfig('clientId', clientId);

  addToSyncQueue({
    id: uuidv4(),
    client_id: clientId,
    operation,
    payload,
  });
}

function clearRealtimeReconnectTimer() {
  if (!syncWebSocketReconnectTimer) {
    return;
  }

  clearTimeout(syncWebSocketReconnectTimer);
  syncWebSocketReconnectTimer = null;
}

function closeRealtimeSyncSocket() {
  const socket = syncWebSocket;
  syncWebSocket = null;
  syncWebSocketTarget = null;

  if (!socket) {
    return;
  }

  socket.onopen = null;
  socket.onclose = null;
  socket.onerror = null;
  socket.onmessage = null;

  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close();
  }
}

function hasPendingLocalChanges() {
  return (
    getPendingSyncQueue().length > 0 ||
    getPendingRequestSyncQueue().length > 0 ||
    (getPendingSyncOperationLogs() as QueuedSyncOperationRecord[]).length > 0 ||
    (getPendingSyncConflicts() as QueuedSyncConflictRecord[]).length > 0
  );
}

function buildRealtimeSyncUrl(serverUrl: string, token: string, clientId: string) {
  const url = new URL(serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/sync/ws`;
  url.search = '';
  url.searchParams.set('token', token);
  url.searchParams.set('clientId', clientId);
  return url.toString();
}

function scheduleRealtimeSyncReconnect() {
  if (!autoSyncEnabled || !syncConfig || !syncConfig.getToken()) {
    return;
  }

  clearRealtimeReconnectTimer();
  syncWebSocketReconnectTimer = setTimeout(() => {
    syncWebSocketReconnectTimer = null;
    refreshRealtimeSyncConnection();
  }, realtimeReconnectDelayMs);
  realtimeReconnectDelayMs = Math.min(realtimeReconnectDelayMs * 2, 30000);
}

function decodeRealtimeMessage(data: unknown) {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return null;
  }

  return null;
}

function connectRealtimeSync(target: string) {
  let socket: WebSocket;

  try {
    socket = new WebSocket(target);
  } catch (error: any) {
    syncStatus = {
      ...syncStatus,
      websocketConnected: false,
      lastRealtimeError: `Realtime sync failed to start: ${error.message}`,
    };
    needsFullReplicaPull = true;
    scheduleRealtimeSyncReconnect();
    return;
  }

  syncWebSocket = socket;
  syncWebSocketTarget = target;

  socket.onopen = () => {
    if (syncWebSocket !== socket) {
      return;
    }

    realtimeReconnectDelayMs = 1000;
    syncStatus = {
      ...syncStatus,
      websocketConnected: true,
      lastRealtimeError: null,
    };

    if (needsFullReplicaPull && !activeSyncPromise && !hasPendingLocalChanges()) {
      void syncAll({ forcePull: true });
    }
  };

  socket.onerror = () => {
    if (syncWebSocket !== socket) {
      return;
    }

    syncStatus = {
      ...syncStatus,
      lastRealtimeError: 'Realtime sync connection error.',
    };
  };

  socket.onclose = () => {
    if (syncWebSocket !== socket) {
      return;
    }

    syncWebSocket = null;
    syncWebSocketTarget = null;
    needsFullReplicaPull = true;
    syncStatus = {
      ...syncStatus,
      websocketConnected: false,
    };
    scheduleRealtimeSyncReconnect();
  };

  socket.onmessage = (event) => {
    if (syncWebSocket !== socket) {
      return;
    }

    const message = decodeRealtimeMessage(event.data);
    if (!message) {
      return;
    }

    try {
      const payload = JSON.parse(message) as ReplicaSyncEvent;
      handleRealtimeSyncEvent(payload);
    } catch (error: any) {
      needsFullReplicaPull = true;
      syncStatus = {
        ...syncStatus,
        lastRealtimeError: `Realtime sync payload parse failed: ${error.message}`,
      };
      if (!activeSyncPromise && !hasPendingLocalChanges()) {
        void syncAll({ forcePull: true });
      }
    }
  };
}

function handleRealtimeSyncEvent(event: ReplicaSyncEvent) {
  syncStatus = {
    ...syncStatus,
    lastRealtimeEventAt: event.emittedAt,
    lastRealtimeError:
      event.type === 'replica.snapshot-required' ? event.reason : syncStatus.lastRealtimeError,
  };

  if (event.type === 'replica.ready') {
    return;
  }

  if (event.type === 'replica.snapshot-required') {
    needsFullReplicaPull = true;

    if (!activeSyncPromise && !hasPendingLocalChanges()) {
      void syncAll({ forcePull: true });
    }

    return;
  }

  if (activeSyncPromise || hasPendingLocalChanges()) {
    needsFullReplicaPull = true;
    return;
  }

  try {
    applyReplicaMutation(event);
    setConfig('lastSyncTime', event.emittedAt);
  } catch (error: any) {
    needsFullReplicaPull = true;
    syncStatus = {
      ...syncStatus,
      lastRealtimeError: `Realtime sync apply failed: ${error.message}`,
    };
    if (!activeSyncPromise && !hasPendingLocalChanges()) {
      void syncAll({ forcePull: true });
    }
  }
}

export function processRealtimeSyncEvent(event: ReplicaSyncEvent) {
  handleRealtimeSyncEvent(event);
}
