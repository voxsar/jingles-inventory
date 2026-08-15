import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@jingles/shared';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../middleware/auth', () => ({
	authenticate: (req: any, _res: any, next: () => void) => {
		req.user = {
			id: 'user-001',
			role: UserRole.Admin,
		};
		next();
	},
	requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock('../../utils/localSearch', () => ({
	searchSKUIdsFts: vi.fn().mockResolvedValue(null),
}));

const { default: skusRouter } = await import('../../routes/skus');

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use('/api/skus', skusRouter);
	return app;
}

describe('sku routes', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	it('creates a variant family from manually selected products', async () => {
		const masterId = '11111111-1111-4111-8111-111111111111';
		const sourceId = '22222222-2222-4222-8222-222222222222';
		const tx = {
			sKU: {
				findMany: vi.fn().mockResolvedValue([
					{
						id: masterId,
						skuCode: 'PADLOCK-701',
						name: 'GLOBE PADLOCK 701 20MM',
						vendorId: 'vendor-001',
						costPrice: 100,
						sellingPrice: 150,
						wholesalePrice: 140,
						bulkPrice: 130,
						marginType: null,
						marginValue: null,
						currency: 'LKR',
						defaultManufacturingDate: null,
						defaultExpiryDate: null,
						_count: {
							inventoryRecords: 2,
							batches: 0,
							variants: 0,
						},
					},
					{
						id: sourceId,
						skuCode: 'PADLOCK-702',
						name: 'GLOBE PADLOCK 702 25MM',
						vendorId: 'vendor-001',
						costPrice: 110,
						sellingPrice: 160,
						wholesalePrice: 145,
						bulkPrice: 135,
						marginType: null,
						marginValue: null,
						currency: 'LKR',
						defaultManufacturingDate: null,
						defaultExpiryDate: null,
						_count: {
							inventoryRecords: 1,
							batches: 0,
							variants: 0,
						},
					},
				]),
				update: vi.fn().mockResolvedValue({ id: masterId }),
				delete: vi.fn().mockResolvedValue({ id: sourceId }),
			},
			sKUVariant: {
				findUnique: vi.fn().mockResolvedValue(null),
				create: vi
					.fn()
					.mockResolvedValueOnce({
						id: 'variant-master',
						skuId: masterId,
						variantCode: 'PADLOCK-701',
						name: '701 20MM',
					})
					.mockResolvedValueOnce({
						id: 'variant-702',
						skuId: masterId,
						variantCode: 'PADLOCK-702',
						name: '702 25MM',
					}),
			},
			sKUAttribute: {
				findMany: vi.fn().mockResolvedValue([]),
				upsert: vi.fn(),
			},
			sKUAttributeValue: {
				createMany: vi.fn(),
			},
			sKUVariantValue: {
				createMany: vi.fn(),
			},
			sKUTag: {
				findMany: vi.fn().mockResolvedValue([]),
				createMany: vi.fn(),
				deleteMany: vi.fn(),
			},
			sKUVendor: {
				findMany: vi.fn().mockResolvedValue([]),
				createMany: vi.fn(),
				deleteMany: vi.fn(),
			},
			productImage: {
				findMany: vi.fn().mockResolvedValue([]),
				findFirst: vi.fn().mockResolvedValue(null),
				update: vi.fn(),
			},
			productBarcode: {
				findMany: vi.fn().mockResolvedValue([]),
				updateMany: vi.fn(),
				update: vi.fn(),
			},
			batch: {
				aggregate: vi.fn().mockResolvedValue({ _max: { sequenceNumber: 0 } }),
				findMany: vi.fn().mockResolvedValue([]),
				update: vi.fn(),
				create: vi
					.fn()
					.mockResolvedValueOnce({ id: 'batch-master' })
					.mockResolvedValueOnce({ id: 'batch-702' }),
			},
			inventoryRecord: {
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
			gRNLine: {
				updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			},
			pRNLine: {
				updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			},
			stockTransferLine: {
				findMany: vi.fn().mockResolvedValue([]),
				findFirst: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
			},
		};

		prismaMock.attributeValue.findMany.mockResolvedValue([]);
		prismaMock.$transaction.mockImplementation(async (fn: (innerTx: typeof tx) => Promise<unknown>) => fn(tx as any));

		const app = createTestApp();
		const res = await request(app)
			.post('/api/skus/variant-families')
			.send({
				masterSkuId: masterId,
				sourceSkuIds: [sourceId],
			});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(tx.sKU.update).toHaveBeenCalledWith({
			where: { id: masterId },
			data: { name: 'GLOBE PADLOCK' },
		});
		expect(tx.batch.create).toHaveBeenCalledTimes(2);
		expect(tx.sKU.delete).toHaveBeenCalledWith({ where: { id: sourceId } });
		expect(res.body.data).toMatchObject({
			masterSkuId: masterId,
			masterName: 'GLOBE PADLOCK',
			createdVariantCount: 2,
			convertedSourceCount: 1,
			movedInventoryRecords: 3,
			movedBatches: 0,
			createdSyntheticBatches: 2,
		});
		expect(res.body.data.variants).toEqual([
			expect.objectContaining({
				sourceSkuId: masterId,
				variantCode: 'PADLOCK-701',
				name: '701 20MM',
			}),
			expect.objectContaining({
				sourceSkuId: sourceId,
				variantCode: 'PADLOCK-702',
				name: '702 25MM',
			}),
		]);
	});

	it('returns the exact existing product for a scanned barcode', async () => {
		prismaMock.productBarcode.findUnique.mockResolvedValue({
			id: 'barcode-001',
			barcode: '4791234567890',
			skuId: 'sku-001',
			variantId: null,
			sku: { id: 'sku-001', skuCode: 'SKU-001', name: 'Matched product', isActive: true },
			variant: null,
		} as any);

		const res = await request(createTestApp())
			.get('/api/skus/barcodes/lookup?barcode=4791234567890');

		expect(res.status).toBe(200);
		expect(res.body.data.sku).toMatchObject({ skuCode: 'SKU-001', name: 'Matched product' });
	});

	it('uses one SKU search across every saved barcode and returns all aliases default-first', async () => {
		prismaMock.sKU.findMany.mockResolvedValue([{
			id: 'sku-001',
			skuCode: 'SKU-001',
			name: 'Matched product',
			barcodes: [
				{ id: 'barcode-default', barcode: '4790000000001', isDefault: true },
				{ id: 'barcode-alternate', barcode: '4790000000002', isDefault: false },
			],
		} as any]);
		prismaMock.sKU.count.mockResolvedValue(1);

		const res = await request(createTestApp()).get('/api/skus?search=4790000000002');

		expect(res.status).toBe(200);
		expect(res.body.data.items[0].barcodes).toHaveLength(2);
		expect(prismaMock.sKU.findMany).toHaveBeenCalledWith(expect.objectContaining({
			where: expect.objectContaining({
				OR: expect.arrayContaining([
					{ barcodes: { some: { barcode: { contains: '4790000000002' } } } },
				]),
			}),
			include: expect.objectContaining({
				barcodes: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
			}),
		}));
	});

	it('blocks creation when the entered barcode already belongs to a product', async () => {
		prismaMock.productBarcode.findUnique.mockResolvedValue({
			id: 'barcode-001',
			barcode: '4791234567890',
			skuId: 'sku-001',
			sku: { id: 'sku-001', skuCode: 'SKU-001', name: 'Existing product' },
		} as any);

		const res = await request(createTestApp())
			.post('/api/skus')
			.send({
				skuCode: 'SKU-NEW',
				name: 'New product',
				unitOfMeasure: 'Piece',
				vendorId: 'vendor-001',
				barcode: '4791234567890',
			});

		expect(res.status).toBe(409);
		expect(res.body.error).toContain('already assigned to Existing product (SKU-001)');
		expect(prismaMock.sKU.create).not.toHaveBeenCalled();
	});
});
