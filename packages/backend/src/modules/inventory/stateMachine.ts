import { InventoryState, UserRole } from '@jingles/shared';
import { validateTransition, isValidTransition } from '@jingles/shared';
import prisma from '../../prisma/client';
import logger from '../../utils/logger';

export { validateTransition, isValidTransition };

export async function performTransition(
  inventoryRecordId: string,
  toState: InventoryState,
  userId: string,
  userRole: UserRole,
  reason?: string
): Promise<{ success: boolean; requiresOverride: boolean; record?: any; error?: string }> {
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

  const [updatedRecord] = await prisma.$transaction([
    prisma.inventoryRecord.update({
      where: { id: inventoryRecordId },
      data: {
        state: toState,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    }),
    prisma.inventoryEvent.create({
      data: {
        eventType: 'STATE_CHANGE',
        parentEntityId: inventoryRecordId,
        reasonCode: reason,
        userId,
        overrideFlag: result.requiresOverride,
        metadata: { fromState, toState, overrideReason: result.requiresOverride ? reason : undefined },
      },
    }),
  ]);

  return { success: true, requiresOverride: result.requiresOverride, record: updatedRecord };
}
