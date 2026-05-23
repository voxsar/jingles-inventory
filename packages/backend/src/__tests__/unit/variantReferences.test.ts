import { describe, expect, it, vi } from 'vitest';
import {
	assertBatchBelongsToSkuVariant,
	assertVariantBatchReferences,
	assertVariantBelongsToSku,
} from '../../modules/catalog/variantReferences';

describe('variantReferences', () => {
	it('accepts a variant that belongs to the selected SKU', async () => {
		const db = {
			sKUVariant: {
				findFirst: vi.fn().mockResolvedValue({
					id: 'variant-red',
					skuId: 'sku-001',
					variantCode: 'SKU-001-RED',
					name: 'Red',
				}),
			},
			batch: {
				findUnique: vi.fn(),
			},
		};

		await expect(assertVariantBelongsToSku(db, 'sku-001', 'variant-red', 'Test')).resolves.toMatchObject({
			id: 'variant-red',
			skuId: 'sku-001',
		});
	});

	it('rejects a batch when its variant is not selected', async () => {
		const db = {
			sKUVariant: {
				findFirst: vi.fn(),
			},
			batch: {
				findUnique: vi.fn().mockResolvedValue({
					id: 'batch-001',
					skuId: 'sku-001',
					variantId: 'variant-red',
					batchNumber: 'RED-B001',
				}),
			},
		};

		await expect(assertBatchBelongsToSkuVariant(db, 'sku-001', 'batch-001', null, 'GRN line 1')).rejects.toThrow(
			'GRN line 1: batch RED-B001 belongs to a specific variant that must be selected',
		);
	});

	it('accepts a matching SKU, variant, and batch combination', async () => {
		const db = {
			sKUVariant: {
				findFirst: vi.fn().mockResolvedValue({
					id: 'variant-red',
					skuId: 'sku-001',
					variantCode: 'SKU-001-RED',
					name: 'Red',
				}),
			},
			batch: {
				findUnique: vi.fn().mockResolvedValue({
					id: 'batch-001',
					skuId: 'sku-001',
					variantId: 'variant-red',
					batchNumber: 'RED-B001',
				}),
			},
		};

		await expect(
			assertVariantBatchReferences(db, {
				skuId: 'sku-001',
				variantId: 'variant-red',
				batchId: 'batch-001',
				context: 'PRN line 1',
			}),
		).resolves.toBeUndefined();
	});
});
