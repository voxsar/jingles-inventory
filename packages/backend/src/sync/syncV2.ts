import { randomUUID } from 'crypto';
import { isLocalReplicaMode } from '../utils/runtimePaths';

export const SYNC_V2_OPERATION_TYPES = {
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_UPDATE: 'inventory.update',
  INVENTORY_BOX_OPEN: 'inventory.box-open',
  INVENTORY_TRANSITION: 'inventory.transition',
} as const;

export type SyncV2OperationType =
  (typeof SYNC_V2_OPERATION_TYPES)[keyof typeof SYNC_V2_OPERATION_TYPES];

export const SYNC_V2_STATUSES = {
  PENDING: 'Pending',
  PROCESSED: 'Processed',
  FAILED: 'Failed',
  CONFLICT: 'Conflict',
} as const;

export type SyncV2ChangeAction = 'upsert' | 'delete';
export type SyncV2ChangeTable = 'inventory_records' | 'inventory_events';

export interface SyncV2ChangeDescriptor {
  tableName: SyncV2ChangeTable;
  rowId: string;
  action: SyncV2ChangeAction;
}

export interface QueueLocalSyncOperationInput {
  opType: SyncV2OperationType;
  aggregateId?: string | null;
  baseVersion?: number | null;
  payload: Record<string, unknown>;
}

export interface SyncV2ConflictData {
  code: string;
  message: string;
  operation: Record<string, unknown>;
  serverRecord?: Record<string, unknown> | null;
}

type PrismaTransactionLike = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  syncOperationLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  };
  syncServerSequence: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ seq: number }>;
  };
  syncServerChange: {
    createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<unknown>;
  };
};

async function ensureLocalClientId(tx: PrismaTransactionLike): Promise<string> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT value FROM config WHERE key = ? LIMIT 1`,
    'clientId'
  )) as Array<{ value?: string }>;

  const existingClientId = rows[0]?.value?.trim();
  if (existingClientId) {
    return existingClientId;
  }

  const generatedClientId = randomUUID();
  await tx.$executeRawUnsafe(
    `
      INSERT INTO config (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    'clientId',
    generatedClientId
  );

  return generatedClientId;
}

export async function enqueueLocalSyncOperation(
  tx: PrismaTransactionLike,
  input: QueueLocalSyncOperationInput
) {
  if (!isLocalReplicaMode()) {
    return null;
  }

  const clientId = await ensureLocalClientId(tx);
  return tx.syncOperationLog.create({
    data: {
      clientId,
      opType: input.opType,
      aggregateType: 'inventory_record',
      aggregateId: input.aggregateId ?? null,
      idempotencyKey: randomUUID(),
      payload: input.payload as any,
      baseVersion: input.baseVersion ?? null,
      status: SYNC_V2_STATUSES.PENDING,
      attemptCount: 0,
    },
  });
}

export async function recordServerSyncChanges(
  tx: PrismaTransactionLike,
  input: {
    operationId?: string | null;
    aggregateId?: string | null;
    changes: SyncV2ChangeDescriptor[];
  }
) {
  if (isLocalReplicaMode() || input.changes.length === 0) {
    return null;
  }

  const sequence = await tx.syncServerSequence.create({
    data: {
      operationId: input.operationId ?? null,
      aggregateType: 'inventory_record',
      aggregateId: input.aggregateId ?? null,
    },
  });

  await tx.syncServerChange.createMany({
    data: input.changes.map((change) => ({
      seq: sequence.seq,
      tableName: change.tableName,
      rowId: change.rowId,
      action: change.action,
    })),
  });

  return sequence.seq;
}
