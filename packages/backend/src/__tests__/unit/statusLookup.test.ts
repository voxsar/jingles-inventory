import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

const { getStatusByKey, getStatusesByKeys, clearStatusCache, SpecialStatusKeys } = await import(
	'../../modules/statuses/statusLookup'
);

describe('getStatusByKey', () => {
	beforeEach(() => {
		resetPrismaMocks();
		clearStatusCache();
		delete (prismaMock as any).statusOption;
	});

	it('returns value from database when statusOption model is available', async () => {
		(prismaMock as any).statusOption = {
			findFirst: vi.fn().mockResolvedValue({ value: 'UnopenedBox' }),
			findMany: vi.fn(),
		};

		const result = await getStatusByKey(SpecialStatusKeys.INVENTORY_UNOPENED_BOX);
		expect(result).toBe('UnopenedBox');
		expect((prismaMock as any).statusOption.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					specialKey: SpecialStatusKeys.INVENTORY_UNOPENED_BOX,
					isActive: true,
					deletedAt: null,
				},
			})
		);
	});

	it('falls back to hardcoded value when statusOption model is not available', async () => {
		// prismaMock does not include statusOption by default
		const result = await getStatusByKey(SpecialStatusKeys.INVENTORY_UNINSPECTED);
		expect(result).toBe('Uninspected');
	});

	it('falls back when database returns null', async () => {
		(prismaMock as any).statusOption = {
			findFirst: vi.fn().mockResolvedValue(null),
			findMany: vi.fn(),
		};

		const result = await getStatusByKey(SpecialStatusKeys.GRN_DRAFT);
		expect(result).toBe('Draft');
	});

	it('throws when key is unknown and database returns null', async () => {
		(prismaMock as any).statusOption = {
			findFirst: vi.fn().mockResolvedValue(null),
			findMany: vi.fn(),
		};

		await expect(getStatusByKey('UNKNOWN_KEY')).rejects.toThrow("not found in database");
	});

	it('caches value after first lookup', async () => {
		(prismaMock as any).statusOption = {
			findFirst: vi.fn().mockResolvedValue({ value: 'Inspected' }),
			findMany: vi.fn(),
		};

		await getStatusByKey(SpecialStatusKeys.INVENTORY_INSPECTED);
		await getStatusByKey(SpecialStatusKeys.INVENTORY_INSPECTED);

		// Should only call DB once due to caching
		expect((prismaMock as any).statusOption.findFirst).toHaveBeenCalledTimes(1);
	});

	it('caches fallback value to avoid repeated DB calls', async () => {
		// No statusOption model – falls back to hardcoded
		await getStatusByKey(SpecialStatusKeys.INVENTORY_DAMAGED);
		await getStatusByKey(SpecialStatusKeys.INVENTORY_DAMAGED);

		// Second call uses cache – no error and still returns the correct value
		const result = await getStatusByKey(SpecialStatusKeys.INVENTORY_DAMAGED);
		expect(result).toBe('Damaged');
	});

	it('returns correct fallback values for all inventory states', async () => {
		const cases: Array<[string, string]> = [
			[SpecialStatusKeys.INVENTORY_UNOPENED_BOX, 'UnopenedBox'],
			[SpecialStatusKeys.INVENTORY_UNINSPECTED, 'Uninspected'],
			[SpecialStatusKeys.INVENTORY_INSPECTED, 'Inspected'],
			[SpecialStatusKeys.INVENTORY_SHELF_READY, 'ShelfReady'],
			[SpecialStatusKeys.INVENTORY_DAMAGED, 'Damaged'],
			[SpecialStatusKeys.INVENTORY_RETURNED, 'Returned'],
			[SpecialStatusKeys.INVENTORY_RESERVED, 'Reserved'],
			[SpecialStatusKeys.INVENTORY_SOLD, 'Sold'],
		];

		for (const [key, expected] of cases) {
			clearStatusCache();
			expect(await getStatusByKey(key)).toBe(expected);
		}
	});

	it('returns correct fallback values for GRN statuses', async () => {
		const cases: Array<[string, string]> = [
			[SpecialStatusKeys.GRN_DRAFT, 'Draft'],
			[SpecialStatusKeys.GRN_SUBMITTED, 'Submitted'],
			[SpecialStatusKeys.GRN_PARTIALLY_INSPECTED, 'PartiallyInspected'],
			[SpecialStatusKeys.GRN_FULLY_INSPECTED, 'FullyInspected'],
			[SpecialStatusKeys.GRN_CLOSED, 'Closed'],
		];

		for (const [key, expected] of cases) {
			clearStatusCache();
			expect(await getStatusByKey(key)).toBe(expected);
		}
	});

	it('returns correct fallback values for transfer statuses', async () => {
		const cases: Array<[string, string]> = [
			[SpecialStatusKeys.TRANSFER_DRAFT, 'Draft'],
			[SpecialStatusKeys.TRANSFER_PENDING, 'Pending'],
			[SpecialStatusKeys.TRANSFER_APPROVED, 'Approved'],
			[SpecialStatusKeys.TRANSFER_IN_TRANSIT, 'InTransit'],
			[SpecialStatusKeys.TRANSFER_COMPLETED, 'Completed'],
			[SpecialStatusKeys.TRANSFER_CANCELLED, 'Cancelled'],
		];

		for (const [key, expected] of cases) {
			clearStatusCache();
			expect(await getStatusByKey(key)).toBe(expected);
		}
	});
});

describe('getStatusesByKeys', () => {
	beforeEach(() => {
		resetPrismaMocks();
		clearStatusCache();
		delete (prismaMock as any).statusOption;
	});

	it('returns a map for all requested keys using fallbacks', async () => {
		const keys = [
			SpecialStatusKeys.GRN_DRAFT,
			SpecialStatusKeys.INVENTORY_UNINSPECTED,
			SpecialStatusKeys.INVENTORY_INSPECTED,
		];

		const result = await getStatusesByKeys(keys);

		expect(result.size).toBe(3);
		expect(result.get(SpecialStatusKeys.GRN_DRAFT)).toBe('Draft');
		expect(result.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)).toBe('Uninspected');
		expect(result.get(SpecialStatusKeys.INVENTORY_INSPECTED)).toBe('Inspected');
	});

	it('uses database values when statusOption model is available', async () => {
		(prismaMock as any).statusOption = {
			findFirst: vi.fn(),
			findMany: vi.fn().mockResolvedValue([
				{ specialKey: SpecialStatusKeys.GRN_DRAFT, value: 'Draft' },
				{ specialKey: SpecialStatusKeys.INVENTORY_UNINSPECTED, value: 'Uninspected' },
			]),
		};

		const result = await getStatusesByKeys([
			SpecialStatusKeys.GRN_DRAFT,
			SpecialStatusKeys.INVENTORY_UNINSPECTED,
		]);

		expect(result.get(SpecialStatusKeys.GRN_DRAFT)).toBe('Draft');
		expect(result.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)).toBe('Uninspected');
		expect((prismaMock as any).statusOption.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					specialKey: {
						in: [
							SpecialStatusKeys.GRN_DRAFT,
							SpecialStatusKeys.INVENTORY_UNINSPECTED,
						],
					},
					isActive: true,
					deletedAt: null,
				},
			})
		);
	});

	it('uses cache for previously fetched keys', async () => {
		// First call – populates cache
		await getStatusesByKeys([SpecialStatusKeys.INVENTORY_DAMAGED]);

		(prismaMock as any).statusOption = {
			findFirst: vi.fn(),
			findMany: vi.fn(),
		};

		// Second call – should use cache, not DB
		const result = await getStatusesByKeys([SpecialStatusKeys.INVENTORY_DAMAGED]);
		expect(result.get(SpecialStatusKeys.INVENTORY_DAMAGED)).toBe('Damaged');
		expect((prismaMock as any).statusOption?.findMany).not.toHaveBeenCalled();
	});

	it('throws when a requested key has no fallback and is missing from DB', async () => {
		(prismaMock as any).statusOption = {
			findFirst: vi.fn(),
			findMany: vi.fn().mockResolvedValue([]),
		};

		await expect(getStatusesByKeys(['TOTALLY_UNKNOWN_KEY'])).rejects.toThrow('not found in database');
	});

	it('falls back when the status model returns a non-array result', async () => {
		(prismaMock as any).statusOption = {
			findFirst: vi.fn(),
			findMany: vi.fn().mockResolvedValue(undefined),
		};

		const result = await getStatusesByKeys([
			SpecialStatusKeys.GRN_DRAFT,
			SpecialStatusKeys.INVENTORY_UNINSPECTED,
		]);

		expect(result.get(SpecialStatusKeys.GRN_DRAFT)).toBe('Draft');
		expect(result.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)).toBe('Uninspected');
	});

	it('mixes cached and uncached keys in a single call', async () => {
		// Pre-cache one key
		await getStatusByKey(SpecialStatusKeys.GRN_DRAFT);

		const result = await getStatusesByKeys([
			SpecialStatusKeys.GRN_DRAFT,       // cached
			SpecialStatusKeys.INVENTORY_SOLD,   // not cached
		]);

		expect(result.get(SpecialStatusKeys.GRN_DRAFT)).toBe('Draft');
		expect(result.get(SpecialStatusKeys.INVENTORY_SOLD)).toBe('Sold');
	});
});
