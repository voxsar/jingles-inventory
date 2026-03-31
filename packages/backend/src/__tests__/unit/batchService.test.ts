import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

// Import after mocking
const {
	createBatch,
	generateBatchNumber,
	listBatches,
	getBatch,
	updateBatch,
	bulkUpdateBatchPricing,
	applyMargin,
	bulkApplyMargin
} = await import('../../modules/batch/batchService');

describe('Batch Service', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	describe('generateBatchNumber', () => {
		it('generates batch number for SKU with format SKUCODE-B001', async () => {
			prismaMock.sKUVariant.findUnique.mockResolvedValue(null);
			prismaMock.sKU.findUnique.mockResolvedValue({
				id: 'sku-001',
				skuCode: 'PROD001',
			} as any);
			prismaMock.batch.findFirst.mockResolvedValue(null);

			const result = await generateBatchNumber('sku-001');
			expect(result).toBe('PROD001-B001');
		});

		it('generates batch number for variant with format VARIANTCODE-B001', async () => {
			prismaMock.sKUVariant.findUnique.mockResolvedValue({
				id: 'var-001',
				variantCode: 'VAR001',
			} as any);
			prismaMock.batch.findFirst.mockResolvedValue(null);

			const result = await generateBatchNumber('sku-001', 'var-001');
			expect(result).toBe('VAR001-B001');
		});

		it('auto-increments batch number when previous batches exist', async () => {
			prismaMock.sKU.findUnique.mockResolvedValue({
				id: 'sku-001',
				skuCode: 'PROD001',
			} as any);
			prismaMock.batch.findFirst.mockResolvedValue({
				id: 'batch-002',
				sequenceNumber: 2,
			} as any);

			const result = await generateBatchNumber('sku-001');
			expect(result).toBe('PROD001-B003');
		});

		it('throws error when SKU not found', async () => {
			prismaMock.sKU.findUnique.mockResolvedValue(null);

			await expect(generateBatchNumber('invalid-sku')).rejects.toThrow('SKU not found');
		});

		it('throws error when Variant not found', async () => {
			prismaMock.sKUVariant.findUnique.mockResolvedValue(null);

			await expect(generateBatchNumber('sku-001', 'invalid-var')).rejects.toThrow('Variant not found');
		});
	});

	describe('createBatch', () => {
		it('creates a new batch with auto-generated batch number', async () => {
			prismaMock.sKU.findUnique.mockResolvedValue({
				id: 'sku-001',
				skuCode: 'PROD001',
			} as any);
			prismaMock.batch.findFirst.mockResolvedValue(null);
			prismaMock.batch.create.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				skuId: 'sku-001',
				variantId: null,
				sequenceNumber: 1,
				costPrice: 100,
				sellingPrice: 150,
				currency: 'LKR',
				isActive: true,
			} as any);

			const result = await createBatch({
				skuId: 'sku-001',
				costPrice: 100,
				sellingPrice: 150,
			});

			expect(result.batchNumber).toBe('PROD001-B001');
			expect(result.costPrice).toBe(100);
			expect(result.sellingPrice).toBe(150);
			expect(prismaMock.batch.create).toHaveBeenCalled();
		});

		it('creates batch with margin settings', async () => {
			prismaMock.sKU.findUnique.mockResolvedValue({
				id: 'sku-001',
				skuCode: 'PROD001',
			} as any);
			prismaMock.batch.findFirst.mockResolvedValue(null);
			prismaMock.batch.create.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				costPrice: 100,
				marginType: 'percentage',
				marginValue: 25,
			} as any);

			const result = await createBatch({
				skuId: 'sku-001',
				costPrice: 100,
				marginType: 'percentage',
				marginValue: 25,
			});

			expect(result.marginType).toBe('percentage');
			expect(result.marginValue).toBe(25);
		});

		it('creates batch with tiered pricing', async () => {
			prismaMock.sKU.findUnique.mockResolvedValue({
				id: 'sku-001',
				skuCode: 'PROD001',
			} as any);
			prismaMock.batch.findFirst.mockResolvedValue(null);
			prismaMock.batch.create.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				costPrice: 100,
				sellingPrice: 150,
				wholesalePrice: 130,
				bulkPrice: 120,
			} as any);

			const result = await createBatch({
				skuId: 'sku-001',
				costPrice: 100,
				sellingPrice: 150,
				wholesalePrice: 130,
				bulkPrice: 120,
			});

			expect(result.sellingPrice).toBe(150);
			expect(result.wholesalePrice).toBe(130);
			expect(result.bulkPrice).toBe(120);
		});
	});

	describe('listBatches', () => {
		it('lists all batches with pagination', async () => {
			const mockBatches = [
				{ id: 'batch-001', batchNumber: 'PROD001-B001', skuId: 'sku-001' },
				{ id: 'batch-002', batchNumber: 'PROD001-B002', skuId: 'sku-001' },
			];
			prismaMock.batch.findMany.mockResolvedValue(mockBatches as any);
			prismaMock.batch.count.mockResolvedValue(2);

			const result = await listBatches({ page: 1, pageSize: 10 });

			expect(result.items).toHaveLength(2);
			expect(result.total).toBe(2);
			expect(result.totalPages).toBe(1);
		});

		it('filters batches by SKU', async () => {
			prismaMock.batch.findMany.mockResolvedValue([
				{ id: 'batch-001', batchNumber: 'PROD001-B001', skuId: 'sku-001' },
			] as any);
			prismaMock.batch.count.mockResolvedValue(1);

			await listBatches({ skuId: 'sku-001' });

			expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ skuId: 'sku-001' }),
				})
			);
		});

		it('filters batches by active status', async () => {
			prismaMock.batch.findMany.mockResolvedValue([]);
			prismaMock.batch.count.mockResolvedValue(0);

			await listBatches({ isActive: true });

			expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ isActive: true }),
				})
			);
		});
	});

	describe('getBatch', () => {
		it('retrieves a batch by ID', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
			} as any);

			const result = await getBatch('batch-001');

			expect(result.id).toBe('batch-001');
			expect(prismaMock.batch.findUnique).toHaveBeenCalledWith(
				expect.objectContaining({ where: { id: 'batch-001' } })
			);
		});

		it('throws error when batch not found', async () => {
			prismaMock.batch.findUnique.mockResolvedValue(null);

			await expect(getBatch('invalid-id')).rejects.toThrow('Batch not found');
		});
	});

	describe('updateBatch', () => {
		it('updates batch pricing', async () => {
			prismaMock.batch.update.mockResolvedValue({
				id: 'batch-001',
				costPrice: 120,
				sellingPrice: 180,
			} as any);

			const result = await updateBatch('batch-001', {
				costPrice: 120,
				sellingPrice: 180,
			});

			expect(result.costPrice).toBe(120);
			expect(result.sellingPrice).toBe(180);
		});
	});

	describe('bulkUpdateBatchPricing', () => {
		it('sets all prices to a fixed value', async () => {
			prismaMock.batch.updateMany.mockResolvedValue({ count: 3 } as any);

			const result = await bulkUpdateBatchPricing({
				batchIds: ['batch-001', 'batch-002', 'batch-003'],
				operation: 'set',
				priceField: 'sellingPrice',
				value: 200,
			});

			expect(result.updated).toBe(3);
			expect(prismaMock.batch.updateMany).toHaveBeenCalled();
		});

		it('increases prices by fixed amount', async () => {
			const mockBatches = [
				{ id: 'batch-001', sellingPrice: 100 },
				{ id: 'batch-002', sellingPrice: 150 },
			];
			prismaMock.batch.findMany.mockResolvedValue(mockBatches as any);
			prismaMock.batch.update.mockResolvedValue({} as any);
			prismaMock.$transaction.mockImplementation((operations: any) =>
				Promise.resolve(operations.map(() => ({})))
			);

			const result = await bulkUpdateBatchPricing({
				batchIds: ['batch-001', 'batch-002'],
				operation: 'increase_fixed',
				priceField: 'sellingPrice',
				value: 20,
			});

			expect(result.updated).toBe(2);
		});

		it('increases prices by percentage', async () => {
			const mockBatches = [
				{ id: 'batch-001', sellingPrice: 100 },
				{ id: 'batch-002', sellingPrice: 200 },
			];
			prismaMock.batch.findMany.mockResolvedValue(mockBatches as any);
			prismaMock.batch.update.mockResolvedValue({} as any);
			prismaMock.$transaction.mockImplementation((operations: any) =>
				Promise.resolve(operations.map(() => ({})))
			);

			const result = await bulkUpdateBatchPricing({
				batchIds: ['batch-001', 'batch-002'],
				operation: 'increase_percentage',
				priceField: 'sellingPrice',
				value: 10,
			});

			expect(result.updated).toBe(2);
		});
	});

	describe('applyMargin', () => {
		it('applies fixed margin to calculate selling price', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				costPrice: 100,
				marginType: 'fixed',
				marginValue: 50,
			} as any);
			prismaMock.batch.update.mockResolvedValue({
				id: 'batch-001',
				costPrice: 100,
				sellingPrice: 150,
			} as any);

			const result = await applyMargin('batch-001');

			expect(result.sellingPrice).toBe(150);
		});

		it('applies percentage margin to calculate selling price', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				costPrice: 100,
				marginType: 'percentage',
				marginValue: 25,
			} as any);
			prismaMock.batch.update.mockResolvedValue({
				id: 'batch-001',
				costPrice: 100,
				sellingPrice: 125,
			} as any);

			const result = await applyMargin('batch-001');

			expect(result.sellingPrice).toBe(125);
		});

		it('throws error when batch not found', async () => {
			prismaMock.batch.findUnique.mockResolvedValue(null);

			await expect(applyMargin('invalid-id')).rejects.toThrow('Batch not found');
		});

		it('throws error when margin settings incomplete', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				costPrice: null,
				marginType: 'fixed',
				marginValue: 50,
			} as any);

			await expect(applyMargin('batch-001')).rejects.toThrow('cost price, margin type, and margin value');
		});
	});

	describe('bulkApplyMargin', () => {
		it('applies margin to multiple batches', async () => {
			const mockBatches = [
				{ id: 'batch-001', costPrice: 100, marginType: 'fixed', marginValue: 50 },
				{ id: 'batch-002', costPrice: 200, marginType: 'percentage', marginValue: 20 },
			];
			prismaMock.batch.findMany.mockResolvedValue(mockBatches as any);
			prismaMock.batch.update.mockResolvedValue({} as any);
			prismaMock.$transaction.mockImplementation((operations: any) =>
				Promise.resolve(operations.map(() => ({})))
			);

			const result = await bulkApplyMargin(['batch-001', 'batch-002']);

			expect(result.updated).toBe(2);
		});

		it('skips batches with incomplete margin data', async () => {
			const mockBatches = [
				{ id: 'batch-001', costPrice: 100, marginType: 'fixed', marginValue: 50 },
				{ id: 'batch-002', costPrice: null, marginType: 'fixed', marginValue: 50 },
			];
			prismaMock.batch.findMany.mockResolvedValue(mockBatches as any);
			prismaMock.batch.update.mockResolvedValue({} as any);
			prismaMock.$transaction.mockImplementation((operations: any) =>
				Promise.resolve(operations.map(() => ({})))
			);

			const result = await bulkApplyMargin(['batch-001', 'batch-002']);

			expect(result.updated).toBe(1);
		});
	});
});
