import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

const { getInventoryValuation, getFloorPerformance, getSalesSummary } = await import(
	'../../modules/analytics/analyticsService'
);

describe('getInventoryValuation', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	it('aggregates inventory records by SKU', async () => {
		const vendor = { id: 'vendor-001', name: 'Acme Ltd' };
		const sku = { skuCode: 'SKU-001', name: 'Widget', vendor };

		prismaMock.inventoryRecord.findMany.mockResolvedValue([
			{ skuId: 'sku-001', quantity: 10, state: 'ShelfReady', sku, floor: { id: 'floor-1', name: 'Floor A' } },
			{ skuId: 'sku-001', quantity: 5, state: 'Damaged', sku, floor: { id: 'floor-1', name: 'Floor A' } },
			{ skuId: 'sku-001', quantity: 3, state: 'ShelfReady', sku, floor: { id: 'floor-2', name: 'Floor B' } },
		] as any);

		const result = await getInventoryValuation();

		expect(result).toHaveLength(1);
		expect(result[0].skuId).toBe('sku-001');
		expect(result[0].totalQuantity).toBe(18);
		expect(result[0].byState['ShelfReady']).toBe(13);
		expect(result[0].byState['Damaged']).toBe(5);
	});

	it('returns separate entries for different SKUs', async () => {
		const sku1 = { skuCode: 'SKU-001', name: 'Widget A', vendor: null };
		const sku2 = { skuCode: 'SKU-002', name: 'Widget B', vendor: null };

		prismaMock.inventoryRecord.findMany.mockResolvedValue([
			{ skuId: 'sku-001', quantity: 10, state: 'ShelfReady', sku: sku1, floor: null },
			{ skuId: 'sku-002', quantity: 20, state: 'Inspected', sku: sku2, floor: null },
		] as any);

		const result = await getInventoryValuation();

		expect(result).toHaveLength(2);
		const skuIds = result.map((r) => r.skuId);
		expect(skuIds).toContain('sku-001');
		expect(skuIds).toContain('sku-002');
	});

	it('returns empty array when no inventory records exist', async () => {
		prismaMock.inventoryRecord.findMany.mockResolvedValue([]);

		const result = await getInventoryValuation();
		expect(result).toHaveLength(0);
	});

	it('filters by vendorId when provided', async () => {
		const sku = { skuCode: 'SKU-001', name: 'Widget', vendor: { id: 'v1', name: 'Acme' } };
		prismaMock.inventoryRecord.findMany.mockResolvedValue([
			{ skuId: 'sku-001', quantity: 5, state: 'ShelfReady', sku, floor: null },
		] as any);

		await getInventoryValuation('v1');

		expect(prismaMock.inventoryRecord.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ sku: { vendorId: 'v1' } }),
			})
		);
	});

	it('includes vendor info in the result', async () => {
		const vendor = { id: 'vendor-001', name: 'Acme Supplies' };
		const sku = { skuCode: 'SKU-001', name: 'Widget', vendor };

		prismaMock.inventoryRecord.findMany.mockResolvedValue([
			{ skuId: 'sku-001', quantity: 1, state: 'ShelfReady', sku, floor: null },
		] as any);

		const result = await getInventoryValuation();
		expect(result[0].vendor).toEqual(vendor);
	});
});

describe('getFloorPerformance', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	it('returns performance metrics per floor', async () => {
		prismaMock.floor.findMany.mockResolvedValue([
			{
				id: 'floor-001',
				name: 'Floor A',
				code: 'FLOORA',
				inventoryRecords: [
					{ skuId: 'sku-001', quantity: 10, state: 'ShelfReady', sku: {} },
					{ skuId: 'sku-001', quantity: 5, state: 'Damaged', sku: {} },
					{ skuId: 'sku-002', quantity: 8, state: 'ShelfReady', sku: {} },
				],
			},
		] as any);

		const result = await getFloorPerformance();

		expect(result).toHaveLength(1);
		expect(result[0].floorId).toBe('floor-001');
		expect(result[0].floorName).toBe('Floor A');
		expect(result[0].floorCode).toBe('FLOORA');
		expect(result[0].totalItems).toBe(3);
		expect(result[0].totalQuantity).toBe(23);
		expect(result[0].skuCount).toBe(2);
		expect(result[0].stateBreakdown['ShelfReady']).toBe(18);
		expect(result[0].stateBreakdown['Damaged']).toBe(5);
	});

	it('returns empty metrics for floor with no inventory', async () => {
		prismaMock.floor.findMany.mockResolvedValue([
			{ id: 'floor-002', name: 'Floor B', code: 'FLOORB', inventoryRecords: [] },
		] as any);

		const result = await getFloorPerformance();

		expect(result[0].totalItems).toBe(0);
		expect(result[0].totalQuantity).toBe(0);
		expect(result[0].skuCount).toBe(0);
	});

	it('returns empty array when no active floors', async () => {
		prismaMock.floor.findMany.mockResolvedValue([]);

		const result = await getFloorPerformance();
		expect(result).toHaveLength(0);
	});

	it('counts unique SKUs correctly when same SKU appears multiple times', async () => {
		prismaMock.floor.findMany.mockResolvedValue([
			{
				id: 'floor-003',
				name: 'Floor C',
				code: 'FLOORC',
				inventoryRecords: [
					{ skuId: 'sku-001', quantity: 5, state: 'ShelfReady', sku: {} },
					{ skuId: 'sku-001', quantity: 3, state: 'Inspected', sku: {} },
					{ skuId: 'sku-001', quantity: 2, state: 'Damaged', sku: {} },
				],
			},
		] as any);

		const result = await getFloorPerformance();
		expect(result[0].skuCount).toBe(1);
		expect(result[0].totalQuantity).toBe(10);
	});

	it('handles multiple floors independently', async () => {
		prismaMock.floor.findMany.mockResolvedValue([
			{ id: 'f1', name: 'F1', code: 'F1', inventoryRecords: [{ skuId: 'sku-1', quantity: 5, state: 'ShelfReady', sku: {} }] },
			{ id: 'f2', name: 'F2', code: 'F2', inventoryRecords: [{ skuId: 'sku-2', quantity: 10, state: 'Inspected', sku: {} }] },
		] as any);

		const result = await getFloorPerformance();
		expect(result).toHaveLength(2);
		expect(result.find((r) => r.floorId === 'f1')?.totalQuantity).toBe(5);
		expect(result.find((r) => r.floorId === 'f2')?.totalQuantity).toBe(10);
	});
});

describe('getSalesSummary', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	it('returns total sold and transaction count', async () => {
		prismaMock.inventoryEvent.findMany.mockResolvedValue([
			{ quantityDelta: -5 },
			{ quantityDelta: -10 },
			{ quantityDelta: -3 },
		] as any);

		const result = await getSalesSummary();

		expect(result.totalSold).toBe(18);
		expect(result.totalTransactions).toBe(3);
		expect(result.events).toHaveLength(3);
	});

	it('returns zero totals when no sales events', async () => {
		prismaMock.inventoryEvent.findMany.mockResolvedValue([]);

		const result = await getSalesSummary();

		expect(result.totalSold).toBe(0);
		expect(result.totalTransactions).toBe(0);
	});

	it('handles events with null quantityDelta gracefully', async () => {
		prismaMock.inventoryEvent.findMany.mockResolvedValue([
			{ quantityDelta: null },
			{ quantityDelta: -7 },
		] as any);

		const result = await getSalesSummary();
		expect(result.totalSold).toBe(7);
	});

	it('passes date range filters to the database query', async () => {
		prismaMock.inventoryEvent.findMany.mockResolvedValue([]);

		const from = new Date('2024-01-01');
		const to = new Date('2024-12-31');
		await getSalesSummary(from, to);

		expect(prismaMock.inventoryEvent.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					eventType: 'SALE_DEDUCTED',
					timestamp: expect.objectContaining({ gte: from, lte: to }),
				}),
			})
		);
	});

	it('passes only fromDate when toDate is omitted', async () => {
		prismaMock.inventoryEvent.findMany.mockResolvedValue([]);

		const from = new Date('2024-06-01');
		await getSalesSummary(from, undefined);

		expect(prismaMock.inventoryEvent.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					timestamp: expect.objectContaining({ gte: from }),
				}),
			})
		);
	});

	it('passes only toDate when fromDate is omitted', async () => {
		prismaMock.inventoryEvent.findMany.mockResolvedValue([]);

		const to = new Date('2024-06-30');
		await getSalesSummary(undefined, to);

		expect(prismaMock.inventoryEvent.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					timestamp: expect.objectContaining({ lte: to }),
				}),
			})
		);
	});

	it('does not include timestamp filter when no dates provided', async () => {
		prismaMock.inventoryEvent.findMany.mockResolvedValue([]);

		await getSalesSummary();

		expect(prismaMock.inventoryEvent.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.not.objectContaining({ timestamp: expect.anything() }),
			})
		);
	});
});
