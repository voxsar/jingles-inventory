import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../modules/dashboard/dashboardService', () => ({ queueDashboardStatsRefresh: vi.fn() }));

const { applyChunk } = await import('../../modules/legacySync/legacySyncService');

type LinkRecord = {
	id: string;
	sourceType: string;
	sourceId: string;
	targetType: string;
	targetId: string;
	resolution: string;
	isLocked: boolean;
	lastApplied: Record<string, unknown> | null;
};

function wireLinks(links: LinkRecord[]) {
	prismaMock.legacyEntityLink.findUnique.mockImplementation(async ({ where }: any) => {
		const { sourceType, sourceId } = where.sourceType_sourceId;
		return links.find((link) => link.sourceType === sourceType && link.sourceId === sourceId) ?? null;
	});
	prismaMock.legacyEntityLink.upsert.mockImplementation(async ({ create }: any) => ({ id: 'link-new', ...create }));
	prismaMock.legacyEntityLink.update.mockResolvedValue({} as any);
}

function wireBranch({ isDefault = true }: { isDefault?: boolean } = {}) {
	// One active branch "b1" with default MAIN floor "f1", linked to legacy location "loc1".
	prismaMock.branch.findMany.mockResolvedValue([{ id: 'b1' }] as any);
	prismaMock.branch.findUnique.mockResolvedValue({ id: 'b1', code: 'S1', isDefault } as any);
	prismaMock.floor.findFirst.mockResolvedValue({ id: 'f1' } as any);
}

const locationLink: LinkRecord = {
	id: 'link-loc',
	sourceType: 'location',
	sourceId: 'loc1',
	targetType: 'branch',
	targetId: 'b1',
	resolution: 'created',
	isLocked: false,
	lastApplied: null,
};

describe('legacySyncService.applyChunk — merged products stay variants', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	it('routes updates for a variant-linked legacy product to the variant, never creating a SKU', async () => {
		wireBranch();
		wireLinks([
			locationLink,
			{
				id: 'link-1',
				sourceType: 'product',
				sourceId: '101',
				targetType: 'variant',
				targetId: 'var-1',
				resolution: 'variant-code',
				isLocked: false,
				lastApplied: { name: 'Red Shirt', isActive: true, costPrice: 50, sellingPrice: 100 },
			},
		]);

		prismaMock.sKUVariant.findUnique.mockImplementation(async ({ where }: any) =>
			where.id === 'var-1'
				? ({ id: 'var-1', variantCode: 'P101', skuId: 'sku-master', name: 'Red', isActive: true } as any)
				: null,
		);
		prismaMock.sKUVariant.update.mockResolvedValue({} as any);
		prismaMock.batch.findFirst.mockResolvedValue({
			id: 'batch-1', skuId: 'sku-master', variantId: 'var-1', sequenceNumber: 1,
			costPrice: 50, sellingPrice: 100, wholesalePrice: null, bulkPrice: null,
		} as any);
		prismaMock.batch.update.mockResolvedValue({} as any);
		prismaMock.inventoryRecord.aggregate.mockResolvedValue({ _sum: { quantity: 10 } } as any);
		prismaMock.inventoryRecord.findMany.mockResolvedValue([
			{ id: 'inv-1', quantity: 10 },
		] as any);
		prismaMock.inventoryRecord.update.mockResolvedValue({} as any);
		prismaMock.inventoryEvent.create.mockResolvedValue({} as any);

		const result = await applyChunk('run-1', {
			products: [{
				productId: '101',
				productCode: 'P101',
				name: 'Red Shirt',
				isActive: true,
				details: [{ locationId: 'loc1', costPrice: 50, sellingPrice: 120, quantity: 7 }],
			}],
		});

		// Price change (100 -> 120) flows to the variant's batch.
		expect(prismaMock.batch.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { sellingPrice: 120 } }),
		);
		// Quantity is mirrored down from 10 to 7 on the legacy-owned record.
		expect(prismaMock.inventoryRecord.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ quantity: 7 }) }),
		);
		expect(prismaMock.inventoryEvent.create).toHaveBeenCalledTimes(1);
		// The product is never turned back into a standalone SKU.
		expect(prismaMock.sKU.create).not.toHaveBeenCalled();
		// Name did not change in legacy, so the variant keeps its curated name.
		expect(prismaMock.sKUVariant.update).not.toHaveBeenCalled();
		expect(result.counts.products.updated).toBe(1);
		expect(prismaMock.legacyEntityLink.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ targetType: 'variant', targetId: 'var-1' }),
			}),
		);
	});

	it('resolves an unlinked legacy product to a variant by variantCode (merge convention)', async () => {
		wireBranch();
		wireLinks([locationLink]);

		prismaMock.sKUVariant.findUnique.mockImplementation(async ({ where }: any) => {
			if (where.variantCode === 'P202') {
				return { id: 'var-2', variantCode: 'P202', skuId: 'sku-master', name: 'Blue', isActive: true } as any;
			}
			if (where.id === 'var-2') {
				return { id: 'var-2', variantCode: 'P202', skuId: 'sku-master', name: 'Blue', isActive: true } as any;
			}
			return null;
		});
		prismaMock.batch.findFirst.mockResolvedValue({
			id: 'batch-2', sequenceNumber: 1,
			costPrice: null, sellingPrice: null, wholesalePrice: null, bulkPrice: null,
		} as any);
		prismaMock.batch.update.mockResolvedValue({} as any);

		const result = await applyChunk('run-1', {
			products: [{
				productId: '202',
				productCode: 'P202',
				name: 'Blue Shirt',
				isActive: true,
				details: [{ locationId: 'loc1', sellingPrice: 80 }],
			}],
		});

		expect(prismaMock.sKU.create).not.toHaveBeenCalled();
		// First contact: null batch prices are filled from legacy.
		expect(prismaMock.batch.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ sellingPrice: 80 }) }),
		);
		expect(prismaMock.legacyEntityLink.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ targetType: 'variant', resolution: 'variant-code' }),
			}),
		);
		expect(result.counts.products.created).toBe(0);
	});

	it('creates a new SKU when no variant, SKU code, or barcode matches', async () => {
		wireBranch();
		wireLinks([locationLink]);

		prismaMock.sKUVariant.findUnique.mockResolvedValue(null);
		prismaMock.sKU.findUnique.mockResolvedValue(null);
		prismaMock.productBarcode.findUnique.mockResolvedValue(null);
		prismaMock.vendor.findUnique.mockResolvedValue(null);
		prismaMock.vendor.create.mockResolvedValue({ id: 'vendor-1' } as any);
		prismaMock.category.findUnique.mockResolvedValue(null);
		prismaMock.category.create.mockResolvedValue({ id: 'cat-1' } as any);
		prismaMock.unitOfMeasure.findUnique.mockResolvedValue(null);
		prismaMock.unitOfMeasure.create.mockResolvedValue({ id: 'unit-1', name: 'Pieces' } as any);
		prismaMock.sKU.create.mockResolvedValue({ id: 'sku-new', skuCode: 'P999' } as any);
		prismaMock.sKUVendor.upsert.mockResolvedValue({} as any);
		prismaMock.productBarcode.create.mockResolvedValue({} as any);

		const result = await applyChunk('run-1', {
			products: [{
				productId: '999',
				productCode: 'P999',
				name: 'Brand New Thing',
				barcode: '4791234567890',
				unitName: 'Pieces',
				categoryPath: [{ kind: 'department', code: 'D1', name: 'General' }],
				isActive: true,
				details: [],
			}],
		});

		expect(prismaMock.sKU.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ skuCode: 'P999', name: 'Brand New Thing' }) }),
		);
		expect(prismaMock.legacyEntityLink.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ targetType: 'sku', targetId: 'sku-new', resolution: 'created' }),
			}),
		);
		expect(result.counts.products.created).toBe(1);
	});

	it('does not clobber a local rename when the legacy name has not changed', async () => {
		wireBranch();
		wireLinks([
			locationLink,
			{
				id: 'link-3',
				sourceType: 'product',
				sourceId: '303',
				targetType: 'sku',
				targetId: 'sku-3',
				resolution: 'sku-code',
				isLocked: false,
				lastApplied: { name: 'Old Legacy Name', isActive: true, sellingPrice: 100 },
			},
		]);

		prismaMock.sKU.findUnique.mockResolvedValue({
			id: 'sku-3', skuCode: 'P303', name: 'Curated Local Name', isActive: true,
			costPrice: null, sellingPrice: 100, wholesalePrice: null, bulkPrice: null,
		} as any);

		const result = await applyChunk('run-1', {
			products: [{
				productId: '303',
				productCode: 'P303',
				name: 'Old Legacy Name',
				isActive: true,
				details: [{ locationId: 'loc1', sellingPrice: 100 }],
			}],
		});

		expect(prismaMock.sKU.update).not.toHaveBeenCalled();
		expect(result.counts.products.unchanged).toBe(1);
	});

	it('applies a legacy rename and price change when legacy actually changed', async () => {
		wireBranch();
		wireLinks([
			locationLink,
			{
				id: 'link-4',
				sourceType: 'product',
				sourceId: '404',
				targetType: 'sku',
				targetId: 'sku-4',
				resolution: 'sku-code',
				isLocked: false,
				lastApplied: { name: 'Old Name', isActive: true, sellingPrice: 100 },
			},
		]);

		prismaMock.sKU.findUnique.mockResolvedValue({
			id: 'sku-4', skuCode: 'P404', name: 'Old Name', isActive: true,
			costPrice: null, sellingPrice: 100, wholesalePrice: null, bulkPrice: null,
		} as any);
		prismaMock.sKU.update.mockResolvedValue({} as any);

		await applyChunk('run-1', {
			products: [{
				productId: '404',
				productCode: 'P404',
				name: 'New Legacy Name',
				isActive: true,
				details: [{ locationId: 'loc1', sellingPrice: 150 }],
			}],
		});

		expect(prismaMock.sKU.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ name: 'New Legacy Name', sellingPrice: 150 }),
			}),
		);
	});

	it('skips variants whose parent product is not linked yet and reports a warning', async () => {
		wireBranch();
		wireLinks([locationLink]);
		prismaMock.sKUVariant.findUnique.mockResolvedValue(null);

		const result = await applyChunk('run-1', {
			variants: [{
				productColorSizeId: '701',
				productId: '700',
				colorSizeCode: 'RED-L',
				isActive: true,
				details: [],
			}],
		});

		expect(result.counts.variants.skipped).toBe(1);
		expect(result.warnings.some((warning) => warning.includes('parent product 700'))).toBe(true);
	});
});
