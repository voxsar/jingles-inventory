import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@jingles/shared';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../middleware/auth', () => ({
	authenticate: (req: any, _res: any, next: () => void) => {
		req.user = { id: 'user-001', role: UserRole.Admin };
		next();
	},
	requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock('../../modules/statuses/statusLookup', () => ({
	SpecialStatusKeys: { INVENTORY_SHELF_READY: 'INVENTORY_SHELF_READY' },
	getStatusByKey: vi.fn().mockResolvedValue('ShelfReady'),
}));
vi.mock('../../modules/dashboard/dashboardService', () => ({ queueDashboardStatsRefresh: vi.fn() }));
vi.mock('../../sync/syncV2', () => ({
	SYNC_V2_OPERATION_TYPES: { INVENTORY_CREATE: 'inventory.create', INVENTORY_UPDATE: 'inventory.update' },
	enqueueLocalSyncOperation: vi.fn(),
	recordServerSyncChanges: vi.fn(),
}));

const { stockCountRouter, stockCountRunRouter } = await import('../../routes/stockCounts');

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use('/api/stock-count-runs', stockCountRunRouter);
	app.use('/api/stock-count', stockCountRouter);
	return app;
}

describe('mobile stock-count routes', () => {
	beforeEach(() => {
		resetPrismaMocks();
		prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
	});

	it('opens a run without requiring branch inventory to be zero first', async () => {
		prismaMock.stockCountRun.findUnique.mockResolvedValue(null);
		prismaMock.branch.findFirst.mockResolvedValue({ id: 'branch-001', isActive: true } as any);
		prismaMock.stockCountRun.create.mockResolvedValue({
			id: 'run-001',
			branchId: 'branch-001',
			status: 'OPEN',
			startedAt: new Date('2026-08-14T10:00:00.000Z'),
			completedAt: null,
			branch: { id: 'branch-001', name: 'Main' },
		} as any);

		const response = await request(createTestApp())
			.post('/api/stock-count-runs')
			.send({ branchId: 'branch-001', requestId: 'request-001' });

		expect(response.status).toBe(201);
		expect(response.body.data).toMatchObject({ runId: 'run-001', branchId: 'branch-001' });
		expect(prismaMock.inventoryRecord.count).not.toHaveBeenCalled();
	});

	it('returns the downloaded catalog with every linked vendor', async () => {
		prismaMock.stockCountRun.findUnique.mockResolvedValue({
			id: 'run-001',
			startedAt: new Date('2026-08-13T10:00:00.000Z'),
		} as any);
		prismaMock.sKU.findMany.mockResolvedValue([
			{
				id: 'sku-001',
				skuCode: 'P001',
				name: 'Tea',
				vendor: { id: 'vendor-001', name: 'Primary Vendor' },
				skuVendors: [
					{ vendor: { id: 'vendor-001', name: 'Primary Vendor' } },
					{ vendor: { id: 'vendor-002', name: 'Second Vendor' } },
				],
				barcodes: [{ barcode: '479000000001', variantId: null }],
				variants: [],
			},
		] as any);

		const response = await request(createTestApp()).get('/api/stock-count-runs/run-001/catalog');
		const mobileResponse = await request(createTestApp()).get('/api/stock-count/catalog');

		expect(response.status).toBe(200);
		expect(response.body.data.products[0]).toMatchObject({
			skuId: 'sku-001',
			barcodes: ['479000000001'],
			vendors: [
				{ id: 'vendor-001', name: 'Primary Vendor' },
				{ id: 'vendor-002', name: 'Second Vendor' },
			],
		});
		expect(mobileResponse.status).toBe(200);
		expect(mobileResponse.body.data.products[0]).toMatchObject({
			skuId: 'sku-001',
			barcodes: ['479000000001'],
		});
	});

	it('tells Android to select a product when the barcode is unknown', async () => {
		prismaMock.productBarcode.findUnique.mockResolvedValue(null);

		const response = await request(createTestApp())
			.post('/api/stock-count/device-sessions/session-001/scan')
			.send({ barcode: 'UNKNOWN', quantity: 4, requestId: 'request-001' });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			found: false,
			barcode: 'UNKNOWN',
			action: 'SELECT_PRODUCT',
		});
	});

	it('atomically replaces non-zero location stock with the first physical count', async () => {
		const sku = {
			id: 'sku-001',
			name: 'Tea',
			isActive: true,
			vendor: { id: 'vendor-001', name: 'Primary Vendor' },
			skuVendors: [{ vendor: { id: 'vendor-002', name: 'Second Vendor' } }],
		};
		prismaMock.productBarcode.findUnique.mockResolvedValue({
			barcode: '479000000001',
			sku,
			variant: null,
		} as any);
		prismaMock.stockCountSubmission.findUnique.mockResolvedValue(null);
		prismaMock.stockCountDeviceSession.findUnique.mockResolvedValue({
			id: 'session-001',
			runId: 'run-001',
			deviceId: 'phone-001',
			floorId: 'floor-001',
			shelfId: null,
			status: 'OPEN',
			run: { id: 'run-001', status: 'OPEN' },
		} as any);
		prismaMock.stockCountItem.findUnique.mockResolvedValue(null);
		prismaMock.inventoryRecord.findMany.mockResolvedValue([{
			id: 'inventory-001',
			skuId: 'sku-001',
			variantId: null,
			floorId: 'floor-001',
			shelfId: null,
			quantity: 5,
			state: 'ShelfReady',
			boxId: null,
			batchId: null,
			version: 1,
		}] as any);
		prismaMock.inventoryRecord.aggregate.mockResolvedValue({ _sum: { quantity: 0 } } as any);
		prismaMock.stockCountItem.create.mockResolvedValue({
			id: 'item-001',
			runId: 'run-001',
			skuId: 'sku-001',
			variantId: null,
			quantity: 0,
			inventoryRecordId: 'inventory-001',
			inventoryRecord: { id: 'inventory-001', quantity: 0, version: 1 },
		} as any);
		prismaMock.stockCountLine.findUnique.mockResolvedValue(null);
		prismaMock.inventoryRecord.update.mockResolvedValueOnce({
			id: 'inventory-001',
			skuId: 'sku-001',
			variantId: null,
			floorId: 'floor-001',
			shelfId: null,
			quantity: 0,
			state: 'ShelfReady',
			terminalId: 'phone-001',
			version: 2,
		} as any).mockResolvedValueOnce({
			id: 'inventory-001',
			skuId: 'sku-001',
			variantId: null,
			floorId: 'floor-001',
			shelfId: null,
			quantity: 7,
			state: 'ShelfReady',
			terminalId: 'phone-001',
		} as any);
		prismaMock.stockCountItem.update.mockResolvedValue({ id: 'item-001', quantity: 7 } as any);
		prismaMock.stockCountLine.create.mockResolvedValue({ id: 'line-001', quantity: 7 } as any);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-001' } as any);
		prismaMock.stockCountSubmission.create.mockResolvedValue({ id: 'submission-001' } as any);

		const response = await request(createTestApp())
			.post('/api/stock-count/device-sessions/session-001/scan')
			.send({ barcode: '479000000001', quantity: 7, requestId: 'request-001' });

		expect(response.status).toBe(200);
		expect(response.body.data).toMatchObject({
			skuId: 'sku-001',
			deviceQuantity: 7,
			totalCountedQuantity: 7,
			vendors: [
				{ id: 'vendor-001', name: 'Primary Vendor' },
				{ id: 'vendor-002', name: 'Second Vendor' },
			],
		});
		expect(prismaMock.inventoryRecord.update).toHaveBeenCalledWith(expect.objectContaining({
			where: { id: 'inventory-001' },
			data: expect.objectContaining({ quantity: 7 }),
		}));
		expect(prismaMock.inventoryRecord.update).toHaveBeenCalledWith(expect.objectContaining({
			where: { id: 'inventory-001' },
			data: expect.objectContaining({ quantity: 0 }),
		}));
	});

	it('adds a second phone contribution instead of replacing the shared total', async () => {
		const sku = {
			id: 'sku-001',
			name: 'Tea',
			isActive: true,
			vendor: { id: 'vendor-001', name: 'Primary Vendor' },
			skuVendors: [],
		};
		prismaMock.productBarcode.findUnique.mockResolvedValue({
			barcode: '479000000001',
			sku,
			variant: null,
		} as any);
		prismaMock.stockCountSubmission.findUnique.mockResolvedValue(null);
		prismaMock.stockCountDeviceSession.findUnique.mockResolvedValue({
			id: 'session-002',
			runId: 'run-001',
			deviceId: 'phone-002',
			deviceName: 'Phone 2',
			floorId: 'floor-001',
			shelfId: null,
			status: 'OPEN',
			run: { id: 'run-001', status: 'OPEN' },
		} as any);
		prismaMock.stockCountItem.findUnique.mockResolvedValue({
			id: 'item-001',
			runId: 'run-001',
			skuId: 'sku-001',
			variantId: null,
			quantity: 7,
			inventoryRecordId: 'inventory-001',
			inventoryRecord: { id: 'inventory-001', quantity: 7, version: 2 },
		} as any);
		prismaMock.inventoryRecord.aggregate.mockResolvedValue({ _sum: { quantity: 7 } } as any);
		prismaMock.stockCountLine.findUnique.mockResolvedValue(null);
		prismaMock.inventoryRecord.update.mockResolvedValue({
			id: 'inventory-001',
			skuId: 'sku-001',
			variantId: null,
			floorId: 'floor-001',
			shelfId: null,
			quantity: 10,
			state: 'ShelfReady',
			terminalId: 'phone-002',
		} as any);
		prismaMock.stockCountItem.update.mockResolvedValue({ id: 'item-001', quantity: 10 } as any);
		prismaMock.stockCountLine.create.mockResolvedValue({ id: 'line-002', quantity: 3 } as any);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-002' } as any);
		prismaMock.stockCountSubmission.create.mockResolvedValue({ id: 'submission-002' } as any);

		const response = await request(createTestApp())
			.post('/api/stock-count/device-sessions/session-002/scan')
			.send({ barcode: '479000000001', quantity: 3, requestId: 'request-002' });

		expect(response.status).toBe(200);
		expect(response.body.data).toMatchObject({
			deviceQuantity: 3,
			totalCountedQuantity: 10,
		});
		expect(prismaMock.inventoryRecord.update).toHaveBeenCalledWith(expect.objectContaining({
			where: { id: 'inventory-001' },
			data: expect.objectContaining({ quantity: 10 }),
		}));
	});
});
