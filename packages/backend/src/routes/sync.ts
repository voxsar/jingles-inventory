import { Prisma } from '@prisma/client';
import { Router, Response } from 'express';
import {
  InventoryEventType,
  InventoryState,
  REPLICA_TABLES,
  UserRole,
} from '@jingles/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';
import logger from '../utils/logger';
import { performTransition } from '../modules/inventory/stateMachine';
import { convert } from '../modules/conversion/unitConverter';
import { assertVariantBatchReferences } from '../modules/catalog/variantReferences';
import { getStatusesByKeys, SpecialStatusKeys } from '../modules/statuses/statusLookup';
import {
  SYNC_V2_OPERATION_TYPES,
  SYNC_V2_STATUSES,
  type SyncV2ConflictData,
  type SyncV2ChangeDescriptor,
  recordServerSyncChanges,
} from '../sync/syncV2';

interface SyncV2Operation {
  id?: string;
  opType?: string;
  aggregateId?: string | null;
  idempotencyKey?: string;
  baseVersion?: number | null;
  payload?: Record<string, unknown>;
}

type SyncV2ProcessedStatus = 'Applied' | 'Conflict' | 'Duplicate' | 'Failed';

type SyncV2ProcessedResult = {
  clientOperationId: string | null;
  id: string;
  idempotencyKey: string;
  status: SyncV2ProcessedStatus;
  serverSeq?: number | null;
  conflict?: SyncV2ConflictData;
  error?: string;
};

class SyncConflictError extends Error {
  public readonly conflict: SyncV2ConflictData;

  constructor(conflict: SyncV2ConflictData) {
    super(conflict.message);
    this.name = 'SyncConflictError';
    this.conflict = conflict;
  }
}

const router = Router();

router.use(authenticate);

const REPLICA_EXPORT_FILTERS: Partial<Record<string, string>> = {
  status_options: `"deleted_at" IS NULL`,
};

function buildReplicaExportQuery(tableName: string) {
  const filter = REPLICA_EXPORT_FILTERS[tableName];
  return filter ? `SELECT * FROM "${tableName}" WHERE ${filter}` : `SELECT * FROM "${tableName}"`;
}

function isReplicaRowDeleted(row: Record<string, unknown> | null) {
  if (!row) {
    return true;
  }

  return row.deletedAt !== undefined
    ? row.deletedAt !== null
    : row.deleted_at !== undefined
      ? row.deleted_at !== null
      : false;
}

function toReplicaRow(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(),
      value,
    ])
  );
}

router.get('/replica/export', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot: Record<string, unknown[]> = {};

    for (const tableName of REPLICA_TABLES) {
      const rows = (await prisma.$queryRawUnsafe(buildReplicaExportQuery(tableName))) as Array<
        Record<string, unknown>
      >;
      snapshot[tableName] =
        tableName === 'users'
          ? rows.map((row) =>
              row.id === req.user?.id
                ? row
                : {
                    ...row,
                    password_hash: '',
                  }
            )
          : rows;
    }

    res.json({
      success: true,
      data: snapshot,
      meta: {
        exportedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Replica export error', error);
    res.status(500).json({ success: false, error: 'Replica export failed' });
  }
});

function normalizeQuantityInput(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readNullableNumberField(payload: Record<string, unknown>, camelCaseKey: string, snakeCaseKey: string) {
  const value = payload[camelCaseKey] ?? payload[snakeCaseKey];
  if (payload[camelCaseKey] === null || payload[snakeCaseKey] === null) return null;
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${camelCaseKey} must be a finite number`);
  return parsed;
}

function readStringField(
  payload: Record<string, unknown>,
  camelCaseKey: string,
  snakeCaseKey: string
) {
  const directValue = payload[camelCaseKey];
  if (typeof directValue === 'string' && directValue.trim()) {
    return directValue.trim();
  }

  const snakeValue = payload[snakeCaseKey];
  if (typeof snakeValue === 'string' && snakeValue.trim()) {
    return snakeValue.trim();
  }

  return undefined;
}

function readNullableStringField(
  payload: Record<string, unknown>,
  camelCaseKey: string,
  snakeCaseKey: string
) {
  if (payload[camelCaseKey] === null || payload[snakeCaseKey] === null) {
    return null;
  }

  return readStringField(payload, camelCaseKey, snakeCaseKey) ?? undefined;
}

function readDateField(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readVersionField(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, parsed) : undefined;
  }

  return undefined;
}

function buildConflictData(
  code: string,
  message: string,
  operation: Record<string, unknown>,
  serverRecord?: Record<string, unknown> | null
): SyncV2ConflictData {
  return {
    code,
    message,
    operation,
    serverRecord: serverRecord ?? null,
  };
}

async function applySyncV2Create(
  operationId: string,
  payload: Record<string, unknown>,
  userId: string
) {
  const recordId = readStringField(payload, 'id', 'id');
  const skuId = readStringField(payload, 'skuId', 'sku_id');
  const state = readStringField(payload, 'state', 'state');
  const quantity = normalizeQuantityInput(payload.quantity);
  const variantId = readNullableStringField(payload, 'variantId', 'variant_id');
  const floorId = readNullableStringField(payload, 'floorId', 'floor_id');
  const shelfId = readNullableStringField(payload, 'shelfId', 'shelf_id');
  const boxId = readNullableStringField(payload, 'boxId', 'box_id');
  const batchId = readNullableStringField(payload, 'batchId', 'batch_id');
  const terminalId = readNullableStringField(payload, 'terminalId', 'terminal_id');
  const posX = readNullableNumberField(payload, 'posX', 'pos_x');
  const posY = readNullableNumberField(payload, 'posY', 'pos_y');
  const posZ = readNullableNumberField(payload, 'posZ', 'pos_z');
  const rotY = readNullableNumberField(payload, 'rotY', 'rot_y');

  if (!recordId || !skuId || !state || quantity === undefined) {
    throw new Error('inventory.create requires id, skuId, quantity, and state');
  }

  if (quantity <= 0) {
    throw new Error('quantity must be greater than 0');
  }

  await assertVariantBatchReferences(prisma, {
    skuId,
    variantId: variantId ?? null,
    batchId: batchId ?? null,
    context: 'Sync inventory.create',
  });

  const existing = await prisma.inventoryRecord.findUnique({ where: { id: recordId } });
  if (existing) {
    throw new SyncConflictError(
      buildConflictData(
        'record_exists',
        `Inventory record ${recordId} already exists on the server.`,
        payload,
        existing as unknown as Record<string, unknown>
      )
    );
  }

  const serverSeq = await prisma.$transaction(async (tx: any) => {
    const createdRecord = await tx.inventoryRecord.create({
      data: {
        id: recordId,
        skuId,
        variantId: variantId ?? null,
        floorId: floorId ?? null,
        shelfId: shelfId ?? null,
        boxId: boxId ?? null,
        quantity,
        state,
        batchId: batchId ?? null,
        terminalId: terminalId ?? null,
        posX: posX ?? null,
        posY: posY ?? null,
        posZ: posZ ?? null,
        rotY: rotY ?? 0,
        userId,
        version: 1,
      },
    });

    const createdEvent = await tx.inventoryEvent.create({
      data: {
        eventType: InventoryEventType.MANUAL_ADJUSTMENT,
        parentEntityId: createdRecord.id,
        quantityDelta: quantity,
        beforeQuantity: 0,
        afterQuantity: quantity,
        userId,
        terminalId: terminalId ?? null,
        overrideFlag: false,
      },
    });

    return recordServerSyncChanges(tx, {
      operationId,
      aggregateId: createdRecord.id,
      changes: [
        { tableName: 'inventory_records', rowId: createdRecord.id, action: 'upsert' },
        { tableName: 'inventory_events', rowId: createdEvent.id, action: 'upsert' },
      ],
    });
  });

  return serverSeq ?? null;
}

async function applySyncV2Update(
  operationId: string,
  payload: Record<string, unknown>,
  baseVersion: number | null | undefined,
  userId: string
) {
  const recordId = readStringField(payload, 'id', 'id');
  if (!recordId) {
    throw new Error('inventory.update requires id');
  }

  const existing = await prisma.inventoryRecord.findUnique({ where: { id: recordId } });
  if (!existing) {
    throw new Error(`Inventory record ${recordId} was not found on the server.`);
  }

  if (baseVersion !== undefined && baseVersion !== null && existing.version !== baseVersion) {
    throw new SyncConflictError(
      buildConflictData(
        'version_mismatch',
        `Server version ${existing.version} does not match client version ${baseVersion}.`,
        payload,
        existing as unknown as Record<string, unknown>
      )
    );
  }

  const normalizedQuantity =
    payload.quantity !== undefined ? normalizeQuantityInput(payload.quantity) : undefined;
  if (payload.quantity !== undefined && normalizedQuantity === undefined) {
    throw new Error('quantity must be a valid number');
  }
  if (normalizedQuantity !== undefined && normalizedQuantity <= 0) {
    throw new Error('quantity must be greater than 0');
  }

  const updateData: Record<string, unknown> = {
    version: { increment: 1 },
    updatedAt: new Date(),
  };

  if (Object.prototype.hasOwnProperty.call(payload, 'floorId')) {
    updateData.floorId = readNullableStringField(payload, 'floorId', 'floor_id') ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'shelfId')) {
    updateData.shelfId = readNullableStringField(payload, 'shelfId', 'shelf_id') ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'boxId')) {
    updateData.boxId = readNullableStringField(payload, 'boxId', 'box_id') ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'batchId')) {
    const nextBatchId = readNullableStringField(payload, 'batchId', 'batch_id') ?? null;
    if (nextBatchId) {
      await assertVariantBatchReferences(prisma, {
        skuId: existing.skuId,
        variantId: existing.variantId ?? null,
        batchId: nextBatchId,
        context: 'Sync inventory.update',
      });
    }
    updateData.batchId = nextBatchId;
  }
  if (normalizedQuantity !== undefined) {
    updateData.quantity = normalizedQuantity;
  }
  for (const [camelCaseKey, snakeCaseKey] of [['posX', 'pos_x'], ['posY', 'pos_y'], ['posZ', 'pos_z'], ['rotY', 'rot_y']] as const) {
    if (Object.prototype.hasOwnProperty.call(payload, camelCaseKey) || Object.prototype.hasOwnProperty.call(payload, snakeCaseKey)) {
      updateData[camelCaseKey] = readNullableNumberField(payload, camelCaseKey, snakeCaseKey);
    }
  }

  const serverSeq = await prisma.$transaction(async (tx: any) => {
    await tx.inventoryRecord.update({
      where: { id: recordId },
      data: updateData,
    });

    let eventId: string | null = null;
    if (normalizedQuantity !== undefined && normalizedQuantity !== existing.quantity) {
      const adjustmentEvent = await tx.inventoryEvent.create({
        data: {
          eventType: InventoryEventType.MANUAL_ADJUSTMENT,
          parentEntityId: recordId,
          quantityDelta: normalizedQuantity - existing.quantity,
          beforeQuantity: existing.quantity,
          afterQuantity: normalizedQuantity,
          userId,
          overrideFlag: false,
        },
      });
      eventId = adjustmentEvent.id;
    }

    const changes: SyncV2ChangeDescriptor[] = [
      { tableName: 'inventory_records' as const, rowId: recordId, action: 'upsert' as const },
    ];
    if (eventId) {
      changes.push({
        tableName: 'inventory_events' as const,
        rowId: eventId,
        action: 'upsert' as const,
      });
    }

    return recordServerSyncChanges(tx, {
      operationId,
      aggregateId: recordId,
      changes,
    });
  });

  return serverSeq ?? null;
}

async function applySyncV2BoxOpen(
  operationId: string,
  payload: Record<string, unknown>,
  baseVersion: number | null | undefined,
  userId: string
) {
  const inventoryRecordId = readStringField(payload, 'inventoryRecordId', 'inventory_record_id');
  const normalizedQuantityToOpen = normalizeQuantityInput(
    payload.quantityToOpen ?? payload.quantity_to_open
  );
  const targetFloorId = readNullableStringField(payload, 'targetFloorId', 'target_floor_id');
  const expectedState = readStringField(payload, 'expectedState', 'expected_state');

  if (!inventoryRecordId || normalizedQuantityToOpen === undefined) {
    throw new Error('inventory.box-open requires inventoryRecordId and quantityToOpen');
  }

  if (normalizedQuantityToOpen <= 0) {
    throw new Error('quantityToOpen must be greater than 0');
  }

  const boxRecord = await prisma.inventoryRecord.findUnique({
    where: { id: inventoryRecordId },
    include: { sku: true },
  });

  if (!boxRecord) {
    throw new Error(`Inventory record ${inventoryRecordId} was not found on the server.`);
  }

  if (baseVersion !== undefined && baseVersion !== null && boxRecord.version !== baseVersion) {
    throw new SyncConflictError(
      buildConflictData(
        'version_mismatch',
        `Server version ${boxRecord.version} does not match client version ${baseVersion}.`,
        payload,
        boxRecord as unknown as Record<string, unknown>
      )
    );
  }

  if (expectedState && boxRecord.state !== expectedState) {
    throw new SyncConflictError(
      buildConflictData(
        'state_mismatch',
        `Server state ${boxRecord.state} does not match expected state ${expectedState}.`,
        payload,
        boxRecord as unknown as Record<string, unknown>
      )
    );
  }

  const statusMap = await getStatusesByKeys([
    SpecialStatusKeys.INVENTORY_UNOPENED_BOX,
    SpecialStatusKeys.INVENTORY_SHELF_READY,
    SpecialStatusKeys.INVENTORY_UNINSPECTED,
  ]);
  const unopenedBoxState = statusMap.get(SpecialStatusKeys.INVENTORY_UNOPENED_BOX)!;
  const shelfReadyState = statusMap.get(SpecialStatusKeys.INVENTORY_SHELF_READY)!;
  const uninspectedState = statusMap.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)!;

  if (boxRecord.state !== unopenedBoxState && boxRecord.state !== shelfReadyState) {
    throw new SyncConflictError(
      buildConflictData(
        'invalid_state',
        'Record must be in UnopenedBox or ShelfReady state.',
        payload,
        boxRecord as unknown as Record<string, unknown>
      )
    );
  }
  if (boxRecord.quantity < normalizedQuantityToOpen) {
    throw new SyncConflictError(
      buildConflictData(
        'insufficient_quantity',
        'Server quantity is lower than the requested box-open quantity.',
        payload,
        boxRecord as unknown as Record<string, unknown>
      )
    );
  }

  const conversionRules = boxRecord.sku.conversionRules as any[];
  let piecesPerBox = 12;
  try {
    piecesPerBox = await convert(1, boxRecord.sku.unitOfMeasure, 'Piece', conversionRules);
  } catch {
    // keep default fallback
  }

  const totalPieces = normalizedQuantityToOpen * piecesPerBox;

  const serverSeq = await prisma.$transaction(async (tx: any) => {
    const updatedBox = await tx.inventoryRecord.update({
      where: { id: inventoryRecordId },
      data: {
        quantity: boxRecord.quantity - normalizedQuantityToOpen,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    const pieceRecord = await tx.inventoryRecord.create({
      data: {
        skuId: boxRecord.skuId,
        variantId: boxRecord.variantId,
        batchId: boxRecord.batchId,
        floorId: targetFloorId ?? boxRecord.floorId,
        quantity: totalPieces,
        state: uninspectedState,
        userId,
        version: 1,
      },
    });

    const boxOpenEvent = await tx.inventoryEvent.create({
      data: {
        eventType: InventoryEventType.BOX_OPENED,
        parentEntityId: inventoryRecordId,
        quantityDelta: -normalizedQuantityToOpen,
        beforeQuantity: boxRecord.quantity,
        afterQuantity: boxRecord.quantity - normalizedQuantityToOpen,
        userId,
        overrideFlag: false,
        metadata: {
          boxesOpened: normalizedQuantityToOpen,
          piecesCreated: totalPieces,
          newRecordId: pieceRecord.id,
        },
      },
    });

    return recordServerSyncChanges(tx, {
      operationId,
      aggregateId: inventoryRecordId,
      changes: [
        { tableName: 'inventory_records', rowId: updatedBox.id, action: 'upsert' },
        { tableName: 'inventory_records', rowId: pieceRecord.id, action: 'upsert' },
        { tableName: 'inventory_events', rowId: boxOpenEvent.id, action: 'upsert' },
      ],
    });
  });

  return serverSeq ?? null;
}

async function applySyncV2Transition(
  payload: Record<string, unknown>,
  baseVersion: number | null | undefined,
  userId: string,
  userRole: UserRole
) {
  const inventoryRecordId = readStringField(payload, 'inventoryRecordId', 'inventory_record_id');
  const fromState = readStringField(payload, 'fromState', 'from_state');
  const toState = readStringField(payload, 'toState', 'to_state');
  const reason = readNullableStringField(payload, 'reason', 'reason');

  if (!inventoryRecordId || !toState) {
    throw new Error('inventory.transition requires inventoryRecordId and toState');
  }

  const existing = await prisma.inventoryRecord.findUnique({ where: { id: inventoryRecordId } });
  if (!existing) {
    throw new Error(`Inventory record ${inventoryRecordId} was not found on the server.`);
  }

  if (baseVersion !== undefined && baseVersion !== null && existing.version !== baseVersion) {
    throw new SyncConflictError(
      buildConflictData(
        'version_mismatch',
        `Server version ${existing.version} does not match client version ${baseVersion}.`,
        payload,
        existing as unknown as Record<string, unknown>
      )
    );
  }

  if (fromState && existing.state !== fromState) {
    throw new SyncConflictError(
      buildConflictData(
        'state_mismatch',
        `Server state ${existing.state} does not match expected state ${fromState}.`,
        payload,
        existing as unknown as Record<string, unknown>
      )
    );
  }

  const result = await performTransition(
    inventoryRecordId,
    toState as InventoryState,
    userId,
    userRole,
    reason ?? undefined
  );

  if (!result.success) {
    throw new SyncConflictError(
      buildConflictData(
        'invalid_transition',
        result.error ?? 'Transition is no longer valid on the server.',
        payload,
        existing as unknown as Record<string, unknown>
      )
    );
  }

  return result.serverSeq ?? null;
}

async function processSyncV2Operation(
  clientId: string,
  operation: SyncV2Operation,
  userId: string,
  userRole: UserRole
): Promise<SyncV2ProcessedResult> {
  const clientOperationId =
    typeof operation.id === 'string' && operation.id.trim() ? operation.id.trim() : null;
  const opType = typeof operation.opType === 'string' ? operation.opType : '';
  const idempotencyKey =
    typeof operation.idempotencyKey === 'string' ? operation.idempotencyKey.trim() : '';
  const payload =
    operation.payload && typeof operation.payload === 'object' && !Array.isArray(operation.payload)
      ? operation.payload
      : null;

  if (!opType || !idempotencyKey || !payload) {
    throw new Error('Each sync-v2 operation requires opType, idempotencyKey, and payload.');
  }

  const existing = await prisma.syncOperationLog.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    if (existing.status === SYNC_V2_STATUSES.PROCESSED) {
      return {
        clientOperationId,
        id: existing.id,
        idempotencyKey,
        status: 'Duplicate',
        serverSeq: existing.appliedServerSeq ?? null,
      };
    }

    if (existing.status === SYNC_V2_STATUSES.CONFLICT) {
      return {
        clientOperationId,
        id: existing.id,
        idempotencyKey,
        status: 'Conflict',
        conflict: (existing.conflictData ?? undefined) as SyncV2ConflictData | undefined,
      };
    }

    if (existing.status === SYNC_V2_STATUSES.FAILED) {
      return {
        clientOperationId,
        id: existing.id,
        idempotencyKey,
        status: 'Failed',
        error: existing.lastError ?? 'Operation previously failed on the server.',
      };
    }
  }

  const logEntry =
    existing ??
    (await prisma.syncOperationLog.create({
      data: {
        clientId,
        opType,
        aggregateType: 'inventory_record',
        aggregateId:
          typeof operation.aggregateId === 'string' && operation.aggregateId.trim()
            ? operation.aggregateId.trim()
            : null,
        idempotencyKey,
        payload: payload as any,
        baseVersion: operation.baseVersion ?? null,
        status: SYNC_V2_STATUSES.PENDING,
      },
    }));

  try {
    let serverSeq: number | null = null;
    switch (opType) {
      case SYNC_V2_OPERATION_TYPES.INVENTORY_CREATE:
        serverSeq = await applySyncV2Create(logEntry.id, payload, userId);
        break;
      case SYNC_V2_OPERATION_TYPES.INVENTORY_UPDATE:
        serverSeq = await applySyncV2Update(logEntry.id, payload, operation.baseVersion, userId);
        break;
      case SYNC_V2_OPERATION_TYPES.INVENTORY_BOX_OPEN:
        serverSeq = await applySyncV2BoxOpen(logEntry.id, payload, operation.baseVersion, userId);
        break;
      case SYNC_V2_OPERATION_TYPES.INVENTORY_TRANSITION:
        serverSeq = await applySyncV2Transition(
          payload,
          operation.baseVersion,
          userId,
          userRole
        );
        break;
      default:
        throw new Error(`Unsupported sync-v2 operation type: ${opType}`);
    }

    await prisma.syncOperationLog.update({
      where: { id: logEntry.id },
      data: {
        status: SYNC_V2_STATUSES.PROCESSED,
        processedAt: new Date(),
        appliedServerSeq: serverSeq,
        lastError: null,
        conflictData: Prisma.DbNull,
        attemptCount: { increment: 1 },
      },
    });

    return {
      clientOperationId,
      id: logEntry.id,
      idempotencyKey,
      status: 'Applied',
      serverSeq,
    };
  } catch (error) {
    if (error instanceof SyncConflictError) {
      await prisma.$transaction(async (tx: any) => {
        await tx.syncOperationLog.update({
          where: { id: logEntry.id },
          data: {
            status: SYNC_V2_STATUSES.CONFLICT,
            processedAt: new Date(),
            conflictData: error.conflict as any,
            lastError: error.message,
            attemptCount: { increment: 1 },
          },
        });

        await tx.syncConflict.create({
          data: {
            operationId: logEntry.id,
            clientId,
            aggregateType: 'inventory_record',
            aggregateId: logEntry.aggregateId,
            status: SYNC_V2_STATUSES.PENDING,
            localPayload: payload as any,
            serverPayload: (error.conflict.serverRecord ?? null) as any,
          },
        });
      });

      return {
        clientOperationId,
        id: logEntry.id,
        idempotencyKey,
        status: 'Conflict',
        conflict: error.conflict,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown sync-v2 error';
    await prisma.syncOperationLog.update({
      where: { id: logEntry.id },
      data: {
        status: SYNC_V2_STATUSES.FAILED,
        processedAt: new Date(),
        lastError: message,
        attemptCount: { increment: 1 },
      },
    });

    return {
      clientOperationId,
      id: logEntry.id,
      idempotencyKey,
      status: 'Failed',
      error: message,
    };
  }
}

router.post('/push-ops', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId, operations } = req.body as {
      clientId?: string;
      operations?: SyncV2Operation[];
    };

    if (!clientId || !Array.isArray(operations)) {
      res.status(400).json({ success: false, error: 'clientId and operations array are required' });
      return;
    }

    const user = req.user!;
    const processed: SyncV2ProcessedResult[] = [];
    let hasConflict = false;

    for (const operation of operations) {
      const result = await processSyncV2Operation(
        clientId,
        operation,
        user.id,
        user.role as UserRole
      );
      processed.push(result);

      if (result.status === 'Conflict') {
        hasConflict = true;
        break;
      }

      if (result.status === 'Failed') {
        break;
      }
    }

    const appliedServerSeqs = processed
      .map((item) => item.serverSeq)
      .filter((value): value is number => typeof value === 'number');

    res.status(hasConflict ? 409 : 200).json({
      success: !hasConflict,
      data: {
        processed,
        lastServerSeq:
          appliedServerSeqs.length > 0 ? Math.max(...appliedServerSeqs) : null,
      },
    });
  } catch (error) {
    logger.error('Sync push-ops error', error);
    res.status(500).json({ success: false, error: 'Sync push-ops failed' });
  }
});

router.get('/log', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sinceSeqRaw = Array.isArray(req.query.sinceSeq) ? req.query.sinceSeq[0] : req.query.sinceSeq;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const sinceSeq = Math.max(0, Number.parseInt(String(sinceSeqRaw ?? '0'), 10) || 0);
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(limitRaw ?? '200'), 10) || 200));

    const changeRows = await prisma.syncServerChange.findMany({
      where: { seq: { gt: sinceSeq } },
      orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    const changes = [];

    for (const changeRow of changeRows) {
      let row: Record<string, unknown> | null = null;

      if (changeRow.tableName === 'inventory_records') {
        row = toReplicaRow((await prisma.inventoryRecord.findUnique({
          where: { id: changeRow.rowId },
        })) as unknown as Record<string, unknown> | null);
      } else if (changeRow.tableName === 'inventory_events') {
        row = toReplicaRow((await prisma.inventoryEvent.findUnique({
          where: { id: changeRow.rowId },
        })) as unknown as Record<string, unknown> | null);
      } else if (changeRow.tableName === 'status_options') {
        row = toReplicaRow((await prisma.statusOption.findUnique({
          where: { id: changeRow.rowId },
        })) as unknown as Record<string, unknown> | null);
      }

      const shouldDelete = changeRow.action === 'delete' || isReplicaRowDeleted(row);

      changes.push({
        seq: changeRow.seq,
        table: changeRow.tableName,
        action: shouldDelete ? 'delete' : 'upsert',
        row: shouldDelete ? { id: changeRow.rowId } : (row as Record<string, unknown>),
        emittedAt: changeRow.createdAt.toISOString(),
      });
    }

    const lastServerSeq = changeRows.at(-1)?.seq ?? sinceSeq;

    res.json({
      success: true,
      data: {
        changes,
        lastServerSeq,
        hasMore: changeRows.length === limit,
      },
    });
  } catch (error) {
    logger.error('Sync log error', error);
    res.status(500).json({ success: false, error: 'Sync log failed' });
  }
});

router.get('/conflicts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clientId = Array.isArray(req.query.clientId) ? req.query.clientId[0] : req.query.clientId;
    const where =
      typeof clientId === 'string' && clientId.trim()
        ? { clientId: clientId.trim(), status: SYNC_V2_STATUSES.PENDING }
        : { status: SYNC_V2_STATUSES.PENDING };

    const conflicts = await prisma.syncConflict.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: conflicts });
  } catch (error) {
    logger.error('Sync conflicts lookup error', error);
    res.status(500).json({ success: false, error: 'Sync conflict lookup failed' });
  }
});

export default router;
