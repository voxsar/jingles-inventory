import { randomUUID } from 'crypto';
import { InventoryEventType } from '@jingles/shared';
import prisma from '../../prisma/client';
import { queueDashboardStatsRefresh } from '../dashboard/dashboardService';
import { recordServerSyncChanges, type SyncV2ChangeDescriptor } from '../../sync/syncV2';
import { isLocalReplicaMode } from '../../utils/runtimePaths';

export const INVENTORY_CONTROL_ID = 'global';
const INVENTORY_QUANTITY_LOCK_ID = 4_921_337;
const WRITE_BATCH_SIZE = 1_000;

type TransactionClient = any;

export async function lockInventoryQuantityWrites(tx: TransactionClient) {
	if (isLocalReplicaMode()) return;
	await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::bigint)', INVENTORY_QUANTITY_LOCK_ID);
}

export async function legacyQuantitySyncIsEnabled(db: TransactionClient = prisma) {
	const control = await db.inventoryControl.findUnique({
		where: { id: INVENTORY_CONTROL_ID },
		select: { legacyQuantitySyncEnabled: true },
	});
	return control?.legacyQuantitySyncEnabled ?? true;
}

export async function getInventoryControlStatus() {
	const [control, nonZeroRecords, quantity] = await Promise.all([
		prisma.inventoryControl.findUnique({ where: { id: INVENTORY_CONTROL_ID } }),
		prisma.inventoryRecord.count({ where: { quantity: { not: 0 } } }),
		prisma.inventoryRecord.aggregate({ _sum: { quantity: true }, where: { quantity: { not: 0 } } }),
	]);

	return {
		legacyQuantitySyncEnabled: control?.legacyQuantitySyncEnabled ?? true,
		zeroedAt: control?.zeroedAt ?? null,
		zeroedById: control?.zeroedById ?? null,
		zeroOperationId: control?.zeroOperationId ?? null,
		recordsZeroed: control?.recordsZeroed ?? 0,
		unitsZeroed: control?.unitsZeroed ?? 0,
		currentNonZeroRecords: nonZeroRecords,
		currentQuantity: quantity._sum.quantity ?? 0,
	};
}

export async function zeroInventory(args: { userId: string; ipAddress?: string | null }) {
	if (isLocalReplicaMode()) {
		throw new Error('Inventory must be zeroed on the main server, not an offline desktop replica.');
	}

	const operationId = randomUUID();
	const zeroedAt = new Date();
	const result = await prisma.$transaction(async (tx: TransactionClient) => {
		await lockInventoryQuantityWrites(tx);

		const records = await tx.inventoryRecord.findMany({
			where: { quantity: { not: 0 } },
			select: { id: true, quantity: true },
		});
		const unitsZeroed = records.reduce((total: number, record: { quantity: number }) => total + record.quantity, 0);

		await tx.inventoryControl.upsert({
			where: { id: INVENTORY_CONTROL_ID },
			create: {
				id: INVENTORY_CONTROL_ID,
				legacyQuantitySyncEnabled: false,
				zeroedAt,
				zeroedById: args.userId,
				zeroOperationId: operationId,
				recordsZeroed: records.length,
				unitsZeroed,
			},
			update: {
				legacyQuantitySyncEnabled: false,
				zeroedAt,
				zeroedById: args.userId,
				zeroOperationId: operationId,
				recordsZeroed: records.length,
				unitsZeroed,
			},
		});

		for (let offset = 0; offset < records.length; offset += WRITE_BATCH_SIZE) {
			const batch = records.slice(offset, offset + WRITE_BATCH_SIZE);
			const events = batch.map((record: { id: string; quantity: number }) => ({
				id: randomUUID(),
				eventType: InventoryEventType.MANUAL_ADJUSTMENT,
				parentEntityId: record.id,
				quantityDelta: -record.quantity,
				beforeQuantity: record.quantity,
				afterQuantity: 0,
				reasonCode: 'SYSTEM_INVENTORY_ZERO',
				userId: args.userId,
				overrideFlag: true,
				metadata: { operationId, zeroedAt: zeroedAt.toISOString(), legacyQuantitySyncDisabled: true },
			}));

			await tx.inventoryEvent.createMany({ data: events });
			await tx.inventoryRecord.updateMany({
				where: { id: { in: batch.map((record: { id: string }) => record.id) } },
				data: { quantity: 0, version: { increment: 1 } },
			});

			const changes: SyncV2ChangeDescriptor[] = [
				...batch.map((record: { id: string }) => ({ tableName: 'inventory_records' as const, rowId: record.id, action: 'upsert' as const })),
				...events.map((event: { id: string }) => ({ tableName: 'inventory_events' as const, rowId: event.id, action: 'upsert' as const })),
			];
			await recordServerSyncChanges(tx, {
				aggregateType: 'inventory_zero',
				aggregateId: operationId,
				changes,
			});
		}

		await tx.auditLog.create({
			data: {
				userId: args.userId,
				action: 'INVENTORY_ZEROED',
				entityType: 'InventoryControl',
				entityId: operationId,
				ipAddress: args.ipAddress ?? null,
				changes: {
					recordsZeroed: records.length,
					unitsZeroed,
					legacyQuantitySyncEnabled: false,
					zeroedAt: zeroedAt.toISOString(),
				},
			},
		});

		return { operationId, zeroedAt, recordsZeroed: records.length, unitsZeroed };
	}, { timeout: 120_000 });

	queueDashboardStatsRefresh();
	return { ...result, legacyQuantitySyncEnabled: false };
}
