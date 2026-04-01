import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';
import { PricingOverlayType, PricingOverlayStatus } from '@jingles/shared';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

// Import after mocking
const { getPriceWithOverlays } = await import('../../modules/pricing/pricingService');

describe('Pricing Service with Overlays', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	describe('getPriceWithOverlays', () => {
		it('returns base price when no overlays apply', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 1000,
				currency: 'LKR',
			} as any);

			// Mock no overlays
			prismaMock.pricingOverlay.findMany.mockResolvedValue([]);

			const result = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'selling',
			});

			expect(result.basePrice).toBe(1000);
			expect(result.finalPrice).toBe(1000);
			expect(result.appliedOverlays).toHaveLength(0);
		});

		it('applies single percentage discount overlay', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 1000,
				currency: 'LKR',
			} as any);

			// Mock overlay
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: '10% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					appliesTo: { skuIds: ['sku-001'] },
					conditions: null,
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			const result = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'selling',
			});

			expect(result.basePrice).toBe(1000);
			expect(result.finalPrice).toBe(900); // 10% off
			expect(result.appliedOverlays).toHaveLength(1);
			expect(result.appliedOverlays[0].overlayName).toBe('10% Off');
			expect(result.appliedOverlays[0].adjustment).toBe(-100);
		});

		it('applies multiple stackable overlays', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 1000,
				currency: 'LKR',
			} as any);

			// Mock overlays
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Seasonal 10% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					appliesTo: {},
					conditions: null,
					priority: 2,
					stackable: true,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
				{
					id: 'overlay-002',
					name: 'VIP 5% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 5,
					appliesTo: {},
					conditions: { customerGroup: 'vip' },
					priority: 1,
					stackable: true,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			const result = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'selling',
				customerGroup: 'vip',
			});

			// First: 1000 - 10% = 900
			// Second: 900 - 5% = 855
			expect(result.basePrice).toBe(1000);
			expect(result.finalPrice).toBe(855);
			expect(result.appliedOverlays).toHaveLength(2);
		});

		it('respects non-stackable overlay priority', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 1000,
				currency: 'LKR',
			} as any);

			// Mock overlays
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Flash Sale 25% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 25,
					appliesTo: {},
					conditions: null,
					priority: 3, // Highest priority
					stackable: false, // Non-stackable
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
				{
					id: 'overlay-002',
					name: 'Regular 10% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					appliesTo: {},
					conditions: null,
					priority: 1,
					stackable: true,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			const result = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'selling',
			});

			// Only flash sale applied (non-stackable with highest priority)
			expect(result.basePrice).toBe(1000);
			expect(result.finalPrice).toBe(750); // 25% off only
			expect(result.appliedOverlays).toHaveLength(1);
			expect(result.appliedOverlays[0].overlayName).toBe('Flash Sale 25% Off');
		});

		it('applies quantity-based overlay', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 100,
				currency: 'LKR',
			} as any);

			// Mock overlay with quantity condition
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Bulk Discount 20% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 20,
					appliesTo: {},
					conditions: { minQty: 100 }, // Minimum 100 units
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			// Test with quantity less than minimum
			const result1 = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				quantity: 50,
				priceType: 'selling',
			});

			expect(result1.basePrice).toBe(100);
			expect(result1.finalPrice).toBe(100); // No discount
			expect(result1.appliedOverlays).toHaveLength(0);

			// Test with quantity meeting minimum
			const result2 = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				quantity: 150,
				priceType: 'selling',
			});

			expect(result2.basePrice).toBe(100);
			expect(result2.finalPrice).toBe(80); // 20% off
			expect(result2.appliedOverlays).toHaveLength(1);
		});

		it('applies customer-type specific overlay', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 1000,
				currency: 'LKR',
			} as any);

			// Mock wholesale overlay
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Wholesale Pricing',
					type: PricingOverlayType.PercentageDiscount,
					value: 15,
					appliesTo: {},
					conditions: { customerType: 'wholesale' },
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			// Test retail customer (no discount)
			const result1 = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				customerType: 'retail',
				priceType: 'selling',
			});

			expect(result1.finalPrice).toBe(1000);
			expect(result1.appliedOverlays).toHaveLength(0);

			// Test wholesale customer (discount applies)
			const result2 = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				customerType: 'wholesale',
				priceType: 'selling',
			});

			expect(result2.finalPrice).toBe(850); // 15% off
			expect(result2.appliedOverlays).toHaveLength(1);
		});

		it('includes warnings for conflicting overlays', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 1000,
				currency: 'LKR',
			} as any);

			// Mock conflicting overlays (same priority, both non-stackable)
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Promo A',
					type: PricingOverlayType.PercentageDiscount,
					value: 20,
					appliesTo: {},
					conditions: null,
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
				{
					id: 'overlay-002',
					name: 'Promo B',
					type: PricingOverlayType.PercentageDiscount,
					value: 15,
					appliesTo: {},
					conditions: null,
					priority: 1, // Same priority
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			const result = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'selling',
			});

			expect(result.warnings).toBeDefined();
			expect(result.warnings!.length).toBeGreaterThan(0);
			expect(result.warnings![0]).toContain('overrides');
		});

		it('combines markup and discount overlays', async () => {
			// Mock batch price lookup
			prismaMock.batch.findUnique.mockResolvedValue({
				id: 'batch-001',
				batchNumber: 'PROD001-B001',
				sellingPrice: 1000,
				currency: 'LKR',
			} as any);

			// Mock overlays
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Express Delivery Fee 10%',
					type: PricingOverlayType.PercentageMarkup,
					value: 10,
					appliesTo: {},
					conditions: null,
					priority: 2,
					stackable: true,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
				{
					id: 'overlay-002',
					name: 'Loyalty 5% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 5,
					appliesTo: {},
					conditions: null,
					priority: 1,
					stackable: true,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			const result = await getPriceWithOverlays({
				skuId: 'sku-001',
				batchId: 'batch-001',
				priceType: 'selling',
			});

			// First: 1000 + 10% = 1100
			// Second: 1100 - 5% = 1045
			expect(result.basePrice).toBe(1000);
			expect(result.finalPrice).toBe(1045);
			expect(result.appliedOverlays).toHaveLength(2);
		});
	});
});
