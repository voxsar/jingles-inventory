import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  addToSyncQueue,
  applyReplicaMutation,
  clearProcessedQueue,
  clearProcessedRequestSyncQueue,
  getConfig,
  getPendingRequestSyncQueue,
  getSyncQueue,
  markRequestSyncFailed,
  markRequestSyncProcessed,
  markSyncProcessed,
  replaceReplicaSnapshot,
  setConfig,
} from '../offline/localDB';
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
  lastResult: SyncRunResult | null;
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

export function configureSyncEngine(config: SyncConfig) {
  syncConfig = config;
  needsFullReplicaPull = true;
  syncStatus = {
    ...syncStatus,
    configured: true,
    serverUrl: config.serverUrl,
    clientId: config.clientId,
  };

  if (autoSyncEnabled) {
    refreshRealtimeSyncConnection();
  }
}

export function getSyncStatus(): SyncStatus {
  return {
    ...syncStatus,
    lastResult: syncStatus.lastResult ? cloneResult(syncStatus.lastResult) : null,
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

    return result;
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

async function pushLegacySyncQueue(serverUrl: string, token: string) {
  const queuedOps = getSyncQueue();
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
        markSyncProcessed(item.id, 'Failed');
        result.errors.push(`Legacy sync operation ${item.id} failed: ${item.error ?? 'Unknown error'}`);
      }
    }

    clearProcessedQueue();
  } catch (error: any) {
    result.errors.push(`Legacy sync push failed: ${error.message}`);
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

  const legacyResult = await pushLegacySyncQueue(syncConfig.serverUrl, token);
  result.pushed += legacyResult.pushed;
  result.conflicts += legacyResult.conflicts;
  result.errors.push(...legacyResult.errors);
  if (getSyncQueue().length > 0) {
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
      const keepPending = isNetworkRetriableStatus(response.status);
      markRequestSyncFailed(
        queuedRequest.id,
        `HTTP ${response.status}: ${message}`,
        keepPending
      );
      result.errors.push(`Request sync failed for ${queuedRequest.method} ${queuedRequest.path}: ${message}`);
      if (keepPending) {
        result.blockPull = true;
      }
    } catch (error: any) {
      markRequestSyncFailed(queuedRequest.id, error.message, true);
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
  return getSyncQueue().length > 0 || getPendingRequestSyncQueue().length > 0;
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
