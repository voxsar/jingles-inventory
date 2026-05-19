import { InventoryState, UserRole } from '@jingles/shared';
import { validateTransition, isValidTransition } from '@jingles/shared';
import prisma from '../../prisma/client';
import logger from '../../utils/logger';
import { queueDashboardStatsRefresh } from '../dashboard/dashboardService';
import {
  SYNC_V2_OPERATION_TYPES,
  enqueueLocalSyncOperation,
  recordServerSyncChanges,
} from '../../sync/syncV2';

export { validateTransition, isValidTransition };

export async function performTransition(
  inventoryRecordId: string,
  toState: InventoryState,
  userId: string,
  userRole: UserRole,
  reason?: string
): Promise<{
  success: boolean;
  requiresOverride: boolean;
  record?: any;
  error?: string;
  serverSeq?: number | null;
}> {
  const record = await prisma.inventoryRecord.findUnique({
    where: { id: inventoryRecordId },
  });

  if (!record) {
    return { success: false, requiresOverride: false, error: 'Inventory record not found' };
  }

  const fromState = record.state as InventoryState;
  const result = validateTransition(fromState, toState, userRole);

  if (!result.valid) {
    return { success: false, requiresOverride: false, error: result.error };
  }

  if (result.requiresOverride) {
    logger.warn(`Manager override used: ${fromState} -> ${toState} by user ${userId}`);
  }

  const { updatedRecord, serverSeq } = await prisma.$transaction(async (tx: any) => {
    const nextRecord = await tx.inventoryRecord.update({
      where: { id: inventoryRecordId },
      data: {
        state: toState,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    const stateChangeEvent = await tx.inventoryEvent.create({
      data: {
        eventType: 'STATE_CHANGE',
        parentEntityId: inventoryRecordId,
        reasonCode: reason,
        userId,
        overrideFlag: result.requiresOverride,
        metadata: { fromState, toState, overrideReason: result.requiresOverride ? reason : undefined },
      },
    });

    await enqueueLocalSyncOperation(tx, {
      opType: SYNC_V2_OPERATION_TYPES.INVENTORY_TRANSITION,
      aggregateId: inventoryRecordId,
      baseVersion: record.version,
      payload: {
        inventoryRecordId,
        fromState,
        toState,
        reason: reason ?? null,
      },
    });

    const nextServerSeq = await recordServerSyncChanges(tx, {
      aggregateId: inventoryRecordId,
      changes: [
        { tableName: 'inventory_records', rowId: inventoryRecordId, action: 'upsert' },
        { tableName: 'inventory_events', rowId: stateChangeEvent.id, action: 'upsert' },
      ],
    });

    return {
      updatedRecord: nextRecord,
      serverSeq: nextServerSeq ?? null,
    };
  });

  // Queue dashboard stats refresh in background
  queueDashboardStatsRefresh();

  return {
    success: true,
    requiresOverride: result.requiresOverride,
    record: updatedRecord,
    serverSeq,
  };
}
