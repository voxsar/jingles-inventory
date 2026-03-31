import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';
import { PricingOverlayType, PricingOverlayStatus } from '@jingles/shared';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

// Import after mocking
const {
	createOverlay,
	listOverlays,
	getOverlay,
	updateOverlay,
	deleteOverlay,
	getApplicableOverlays,
	resolveOverlays,
	detectOverlayConflicts,
} = await import('../../modules/pricing/overlayService');

describe('Overlay Service', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	describe('createOverlay', () => {
		it('creates a new pricing overlay', async () => {
			const overlayData = {
				name: 'New Year Sale',
				description: '10% off all products',
				type: PricingOverlayType.PercentageDiscount,
				value: 10,
				appliesTo: { skuIds: ['sku-001'] },
				priority: 1,
				stackable: false,
				status: PricingOverlayStatus.Active,
			};

			prismaMock.pricingOverlay.create.mockResolvedValue({
				id: 'overlay-001',
				...overlayData,
				conditions: null,
				validFrom: null,
				validTo: null,
				createdBy: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any);

			const result = await createOverlay(overlayData);

			expect(result.id).toBe('overlay-001');
			expect(result.name).toBe('New Year Sale');
			expect(result.type).toBe(PricingOverlayType.PercentageDiscount);
		});
	});

	describe('listOverlays', () => {
		it('lists all overlays with pagination', async () => {
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Promo 1',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					priority: 1,
				},
				{
					id: 'overlay-002',
					name: 'Promo 2',
					type: PricingOverlayType.FixedDiscount,
					value: 50,
					priority: 2,
				},
			] as any);

			prismaMock.pricingOverlay.count.mockResolvedValue(2);

			const result = await listOverlays({});

			expect(result.items).toHaveLength(2);
			expect(result.total).toBe(2);
		});

		it('filters overlays by status', async () => {
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Active Promo',
					status: PricingOverlayStatus.Active,
				},
			] as any);

			prismaMock.pricingOverlay.count.mockResolvedValue(1);

			const result = await listOverlays({ status: PricingOverlayStatus.Active });

			expect(result.items).toHaveLength(1);
		});
	});

	describe('getOverlay', () => {
		it('retrieves a single overlay', async () => {
			prismaMock.pricingOverlay.findUnique.mockResolvedValue({
				id: 'overlay-001',
				name: 'Test Overlay',
			} as any);

			const result = await getOverlay('overlay-001');

			expect(result.id).toBe('overlay-001');
			expect(result.name).toBe('Test Overlay');
		});

		it('throws error when overlay not found', async () => {
			prismaMock.pricingOverlay.findUnique.mockResolvedValue(null);

			await expect(getOverlay('invalid-id')).rejects.toThrow('Pricing overlay not found');
		});
	});

	describe('updateOverlay', () => {
		it('updates an existing overlay', async () => {
			prismaMock.pricingOverlay.update.mockResolvedValue({
				id: 'overlay-001',
				name: 'Updated Name',
				value: 15,
			} as any);

			const result = await updateOverlay('overlay-001', {
				name: 'Updated Name',
				value: 15,
			});

			expect(result.name).toBe('Updated Name');
			expect(result.value).toBe(15);
		});
	});

	describe('deleteOverlay', () => {
		it('soft deletes overlay by setting status to inactive', async () => {
			prismaMock.pricingOverlay.update.mockResolvedValue({
				id: 'overlay-001',
				status: PricingOverlayStatus.Inactive,
			} as any);

			const result = await deleteOverlay('overlay-001');

			expect(result.status).toBe(PricingOverlayStatus.Inactive);
		});
	});

	describe('getApplicableOverlays', () => {
		it('returns overlays that apply to a specific SKU', async () => {
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'SKU Discount',
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
				{
					id: 'overlay-002',
					name: 'Other SKU Discount',
					type: PricingOverlayType.PercentageDiscount,
					value: 15,
					appliesTo: { skuIds: ['sku-002'] },
					conditions: null,
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			const result = await getApplicableOverlays({ skuId: 'sku-001' });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('overlay-001');
		});

		it('filters overlays by quantity conditions', async () => {
			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Bulk Discount',
					type: PricingOverlayType.PercentageDiscount,
					value: 20,
					appliesTo: {},
					conditions: { minQty: 100 },
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			// Should not apply (quantity too low)
			const result1 = await getApplicableOverlays({ skuId: 'sku-001', quantity: 50 });
			expect(result1).toHaveLength(0);

			// Should apply (quantity meets minimum)
			const result2 = await getApplicableOverlays({ skuId: 'sku-001', quantity: 150 });
			expect(result2).toHaveLength(1);
		});

		it('filters overlays by date range conditions', async () => {
			const now = new Date('2026-04-05');
			const past = new Date('2026-04-01');
			const future = new Date('2026-04-10');

			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Time-Limited Promo',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					appliesTo: {},
					conditions: {
						dateRange: {
							start: past.toISOString(),
							end: future.toISOString(),
						},
					},
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: null,
					validTo: null,
				},
			] as any);

			// Should apply (date within range)
			const result = await getApplicableOverlays({ skuId: 'sku-001', date: now });
			expect(result).toHaveLength(1);
		});

		it('excludes overlays outside validity period', async () => {
			const now = new Date('2026-04-05');
			const future = new Date('2026-05-01');

			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-001',
					name: 'Future Promo',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					appliesTo: {},
					conditions: null,
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
					validFrom: future,
					validTo: null,
				},
			] as any);

			const result = await getApplicableOverlays({ skuId: 'sku-001', date: now });
			expect(result).toHaveLength(0);
		});
	});

	describe('resolveOverlays', () => {
		it('applies percentage discount overlay', () => {
			const basePrice = 1000;
			const overlays = [
				{
					id: 'overlay-001',
					name: '10% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					priority: 1,
					stackable: false,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			expect(result.finalPrice).toBe(900); // 1000 - 10%
			expect(result.appliedOverlays).toHaveLength(1);
			expect(result.appliedOverlays[0].adjustment).toBe(-100);
		});

		it('applies fixed discount overlay', () => {
			const basePrice = 1000;
			const overlays = [
				{
					id: 'overlay-001',
					name: '50 Off',
					type: PricingOverlayType.FixedDiscount,
					value: 50,
					priority: 1,
					stackable: false,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			expect(result.finalPrice).toBe(950); // 1000 - 50
			expect(result.appliedOverlays[0].adjustment).toBe(-50);
		});

		it('applies percentage markup overlay', () => {
			const basePrice = 1000;
			const overlays = [
				{
					id: 'overlay-001',
					name: '20% Markup',
					type: PricingOverlayType.PercentageMarkup,
					value: 20,
					priority: 1,
					stackable: false,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			expect(result.finalPrice).toBe(1200); // 1000 + 20%
			expect(result.appliedOverlays[0].adjustment).toBe(200);
		});

		it('applies fixed markup overlay', () => {
			const basePrice = 1000;
			const overlays = [
				{
					id: 'overlay-001',
					name: '100 Markup',
					type: PricingOverlayType.FixedMarkup,
					value: 100,
					priority: 1,
					stackable: false,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			expect(result.finalPrice).toBe(1100); // 1000 + 100
			expect(result.appliedOverlays[0].adjustment).toBe(100);
		});

		it('stacks multiple stackable overlays', () => {
			const basePrice = 1000;
			const overlays = [
				{
					id: 'overlay-001',
					name: '10% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					priority: 2,
					stackable: true,
				},
				{
					id: 'overlay-002',
					name: '5% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 5,
					priority: 1,
					stackable: true,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			// First: 1000 - 10% = 900
			// Second: 900 - 5% = 855
			expect(result.finalPrice).toBe(855);
			expect(result.appliedOverlays).toHaveLength(2);
		});

		it('stops stacking when non-stackable overlay is encountered', () => {
			const basePrice = 1000;
			const overlays = [
				{
					id: 'overlay-001',
					name: '20% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 20,
					priority: 2,
					stackable: false, // Non-stackable
				},
				{
					id: 'overlay-002',
					name: '10% Off',
					type: PricingOverlayType.PercentageDiscount,
					value: 10,
					priority: 1,
					stackable: true,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			// Only first overlay applied: 1000 - 20% = 800
			expect(result.finalPrice).toBe(800);
			expect(result.appliedOverlays).toHaveLength(1);
			expect(result.appliedOverlays[0].overlayId).toBe('overlay-001');
		});

		it('prevents negative prices', () => {
			const basePrice = 100;
			const overlays = [
				{
					id: 'overlay-001',
					name: 'Huge Discount',
					type: PricingOverlayType.FixedDiscount,
					value: 200,
					priority: 1,
					stackable: false,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			expect(result.finalPrice).toBe(0); // Capped at 0
		});

		it('generates warnings for conflicting non-stackable overlays', () => {
			const basePrice = 1000;
			const overlays = [
				{
					id: 'overlay-001',
					name: 'Promo A',
					type: PricingOverlayType.PercentageDiscount,
					value: 20,
					priority: 1,
					stackable: false,
				},
				{
					id: 'overlay-002',
					name: 'Promo B',
					type: PricingOverlayType.PercentageDiscount,
					value: 15,
					priority: 1, // Same priority!
					stackable: false,
				},
			];

			const result = resolveOverlays(basePrice, overlays);

			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain('overrides');
		});
	});

	describe('detectOverlayConflicts', () => {
		it('detects overlays with same priority and overlapping targets', async () => {
			prismaMock.pricingOverlay.findUnique.mockResolvedValue({
				id: 'overlay-001',
				name: 'Promo A',
				type: PricingOverlayType.PercentageDiscount,
				value: 10,
				appliesTo: { skuIds: ['sku-001', 'sku-002'] },
				priority: 1,
				stackable: false,
				status: PricingOverlayStatus.Active,
			} as any);

			prismaMock.pricingOverlay.findMany.mockResolvedValue([
				{
					id: 'overlay-002',
					name: 'Promo B',
					type: PricingOverlayType.PercentageDiscount,
					value: 15,
					appliesTo: { skuIds: ['sku-002', 'sku-003'] }, // Overlaps with sku-002
					priority: 1,
					stackable: false,
					status: PricingOverlayStatus.Active,
				},
			] as any);

			const result = await detectOverlayConflicts('overlay-001');

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('overlay-002');
		});

		it('returns empty array when no conflicts', async () => {
			prismaMock.pricingOverlay.findUnique.mockResolvedValue({
				id: 'overlay-001',
				name: 'Promo A',
				appliesTo: { skuIds: ['sku-001'] },
				priority: 1,
				stackable: true, // Stackable, so no conflicts
			} as any);

			prismaMock.pricingOverlay.findMany.mockResolvedValue([]);

			const result = await detectOverlayConflicts('overlay-001');

			expect(result).toHaveLength(0);
		});
	});
});
