import fs from 'fs';
import {
  FAILED_PERMANENT_STATUS,
  applyReplicaMutation,
  clearProcessedRequestSyncQueue,
  deleteInventoryRecord,
  getConfig,
  getPendingSyncConflicts,
  getPendingSyncConflictDetailById,
  getPendingSyncConflictDetails,
  getPendingSyncOperationLogs,
  getPendingPosLanEvents,
  getPendingRequestSyncQueue,
  getSyncOutboxSummary,
  insertPendingSyncConflict,
  markRequestSyncFailed,
  markRequestSyncProcessed,
  markSyncConflictResolved,
  markSyncOperationLogConflict,
  markSyncOperationLogFailed,
  markSyncOperationLogProcessed,
  markPosLanEventsFailed,
  markPosLanEventsProcessed,
  clearProcessedPosLanEvents,
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

type SyncRunMode = 'full' | 'push_only' | 'pull_only';

interface SyncRunOptions {
  forcePull?: boolean;
  mode?: SyncRunMode;
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

type QueuedPosLanEventRecord = {
  event_id: string;
  device_id: string;
  terminal_id: string;
  sequence_num: number;
  vector_clock: string;
  event_json: string;
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

type SyncProgressPhase = 'preparing' | 'pushing' | 'pulling' | 'finalizing';

type SyncProgress = {
  phase: SyncProgressPhase;
  label: string;
  detail: string | null;
  percent: number;
  pending: number;
  pushed: number;
  pulled: number;
  conflicts: number;
  startedAt: string | null;
  updatedAt: string | null;
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
  progress: SyncProgress | null;
}

export interface SyncHealth {
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
  failedPermanentPolicy: FailedPermanentPolicyDescriptor;
  progress: SyncProgress | null;
}

const EMPTY_OUTBOX_SUMMARY: SyncOutboxSummary = {
  pending: 0,
  conflicts: 0,
  failedPermanent: 0,
};

const DEFAULT_FAILED_PERMANENT_RETENTION_DAYS = 7;
const SYNC_V2_SERVER_SEQ_CONFIG_KEY = 'syncV2LastServerSeq';
const SYNC_PROGRESS_PREPARING_PERCENT = 8;
const SYNC_PROGRESS_PUSH_START_PERCENT = 18;
const SYNC_PROGRESS_PUSH_END_PERCENT = 62;
const SYNC_PROGRESS_PULL_LOG_PERCENT = 76;
const SYNC_PROGRESS_PULL_SNAPSHOT_PERCENT = 90;
const SYNC_PROGRESS_FINALIZING_PERCENT = 97;

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
let syncHealthInitialized = false;
let latestObservedServerSeq: number | null = null;
let lastPublishedSyncHealth: SyncHealth | null = null;
const syncHealthListeners = new Set<(health: SyncHealth) => void>();
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
  progress: null,
};

function cloneResult(result: SyncRunResult): SyncRunResult {
  return {
    pushed: result.pushed,
    pulled: result.pulled,
    conflicts: result.conflicts,
    errors: [...result.errors],
  };
}

function cloneFailedPermanentPolicy(
  descriptor: FailedPermanentPolicyDescriptor
): FailedPermanentPolicyDescriptor {
  return {
    mode: descriptor.mode,
    retainDays: descriptor.retainDays,
  };
}

function clampSyncProgressPercent(percent: number) {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(percent)));
}

function cloneSyncProgress(progress: SyncProgress | null): SyncProgress | null {
  if (!progress) {
    return null;
  }

  return {
    phase: progress.phase,
    label: progress.label,
    detail: progress.detail,
    percent: progress.percent,
    pending: progress.pending,
    pushed: progress.pushed,
    pulled: progress.pulled,
    conflicts: progress.conflicts,
    startedAt: progress.startedAt,
    updatedAt: progress.updatedAt,
  };
}

function syncProgressEquals(left: SyncProgress | null, right: SyncProgress | null) {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.phase === right.phase &&
      left.label === right.label &&
      left.detail === right.detail &&
      left.percent === right.percent &&
      left.pending === right.pending &&
      left.pushed === right.pushed &&
      left.pulled === right.pulled &&
      left.conflicts === right.conflicts &&
      left.startedAt === right.startedAt &&
      left.updatedAt === right.updatedAt)
  );
}

function cloneSyncHealth(health: SyncHealth): SyncHealth {
  return {
    ...health,
    failedPermanentPolicy: cloneFailedPermanentPolicy(health.failedPermanentPolicy),
    progress: cloneSyncProgress(health.progress),
  };
}

function describeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatByteCount(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatElapsedMs(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function buildPreparationDetail(pendingCount: number, options: SyncRunOptions) {
  const queuedLabel =
    pendingCount > 0
      ? `${describeCount(pendingCount, 'queued local change')} ready to sync.`
      : 'No queued local changes found.';

  if (options.mode === 'push_only') {
    return `${queuedLabel} Only local changes will be pushed to the host.`;
  }

  if (options.mode === 'pull_only') {
    return 'Skipping local push. A manual replica refresh will run against the host.';
  }

  return options.forcePull
    ? `${queuedLabel} A full replica refresh will run after the push.`
    : `${queuedLabel} Checking whether the desktop replica needs a refresh.`;
}

function buildPushProgressDetail(processed: number, total: number, pendingCount: number) {
  if (total <= 0) {
    return 'No queued local changes found. Moving on to replica checks.';
  }

  const pendingLabel =
    pendingCount > 0
      ? `${describeCount(pendingCount, 'local change')} still waiting to sync.`
      : 'Outbox is clear.';

  return `${processed} of ${total} queued local changes processed. ${pendingLabel}`;
}

function buildPushProgressPercent(processed: number, total: number) {
  if (total <= 0) {
    return SYNC_PROGRESS_PUSH_END_PERCENT;
  }

  const ratio = Math.max(0, Math.min(1, processed / total));
  return clampSyncProgressPercent(
    SYNC_PROGRESS_PUSH_START_PERCENT +
      (SYNC_PROGRESS_PUSH_END_PERCENT - SYNC_PROGRESS_PUSH_START_PERCENT) * ratio
  );
}

function buildPullLogDetail(pulledCount: number) {
  if (pulledCount <= 0) {
    return 'Checking the server change log for replica updates.';
  }

  return `Applied ${describeCount(pulledCount, 'server change')} from the realtime log.`;
}

function buildSnapshotDownloadDetail(receivedBytes: number, totalBytes: number | null, elapsedMs: number) {
  const downloadedLabel = formatByteCount(receivedBytes);
  const elapsedLabel = formatElapsedMs(elapsedMs);

  if (totalBytes && totalBytes > 0) {
    const percent = Math.max(0, Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
    return `Downloading the latest replica snapshot from the host. ${downloadedLabel} of ${formatByteCount(totalBytes)} received (${percent}%) after ${elapsedLabel}.`;
  }

  return `Downloading the latest replica snapshot from the host. ${downloadedLabel} received after ${elapsedLabel}.`;
}

function buildSnapshotApplyDetail(tableCount: number, rowCount: number) {
  return `Applying snapshot locally across ${describeCount(tableCount, 'table')} and ${describeCount(rowCount, 'row')}.`;
}

function buildSnapshotDownloadPercent(receivedBytes: number, totalBytes: number | null) {
  if (!totalBytes || totalBytes <= 0) {
    return SYNC_PROGRESS_PULL_SNAPSHOT_PERCENT;
  }

  const ratio = Math.max(0, Math.min(1, receivedBytes / totalBytes));
  return clampSyncProgressPercent(SYNC_PROGRESS_PULL_SNAPSHOT_PERCENT + ratio * 4);
}

async function readResponseTextWithProgress(
  response: Response,
  onProgress: (receivedBytes: number, totalBytes: number | null, elapsedMs: number) => void
) {
  const totalBytesHeader = response.headers.get('content-length');
  const parsedTotalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : Number.NaN;
  const totalBytes = Number.isFinite(parsedTotalBytes) && parsedTotalBytes > 0 ? parsedTotalBytes : null;
  const startedAt = Date.now();
  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();
    onProgress(text.length, totalBytes, Date.now() - startedAt);
    return text;
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let lastPublishedAt = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    chunks.push(value);
    receivedBytes += value.byteLength;

    const now = Date.now();
    if (now - lastPublishedAt >= 500) {
      onProgress(receivedBytes, totalBytes, now - startedAt);
      lastPublishedAt = now;
    }
  }

  onProgress(receivedBytes, totalBytes, Date.now() - startedAt);

  const payload = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(payload);
}

function buildFinalizingDetail(
  result: SyncRunResult,
  skippedPull: boolean,
  mode: SyncRunMode
) {
  if (result.errors.length > 0) {
    return result.errors[0];
  }

  if (mode === 'push_only') {
    return `Pushed ${describeCount(result.pushed, 'local change')} without refreshing the replica snapshot.`;
  }

  if (mode === 'pull_only') {
    return `Refreshed ${describeCount(result.pulled, 'replica row')} without sending queued local changes.`;
  }

  if (skippedPull) {
    return `Synced ${describeCount(result.pushed, 'local change')} and kept the current replica snapshot.`;
  }

  return `Synced ${describeCount(result.pushed, 'local change')} and refreshed ${describeCount(result.pulled, 'replica row')}.`;
}

function updateSyncProgress(
  patch: Pick<SyncProgress, 'phase' | 'label' | 'percent'> &
    Partial<Omit<SyncProgress, 'phase' | 'label' | 'percent'>>,
  options: { publish?: boolean } = {}
) {
  const previous = syncStatus.progress;
  applySyncStatusPatch(
    {
      progress: {
        phase: patch.phase,
        label: patch.label,
        detail: patch.detail ?? previous?.detail ?? null,
        percent: clampSyncProgressPercent(patch.percent),
        pending: patch.pending ?? syncStatus.outbox.pending,
        pushed: patch.pushed ?? previous?.pushed ?? 0,
        pulled: patch.pulled ?? previous?.pulled ?? 0,
        conflicts: patch.conflicts ?? previous?.conflicts ?? 0,
        startedAt: patch.startedAt ?? previous?.startedAt ?? syncStatus.lastStartedAt,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      },
    },
    options
  );
}

function readConfigNumber(key: string): number | null {
  const rawValue = getConfig(key);
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

function ensureSyncHealthInitialized() {
  if (syncHealthInitialized) {
    return;
  }

  latestObservedServerSeq = readConfigNumber(SYNC_V2_SERVER_SEQ_CONFIG_KEY);
  syncHealthInitialized = true;
}

function buildSyncHealthSnapshot(): SyncHealth {
  ensureSyncHealthInitialized();

  const localCursor = getSyncV2Cursor();
  const latestServerSeq = Math.max(localCursor, latestObservedServerSeq ?? 0);

  return {
    pendingCount: syncStatus.outbox.pending,
    conflictCount: syncStatus.outbox.conflicts,
    failedPermanentCount: syncStatus.outbox.failedPermanent,
    lastSuccessfulSyncAt: syncStatus.lastSuccessfulSyncAt,
    lastSyncError: syncStatus.lastResult?.errors[0] ?? null,
    lastRealtimeError: syncStatus.lastRealtimeError,
    running: syncStatus.running,
    websocketConnected: syncStatus.websocketConnected,
    cursorLag: Math.max(0, latestServerSeq - localCursor),
    localCursor,
    latestServerSeq,
    failedPermanentPolicy: cloneFailedPermanentPolicy(syncStatus.failedPermanentPolicy),
    progress: cloneSyncProgress(syncStatus.progress),
  };
}

function syncHealthEquals(left: SyncHealth | null, right: SyncHealth) {
  return (
    left !== null &&
    left.pendingCount === right.pendingCount &&
    left.conflictCount === right.conflictCount &&
    left.failedPermanentCount === right.failedPermanentCount &&
    left.lastSuccessfulSyncAt === right.lastSuccessfulSyncAt &&
    left.lastSyncError === right.lastSyncError &&
    left.lastRealtimeError === right.lastRealtimeError &&
    left.running === right.running &&
    left.websocketConnected === right.websocketConnected &&
    left.cursorLag === right.cursorLag &&
    left.localCursor === right.localCursor &&
    left.latestServerSeq === right.latestServerSeq &&
    left.failedPermanentPolicy.mode === right.failedPermanentPolicy.mode &&
    left.failedPermanentPolicy.retainDays === right.failedPermanentPolicy.retainDays &&
    syncProgressEquals(left.progress, right.progress)
  );
}

function publishSyncHealthIfChanged() {
  const nextHealth = buildSyncHealthSnapshot();
  if (syncHealthEquals(lastPublishedSyncHealth, nextHealth)) {
    return;
  }

  lastPublishedSyncHealth = cloneSyncHealth(nextHealth);
  for (const listener of syncHealthListeners) {
    listener(cloneSyncHealth(nextHealth));
  }
}

function updateObservedServerSeq(
  seq: number | null | undefined,
  options: { publish?: boolean } = {}
) {
  if (typeof seq !== 'number' || !Number.isFinite(seq) || seq < 0) {
    return;
  }

  ensureSyncHealthInitialized();

  const normalizedSeq = Math.max(0, Math.trunc(seq));
  if (latestObservedServerSeq !== null && normalizedSeq <= latestObservedServerSeq) {
    return;
  }

  latestObservedServerSeq = normalizedSeq;
  setConfig(SYNC_V2_SERVER_SEQ_CONFIG_KEY, String(normalizedSeq));

  if (options.publish !== false) {
    publishSyncHealthIfChanged();
  }
}

function applySyncStatusPatch(
  patch: Partial<SyncStatus>,
  options: { publish?: boolean } = {}
) {
  syncStatus = {
    ...syncStatus,
    ...patch,
  };

  if (options.publish !== false) {
    publishSyncHealthIfChanged();
  }
}

function refreshOutboxState(options: { publish?: boolean } = {}) {
  if (FAILED_PERMANENT_POLICY.mode !== 'hold') {
    pruneFailedPermanentOutbox(FAILED_PERMANENT_POLICY.retainDays ?? 0);
  }

  applySyncStatusPatch(
    {
      outbox: getSyncOutboxSummary(),
      failedPermanentPolicy: getFailedPermanentPolicyDescriptor(),
    },
    options
  );
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
    const preformattedMatch = body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preformattedMatch?.[1]) {
      return preformattedMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (/<\/?[a-z][\s\S]*>/i.test(body)) {
      const collapsed = body
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

      if (collapsed) {
        return collapsed;
      }
    }

    return body.trim();
  }
}

function isMissingSyncLogEndpoint(status: number, message: string) {
  if (status === 404) {
    return true;
  }

  return /cannot get\s+\/api\/sync\/log|not found/i.test(message);
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
        `Unsupported or corrupt sync operation type: ${conflict.operation_type ?? 'unknown'}.`
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
  const normalizedSeq = Math.max(0, Math.trunc(seq));
  setConfig('syncV2Cursor', String(normalizedSeq));
  updateObservedServerSeq(normalizedSeq, { publish: false });
  publishSyncHealthIfChanged();
}

export function configureSyncEngine(config: SyncConfig) {
  syncConfig = config;
  needsFullReplicaPull = true;
  syncHealthInitialized = false;
  lastPublishedSyncHealth = null;
  applySyncStatusPatch(
    {
      configured: true,
      serverUrl: config.serverUrl,
      clientId: config.clientId,
    },
    { publish: false }
  );
  refreshOutboxState();

  if (autoSyncEnabled) {
    refreshRealtimeSyncConnection();
  }
}

export function getSyncStatus(): SyncStatus {
  refreshOutboxState({ publish: false });
  return {
    ...syncStatus,
    lastResult: syncStatus.lastResult ? cloneResult(syncStatus.lastResult) : null,
    outbox: { ...syncStatus.outbox },
    failedPermanentPolicy: cloneFailedPermanentPolicy(syncStatus.failedPermanentPolicy),
    progress: cloneSyncProgress(syncStatus.progress),
  };
}

export function getSyncHealth(): SyncHealth {
  refreshOutboxState({ publish: false });
  return cloneSyncHealth(buildSyncHealthSnapshot());
}

export function subscribeSyncHealth(listener: (health: SyncHealth) => void) {
  syncHealthListeners.add(listener);
  listener(getSyncHealth());

  return () => {
    syncHealthListeners.delete(listener);
  };
}

export function getSyncOutbox(): ElectronSyncOutboxSnapshot {
  refreshOutboxState({ publish: false });

  const conflicts = (getPendingSyncConflictDetails() as SyncConflictDetailRecord[]).map(
    mapConflictEntry
  );
  const syncOperationCount = (getPendingSyncOperationLogs() as QueuedSyncOperationRecord[]).length;
  const requestQueueCount = (getPendingRequestSyncQueue() as QueuedRequestRecord[]).length;

  return {
    summary: {
      syncOperationCount,
      requestQueueCount,
      conflictCount: conflicts.length,
      totalCount: syncOperationCount + requestQueueCount + conflicts.length,
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
  applySyncStatusPatch(
    {
      autoSyncIntervalMs: intervalMs,
    },
    { publish: false }
  );
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
  applySyncStatusPatch(
    {
      autoSyncIntervalMs: null,
      websocketConnected: false,
    },
    { publish: false }
  );
  refreshOutboxState();
}

export function refreshRealtimeSyncConnection() {
  if (!autoSyncEnabled || !syncConfig) {
    clearRealtimeReconnectTimer();
    closeRealtimeSyncSocket();
    return;
  }

  if (typeof WebSocket === 'undefined') {
    applySyncStatusPatch({
      websocketConnected: false,
      lastRealtimeError: 'WebSocket is not available in this runtime.',
    });
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
    const mode = options.mode ?? 'full';
    const result: SyncRunResult = {
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
    };
    let skippedPull = false;

    if (!syncConfig) {
      result.errors.push('Sync not configured');
      applySyncStatusPatch({
        configured: false,
        lastResult: cloneResult(result),
        progress: null,
      });
      return result;
    }

    const startedAt = new Date().toISOString();
    applySyncStatusPatch({
      configured: true,
      running: true,
      serverUrl: syncConfig.serverUrl,
      clientId: syncConfig.clientId,
      lastStartedAt: startedAt,
    }, { publish: false });
    updateSyncProgress({
      phase: 'preparing',
      label: 'Preparing desktop sync',
      detail: buildPreparationDetail(syncStatus.outbox.pending, options),
      percent: SYNC_PROGRESS_PREPARING_PERCENT,
      pending: syncStatus.outbox.pending,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      startedAt,
    });

    try {
      if (mode === 'pull_only') {
        const pullResult = await pullChanges();
        result.pulled = pullResult.pulled;
        result.errors.push(...pullResult.errors);
        if (pullResult.errors.length === 0) {
          needsFullReplicaPull = false;
        }
      } else {
        const pushResult = await pushChanges();
        result.pushed = pushResult.pushed;
        result.conflicts = pushResult.conflicts;
        result.errors.push(...pushResult.errors);

        if (mode === 'push_only') {
          skippedPull = true;
          updateSyncProgress({
            phase: 'finalizing',
            label: 'Finalizing desktop sync',
            detail: 'Local changes were pushed. Manual replica refresh was skipped.',
            percent: SYNC_PROGRESS_FINALIZING_PERCENT,
            pending: syncStatus.outbox.pending,
            pushed: result.pushed,
            pulled: result.pulled,
            conflicts: result.conflicts,
          });
        } else {
          const shouldPull =
            options.forcePull || needsFullReplicaPull || !syncStatus.websocketConnected;

          if (pushResult.blockPull) {
            skippedPull = true;
            result.errors.push('Replica pull skipped because some local changes are still pending sync.');
          } else if (shouldPull) {
            const pullResult = await pullChanges();
            result.pulled = pullResult.pulled;
            result.errors.push(...pullResult.errors);
            if (pullResult.errors.length === 0) {
              needsFullReplicaPull = false;
            }
          } else {
            skippedPull = true;
            updateSyncProgress({
              phase: 'finalizing',
              label: 'Finalizing desktop sync',
              detail: 'Local changes are synced. Realtime replica is already current.',
              percent: SYNC_PROGRESS_FINALIZING_PERCENT,
              pending: syncStatus.outbox.pending,
              pushed: result.pushed,
              pulled: result.pulled,
              conflicts: result.conflicts,
            });
          }
        }
      }
    } catch (err: any) {
      result.errors.push(`Sync failed: ${err.message}`);
    }

    const completedAt = new Date().toISOString();
    updateSyncProgress(
      {
        phase: 'finalizing',
        label: result.errors.length > 0 ? 'Finalizing with sync issues' : 'Finalizing desktop sync',
        detail: buildFinalizingDetail(result, skippedPull, mode),
        percent: SYNC_PROGRESS_FINALIZING_PERCENT,
        pending: syncStatus.outbox.pending,
        pushed: result.pushed,
        pulled: result.pulled,
        conflicts: result.conflicts,
      },
      { publish: false }
    );
    applySyncStatusPatch(
      {
        running: false,
        lastCompletedAt: completedAt,
        lastSuccessfulSyncAt:
          result.errors.length === 0 ? completedAt : syncStatus.lastSuccessfulSyncAt,
        lastResult: cloneResult(result),
        progress: null,
      },
      { publish: false }
    );
    refreshOutboxState();

    return result;
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

export function syncPushOnly() {
  return syncAll({ mode: 'push_only' });
}

export function syncPullOnly() {
  return syncAll({ forcePull: true, mode: 'pull_only' });
}

async function pushSyncV2OperationLog(
  serverUrl: string,
  token: string,
  options: {
    pendingConflicts?: QueuedSyncConflictRecord[];
    queuedOps?: QueuedSyncOperationRecord[];
  } = {}
) {
  const result = {
    pushed: 0,
    conflicts: 0,
    errors: [] as string[],
    blockPull: false,
  };

  const pendingConflicts =
    options.pendingConflicts ?? (getPendingSyncConflicts() as QueuedSyncConflictRecord[]);
  if (pendingConflicts.length > 0) {
    result.errors.push('Sync blocked by unresolved local conflicts.');
    result.blockPull = true;
    return result;
  }

  const queuedOps =
    options.queuedOps ?? (getPendingSyncOperationLogs() as QueuedSyncOperationRecord[]);
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
        lastServerSeq?: number | null;
      };
    }>(response)) ?? { data: { processed: [] } };

    updateObservedServerSeq(payload.data?.lastServerSeq, { publish: false });

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

async function pushPosLanEvents(serverUrl: string, token: string) {
  const queued = getPendingPosLanEvents() as QueuedPosLanEventRecord[];
  const result = { pushed: 0, errors: [] as string[], blockPull: false };
  const groups = new Map<string, QueuedPosLanEventRecord[]>();
  for (const row of queued) {
    const key = `${row.device_id}\u0000${row.terminal_id}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const rows of groups.values()) {
    const eventIds = rows.map((row) => row.event_id);
    try {
      const vectorClock = rows.reduce<Record<string, number>>((clock, row) => {
        const candidate = parseJsonValue<Record<string, number>>(row.vector_clock, {});
        for (const [deviceId, sequence] of Object.entries(candidate)) {
          if (Number.isFinite(sequence)) clock[deviceId] = Math.max(clock[deviceId] ?? 0, sequence);
        }
        return clock;
      }, {});
      const response = await fetch(`${serverUrl}/api/pos/sync/playback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: rows[0].device_id,
          terminalId: rows[0].terminal_id,
          vectorClock,
          events: rows.map((row) => parseJsonValue(row.event_json, {})),
        }),
      });
      const payload = await readJsonBody<{
        error?: string;
        acceptedEventIds?: string[];
        serverVectorClock?: Record<string, number>;
      }>(response);
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
      const accepted = new Set(payload?.acceptedEventIds ?? []);
      const acknowledged = eventIds.filter((id) => accepted.has(id));
      markPosLanEventsProcessed(acknowledged);
      result.pushed += acknowledged.length;
      const missing = eventIds.filter((id) => !accepted.has(id));
      if (missing.length > 0) {
        const message = `Cloud did not acknowledge ${missing.length} relayed POS event(s).`;
        markPosLanEventsFailed(missing, message);
        result.errors.push(message);
        result.blockPull = true;
      }

      if (payload?.serverVectorClock) {
        await fetch(`${serverUrl}/api/pos/sync/confirm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: rows[0].device_id,
            terminalId: rows[0].terminal_id,
            vectorClock: payload.serverVectorClock,
          }),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown relayed POS sync error';
      markPosLanEventsFailed(eventIds, message);
      result.errors.push(`Relayed POS sync failed: ${message}`);
      result.blockPull = true;
    }
  }

  clearProcessedPosLanEvents();
  return result;
}

async function pushChanges(): Promise<{ pushed: number; conflicts: number; errors: string[]; blockPull: boolean }> {
  if (!syncConfig) {
    updateSyncProgress({
      phase: 'pushing',
      label: 'Pushing desktop changes',
      detail: 'Sync is not configured for this desktop.',
      percent: SYNC_PROGRESS_PUSH_START_PERCENT,
      pending: syncStatus.outbox.pending,
    });
    return { pushed: 0, conflicts: 0, errors: ['Not configured'], blockPull: true };
  }

  const token = syncConfig.getToken();
  if (!token) {
    updateSyncProgress({
      phase: 'pushing',
      label: 'Pushing desktop changes',
      detail:
        'Local sign-in is active, but this desktop has no cached host sync token yet. Sign in once while online to bootstrap sync.',
      percent: SYNC_PROGRESS_PUSH_START_PERCENT,
      pending: syncStatus.outbox.pending,
    });
    return { pushed: 0, conflicts: 0, errors: ['No cached host sync token'], blockPull: true };
  }

  const result = {
    pushed: 0,
    conflicts: 0,
    errors: [] as string[],
    blockPull: false,
  };
  const queuedSyncOperations = getPendingSyncOperationLogs() as QueuedSyncOperationRecord[];
  const queuedRequests = getPendingRequestSyncQueue() as QueuedRequestRecord[];
  const queuedPosLanEvents = getPendingPosLanEvents() as QueuedPosLanEventRecord[];
  const syncOperationWorkUnits = queuedSyncOperations.length;
  const totalWorkUnits = syncOperationWorkUnits + queuedRequests.length + queuedPosLanEvents.length;
  let processedWorkUnits = 0;

  const publishPushProgress = (detail?: string) => {
    refreshOutboxState({ publish: false });
    updateSyncProgress({
      phase: 'pushing',
      label: totalWorkUnits > 0 ? 'Pushing desktop changes' : 'Checking local outbox',
      detail: detail ?? buildPushProgressDetail(processedWorkUnits, totalWorkUnits, syncStatus.outbox.pending),
      percent: buildPushProgressPercent(processedWorkUnits, totalWorkUnits),
      pending: syncStatus.outbox.pending,
      pushed: result.pushed,
      conflicts: result.conflicts,
    });
  };

  publishPushProgress();

  const posLanResult = await pushPosLanEvents(syncConfig.serverUrl, token);
  result.pushed += posLanResult.pushed;
  result.errors.push(...posLanResult.errors);
  result.blockPull ||= posLanResult.blockPull;
  processedWorkUnits += queuedPosLanEvents.length;
  publishPushProgress(posLanResult.errors[0]);

  const syncV2Result = await pushSyncV2OperationLog(syncConfig.serverUrl, token, {
    queuedOps: queuedSyncOperations,
  });
  result.pushed += syncV2Result.pushed;
  result.conflicts += syncV2Result.conflicts;
  result.errors.push(...syncV2Result.errors);
  if (syncV2Result.blockPull) {
    result.blockPull = true;
  }
  processedWorkUnits += syncOperationWorkUnits;
  publishPushProgress(syncV2Result.errors[0]);

  for (const queuedRequest of queuedRequests) {
    try {
      const response = await replayQueuedRequest(queuedRequest, syncConfig.serverUrl, token);

      if (response.ok) {
        markRequestSyncProcessed(queuedRequest.id);
        result.pushed++;
        processedWorkUnits += 1;
        publishPushProgress();
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
      processedWorkUnits += 1;
      publishPushProgress(`Request sync failed for ${queuedRequest.method} ${queuedRequest.path}: ${message}`);
    } catch (error: any) {
      markRequestSyncFailed(queuedRequest.id, error.message, 'retry');
      result.errors.push(
        `Request sync failed for ${queuedRequest.method} ${queuedRequest.path}: ${error.message}`
      );
      result.blockPull = true;
      processedWorkUnits += 1;
      publishPushProgress(
        `Request sync failed for ${queuedRequest.method} ${queuedRequest.path}: ${error.message}`
      );
    }
  }

  if (getPendingRequestSyncQueue().length > 0) {
    result.blockPull = true;
  }

  publishPushProgress(result.errors[0]);

  return result;
}

async function pullSyncV2ChangeLog(serverUrl: string, token: string) {
  const result = {
    pulled: 0,
    errors: [] as string[],
    skipped: false,
    skipReason: null as string | null,
  };

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
        const message = await readErrorMessage(response);
        if (isMissingSyncLogEndpoint(response.status, message)) {
          result.skipped = true;
          result.skipReason = 'The host does not expose /api/sync/log, so desktop sync is using snapshot-only compatibility mode.';
          return result;
        }

        result.errors.push(message);
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
      updateSyncProgress({
        phase: 'pulling',
        label: 'Refreshing desktop replica',
        detail: buildPullLogDetail(result.pulled),
        percent: SYNC_PROGRESS_PULL_LOG_PERCENT,
        pending: syncStatus.outbox.pending,
        pulled: result.pulled,
      });

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
    updateSyncProgress({
      phase: 'pulling',
      label: 'Refreshing desktop replica',
      detail: 'Sync is not configured for this desktop.',
      percent: SYNC_PROGRESS_PULL_LOG_PERCENT,
      pending: syncStatus.outbox.pending,
    });
    return { pulled: 0, errors: ['Not configured'] };
  }

  const token = syncConfig.getToken();
  if (!token) {
    updateSyncProgress({
      phase: 'pulling',
      label: 'Refreshing desktop replica',
      detail:
        'Local sign-in is active, but this desktop has no cached host sync token yet. Sign in once while online to bootstrap sync.',
      percent: SYNC_PROGRESS_PULL_LOG_PERCENT,
      pending: syncStatus.outbox.pending,
    });
    return { pulled: 0, errors: ['No cached host sync token'] };
  }

  const result = { pulled: 0, errors: [] as string[] };
  updateSyncProgress({
    phase: 'pulling',
    label: 'Refreshing desktop replica',
    detail: buildPullLogDetail(0),
    percent: SYNC_PROGRESS_PULL_LOG_PERCENT,
    pending: syncStatus.outbox.pending,
  });

  try {
    const syncV2Result = await pullSyncV2ChangeLog(syncConfig.serverUrl, token);
    result.pulled += syncV2Result.pulled;
    result.errors.push(...syncV2Result.errors);
    updateSyncProgress({
      phase: 'pulling',
      label: 'Refreshing desktop replica',
      detail:
        syncV2Result.skipped && syncV2Result.skipReason
          ? syncV2Result.skipReason
          : 'Downloading the latest replica snapshot from the host.',
      percent: SYNC_PROGRESS_PULL_SNAPSHOT_PERCENT,
      pending: syncStatus.outbox.pending,
      pulled: result.pulled,
    });

    const snapshotDownloadStartedAt = Date.now();
    const response = await fetch(`${syncConfig.serverUrl}/api/sync/replica/export`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      result.errors.push(await readErrorMessage(response));
      return result;
    }

    const responseText = await readResponseTextWithProgress(
      response,
      (receivedBytes, totalBytes, elapsedMs) => {
        updateSyncProgress({
          phase: 'pulling',
          label: 'Refreshing desktop replica',
          detail: buildSnapshotDownloadDetail(receivedBytes, totalBytes, elapsedMs),
          percent: buildSnapshotDownloadPercent(receivedBytes, totalBytes),
          pending: syncStatus.outbox.pending,
          pulled: result.pulled,
        });
      }
    );

    const payload = JSON.parse(responseText) as {
      data?: Partial<Record<string, unknown[]>>;
    };

    const snapshot = payload.data ?? {};
    const snapshotTableCount = Object.keys(snapshot).length;
    const snapshotRowCount = Object.values(snapshot).reduce((total, rows) => {
      return total + (Array.isArray(rows) ? rows.length : 0);
    }, 0);
    updateSyncProgress({
      phase: 'pulling',
      label: 'Refreshing desktop replica',
      detail: `${buildSnapshotApplyDetail(snapshotTableCount, snapshotRowCount)} Snapshot download finished after ${formatElapsedMs(Date.now() - snapshotDownloadStartedAt)}.`,
      percent: SYNC_PROGRESS_PULL_SNAPSHOT_PERCENT + 5,
      pending: syncStatus.outbox.pending,
      pulled: result.pulled,
    });
    replaceReplicaSnapshot(snapshot);
    clearProcessedRequestSyncQueue();

    result.pulled = snapshotRowCount;
    refreshOutboxState({ publish: false });
    updateSyncProgress({
      phase: 'pulling',
      label: 'Refreshing desktop replica',
      detail: `Loaded ${describeCount(result.pulled, 'replica row')} into the desktop cache and cleared processed queue entries.`,
      percent: SYNC_PROGRESS_FINALIZING_PERCENT - 1,
      pending: syncStatus.outbox.pending,
      pulled: result.pulled,
    });

    setConfig('lastSyncTime', new Date().toISOString());
  } catch (error: any) {
    result.errors.push(`Replica pull failed: ${error.message}`);
  }

  return result;
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
    applySyncStatusPatch({
      websocketConnected: false,
      lastRealtimeError: `Realtime sync failed to start: ${error.message}`,
    });
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
    applySyncStatusPatch({
      websocketConnected: true,
      lastRealtimeError: null,
    });

    if (needsFullReplicaPull && !activeSyncPromise && !hasPendingLocalChanges()) {
      void syncAll({ forcePull: true });
    }
  };

  socket.onerror = () => {
    if (syncWebSocket !== socket) {
      return;
    }

    applySyncStatusPatch({
      lastRealtimeError: 'Realtime sync connection error.',
    });
  };

  socket.onclose = () => {
    if (syncWebSocket !== socket) {
      return;
    }

    syncWebSocket = null;
    syncWebSocketTarget = null;
    needsFullReplicaPull = true;
    applySyncStatusPatch({
      websocketConnected: false,
    });
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
      applySyncStatusPatch({
        lastRealtimeError: `Realtime sync payload parse failed: ${error.message}`,
      });
      if (!activeSyncPromise && !hasPendingLocalChanges()) {
        void syncAll({ forcePull: true });
      }
    }
  };
}

function handleRealtimeSyncEvent(event: ReplicaSyncEvent) {
  applySyncStatusPatch({
    lastRealtimeEventAt: event.emittedAt,
    lastRealtimeError:
      event.type === 'replica.snapshot-required' ? event.reason : syncStatus.lastRealtimeError,
  });

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
    applySyncStatusPatch({
      lastRealtimeError: `Realtime sync apply failed: ${error.message}`,
    });
    if (!activeSyncPromise && !hasPendingLocalChanges()) {
      void syncAll({ forcePull: true });
    }
  }
}

export function processRealtimeSyncEvent(event: ReplicaSyncEvent) {
  handleRealtimeSyncEvent(event);
}
