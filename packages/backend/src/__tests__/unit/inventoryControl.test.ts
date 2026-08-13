import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../utils/runtimePaths', () => ({ isLocalReplicaMode: () => false }));
vi.mock('../../modules/dashboard/dashboardService', () => ({ queueDashboardStatsRefresh: vi.fn() }));

const { zeroInventory } = await import('../../modules/inventory/inventoryControl');

describe('inventoryControl.zeroInventory', () => {
	beforeEach(() => {
		resetPrismaMocks();
		prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
		prismaMock.inventoryRecord.findMany.mockResolvedValue([
			{ id: 'inventory-1', quantity: 12 },
			{ id: 'inventory-2', quantity: 3 },
		] as any);
		prismaMock.inventoryControl.upsert.mockResolvedValue({} as any);
		prismaMock.inventoryEvent.createMany.mockResolvedValue({ count: 2 } as any);
		prismaMock.inventoryRecord.updateMany.mockResolvedValue({ count: 2 } as any);
		prismaMock.auditLog.create.mockResolvedValue({} as any);
		prismaMock.syncServerSequence.create.mockResolvedValue({ seq: 44 } as any);
		prismaMock.syncServerChange.createMany.mockResolvedValue({ count: 4 } as any);
	});

	it('zeros all non-zero records and permanently disables legacy quantity mirroring', async () => {
		const result = await zeroInventory({ userId: 'admin-1', ipAddress: '127.0.0.1' });

		expect(prismaMock.inventoryControl.upsert).toHaveBeenCalledWith(expect.objectContaining({
			create: expect.objectContaining({ legacyQuantitySyncEnabled: false, recordsZeroed: 2, unitsZeroed: 15 }),
			update: expect.objectContaining({ legacyQuantitySyncEnabled: false, recordsZeroed: 2, unitsZeroed: 15 }),
		}));
		expect(prismaMock.inventoryRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
			data: { quantity: 0, version: { increment: 1 } },
		}));
		expect(prismaMock.inventoryEvent.createMany).toHaveBeenCalledWith({
			data: expect.arrayContaining([
				expect.objectContaining({ parentEntityId: 'inventory-1', beforeQuantity: 12, afterQuantity: 0, quantityDelta: -12 }),
			]),
		});
		expect(prismaMock.auditLog.create).toHaveBeenCalled();
		expect(result).toEqual(expect.objectContaining({ recordsZeroed: 2, unitsZeroed: 15, legacyQuantitySyncEnabled: false }));
	});
});
