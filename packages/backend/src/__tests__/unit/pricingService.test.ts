import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

// Import after mocking
const {
	getPrice,
	calculateSellingPrice,
	calculateMargin,
	getBatchPricingSummary,
	getAveragePrices
} = await import('../../modules/pricing/pricingService');

describe('Pricing Service', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	describe('getPrice', () => {
		it('retrieves price from specific batch', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				costPrice: 100,
				sellingPrice: 150,
				currency: 'LKR',
			} as any);

			const result = await getPrice({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'selling',
			});

			expect(result.price).toBe(150);
			expect(result.priceType).toBe('selling');
			expect(result.source).toBe('batch');
			expect(result.batchNumber).toBe('PROD001-B001');
		});

		it('falls back to wholesale price when requested', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 150,
				wholesalePrice: 130,
				currency: 'LKR',
			} as any);

			const result = await getPrice({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'wholesale',
			});

			expect(result.price).toBe(130);
			expect(result.priceType).toBe('wholesale');
		});

		it('falls back to selling price when wholesale not available', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 150,
				wholesalePrice: null,
				currency: 'LKR',
			} as any);

			const result = await getPrice({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'wholesale',
			});

			expect(result.price).toBe(150);
		});

		it('retrieves price from most recent batch when batchId not provided', async () => {
			prismaMock.batch.findUnique.mockResolvedValue(null);
			prismaMock.batch.findFirst.mockResolvedValue({
				id: 'batch-002',
				batchNumber: 'PROD001-B002',
				sellingPrice: 160,
				currency: 'LKR',
			} as any);

			const result = await getPrice({
				skuId: 'sku-001',
				priceType: 'selling',
			});

			expect(result.price).toBe(160);
			expect(result.batchNumber).toBe('PROD001-B002');
		});

		it('uses SKU batch pricing tiers when quantity provided', async () => {
			prismaMock.batch.findUnique.mockResolvedValue(null);
			prismaMock.batch.findFirst.mockResolvedValue(null);
			prismaMock.sKU.findUnique.mockResolvedValue({
				id: 'sku-001',
				batchPricing: [
					{ minQty: 0, maxQty: 100, price: 150, currency: 'LKR' },
					{ minQty: 101, maxQty: 500, price: 140, currency: 'LKR' },
					{ minQty: 501, maxQty: null, price: 130, currency: 'LKR' },
				],
			} as any);

			const result = await getPrice({
				skuId: 'sku-001',
				quantity: 250,
				priceType: 'selling',
			});

			expect(result.price).toBe(140);
			expect(result.source).toBe('sku_default');
		});

		it('throws error when no pricing available', async () => {
			prismaMock.batch.findUnique.mockResolvedValue(null);
			prismaMock.batch.findFirst.mockResolvedValue(null);
			prismaMock.sKU.findUnique.mockResolvedValue({
				id: 'sku-001',
				batchPricing: null,
			} as any);

			await expect(
				getPrice({
					skuId: 'sku-001',
					priceType: 'selling',
				})
			).rejects.toThrow('No pricing information available');
		});
	});

	describe('calculateSellingPrice', () => {
		it('calculates selling price with fixed margin', () => {
			const result = calculateSellingPrice(100, 'fixed', 50);
			expect(result).toBe(150);
		});

		it('calculates selling price with percentage margin', () => {
			const result = calculateSellingPrice(100, 'percentage', 25);
			expect(result).toBe(125);
		});

		it('throws error for invalid margin type', () => {
			expect(() => calculateSellingPrice(100, 'invalid' as any, 50)).toThrow('Invalid margin type');
		});
	});

	describe('calculateMargin', () => {
		it('calculates margin from cost and selling price', () => {
			const result = calculateMargin(100, 150);
			// 50% margin (clean percentage) should return percentage type
			expect(result.type).toBe('percentage');
			expect(result.value).toBe(50);
		});

		it('returns percentage margin for clean percentages', () => {
			const result = calculateMargin(100, 125);
			expect(result.type).toBe('percentage');
			expect(result.value).toBe(25);
		});
	});

	describe('getBatchPricingSummary', () => {
		it('retrieves comprehensive pricing summary for a batch', async () => {
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				costPrice: 100,
				sellingPrice: 150,
				wholesalePrice: 130,
				bulkPrice: 120,
				currency: 'LKR',
				marginType: 'percentage',
				marginValue: 50,
				supplier: 'ACME Corp',
				sku: { skuCode: 'PROD001', name: 'Widget' },
				variant: null,
			} as any);

			const result = await getBatchPricingSummary('batch-001');

			expect(result.batch.batchNumber).toBe('PROD001-B001');
			expect(result.pricing.cost).toBe(100);
			expect(result.pricing.selling).toBe(150);
			expect(result.pricing.wholesale).toBe(130);
			expect(result.pricing.bulk).toBe(120);
			expect(result.margin).toBeDefined();
			expect(result.margin.configured.type).toBe('percentage');
			expect(result.margin.configured.value).toBe(50);
		});

		it('throws error when batch not found', async () => {
			prismaMock.batch.findUnique.mockResolvedValue(null);

			await expect(getBatchPricingSummary('invalid-id')).rejects.toThrow('Batch not found');
		});
	});

	describe('getAveragePrices', () => {
		it('calculates average prices across batches', async () => {
			prismaMock.batch.findMany.mockResolvedValue([
				{ costPrice: 100, sellingPrice: 150, wholesalePrice: 130, bulkPrice: 120 },
				{ costPrice: 110, sellingPrice: 160, wholesalePrice: 140, bulkPrice: 130 },
				{ costPrice: 90, sellingPrice: 140, wholesalePrice: 120, bulkPrice: 110 },
			] as any);

			const result = await getAveragePrices('sku-001');

			expect(result).toBeDefined();
			expect(result!.averageCost).toBe(100);
			expect(result!.averageSelling).toBe(150);
			expect(result!.averageWholesale).toBe(130);
			expect(result!.averageBulk).toBe(120);
			expect(result!.batchCount).toBe(3);
		});

		it('handles batches with null prices', async () => {
			prismaMock.batch.findMany.mockResolvedValue([
				{ costPrice: 100, sellingPrice: 150, wholesalePrice: null, bulkPrice: null },
				{ costPrice: 100, sellingPrice: 150, wholesalePrice: 130, bulkPrice: null },
			] as any);

			const result = await getAveragePrices('sku-001');

			expect(result!.averageCost).toBe(100);
			expect(result!.averageSelling).toBe(150);
			expect(result!.averageWholesale).toBe(130);
			expect(result!.averageBulk).toBeNull();
		});

		it('returns null when no batches exist', async () => {
			prismaMock.batch.findMany.mockResolvedValue([]);

			const result = await getAveragePrices('sku-001');

			expect(result).toBeNull();
		});
	});
});
