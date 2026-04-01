import prisma from '../../prisma/client';
import type { IPricingContext, IResolvedPrice } from '@jingles/shared';
import { getApplicableOverlays, resolveOverlays } from './overlayService';

export interface PricingQuery {
	skuId: string;
	variantId?: string | null;
	batchId?: string | null;
	quantity?: number;
	priceType?: 'selling' | 'wholesale' | 'bulk' | 'cost';
}

export interface PriceResult {
	price: number;
	currency: string;
	priceType: string;
	batchNumber?: string;
	source: 'batch' | 'sku_default' | 'calculated';
}

/**
 * Get the price for a product based on batch, quantity, and price type
 */
export async function getPrice(query: PricingQuery): Promise<PriceResult> {
	const { skuId, variantId, batchId, quantity, priceType = 'selling' } = query;

	// 1. Try to get price from specific batch
	if (batchId) {
		const batch = await prisma.batch.findUnique({
			where: { id: batchId },
			select: {
				batchNumber: true,
				costPrice: true,
				sellingPrice: true,
				wholesalePrice: true,
				bulkPrice: true,
				currency: true,
			},
		});

		if (batch) {
			let price: number | null = null;

			switch (priceType) {
				case 'cost':
					price = batch.costPrice;
					break;
				case 'selling':
					price = batch.sellingPrice;
					break;
				case 'wholesale':
					price = batch.wholesalePrice ?? batch.sellingPrice;
					break;
				case 'bulk':
					price = batch.bulkPrice ?? batch.wholesalePrice ?? batch.sellingPrice;
					break;
			}

			if (price !== null) {
				return {
					price,
					currency: batch.currency,
					priceType,
					batchNumber: batch.batchNumber,
					source: 'batch',
				};
			}
		}
	}

	// 2. Try to get most recent batch for this SKU/Variant
	const recentBatch = await prisma.batch.findFirst({
		where: {
			skuId,
			variantId: variantId ?? null,
			isActive: true,
		},
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			batchNumber: true,
			costPrice: true,
			sellingPrice: true,
			wholesalePrice: true,
			bulkPrice: true,
			currency: true,
		},
	});

	if (recentBatch) {
		let price: number | null = null;

		switch (priceType) {
			case 'cost':
				price = recentBatch.costPrice;
				break;
			case 'selling':
				price = recentBatch.sellingPrice;
				break;
			case 'wholesale':
				price = recentBatch.wholesalePrice ?? recentBatch.sellingPrice;
				break;
			case 'bulk':
				price = recentBatch.bulkPrice ?? recentBatch.wholesalePrice ?? recentBatch.sellingPrice;
				break;
		}

		if (price !== null) {
			return {
				price,
				currency: recentBatch.currency,
				priceType,
				batchNumber: recentBatch.batchNumber,
				source: 'batch',
			};
		}
	}

	// 3. Fall back to SKU-level batch pricing tiers (legacy)
	if (quantity && priceType === 'selling') {
		const sku = await prisma.sKU.findUnique({
			where: { id: skuId },
			select: { batchPricing: true },
		});

		if (sku?.batchPricing) {
			const tiers = sku.batchPricing as any[];
			// Find the applicable tier
			for (const tier of tiers) {
				if (quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)) {
					return {
						price: tier.price,
						currency: tier.currency ?? 'LKR',
						priceType: 'selling',
						source: 'sku_default',
					};
				}
			}
		}
	}

	throw new Error('No pricing information available for this product');
}

/**
 * Calculate selling price from cost price using margin
 */
export function calculateSellingPrice(costPrice: number, marginType: 'fixed' | 'percentage', marginValue: number): number {
	if (marginType === 'fixed') {
		return costPrice + marginValue;
	} else if (marginType === 'percentage') {
		return costPrice * (1 + marginValue / 100);
	} else {
		throw new Error('Invalid margin type');
	}
}

/**
 * Calculate margin from cost and selling price
 */
export function calculateMargin(costPrice: number, sellingPrice: number): { type: 'fixed'; value: number } | { type: 'percentage'; value: number } {
	const fixedMargin = sellingPrice - costPrice;
	const percentageMargin = ((sellingPrice - costPrice) / costPrice) * 100;

	// Return both, let the caller decide which to use
	// For simplicity, we return percentage if it's a clean value
	if (Math.abs(percentageMargin - Math.round(percentageMargin)) < 0.1) {
		return { type: 'percentage', value: Math.round(percentageMargin) };
	} else {
		return { type: 'fixed', value: fixedMargin };
	}
}

/**
 * Get pricing summary for a batch
 */
export async function getBatchPricingSummary(batchId: string) {
	const batch = await prisma.batch.findUnique({
		where: { id: batchId },
		include: {
			sku: {
				select: {
					skuCode: true,
					name: true,
				},
			},
			variant: {
				select: {
					variantCode: true,
					name: true,
				},
			},
		},
	});

	if (!batch) {
		throw new Error('Batch not found');
	}

	let marginInfo: any = null;

	if (batch.costPrice && batch.sellingPrice) {
		const calculatedMargin = calculateMargin(batch.costPrice, batch.sellingPrice);
		marginInfo = {
			configured: {
				type: batch.marginType,
				value: batch.marginValue,
			},
			calculated: calculatedMargin,
		};
	}

	return {
		batch: {
			id: batch.id,
			batchNumber: batch.batchNumber,
			sku: batch.sku,
			variant: batch.variant,
		},
		pricing: {
			cost: batch.costPrice,
			selling: batch.sellingPrice,
			wholesale: batch.wholesalePrice,
			bulk: batch.bulkPrice,
			currency: batch.currency,
		},
		margin: marginInfo,
		metadata: {
			supplier: batch.supplier,
			expiryDate: batch.expiryDate,
			manufacturingDate: batch.manufacturingDate,
			notes: batch.notes,
		},
	};
}

/**
 * Get average prices across all batches for a SKU
 */
export async function getAveragePrices(skuId: string, variantId?: string | null) {
	const batches = await prisma.batch.findMany({
		where: {
			skuId,
			variantId: variantId ?? null,
			isActive: true,
		},
		select: {
			costPrice: true,
			sellingPrice: true,
			wholesalePrice: true,
			bulkPrice: true,
		},
	});

	if (batches.length === 0) {
		return null;
	}

	const sum = batches.reduce(
		(acc, batch) => ({
			cost: acc.cost + (batch.costPrice ?? 0),
			selling: acc.selling + (batch.sellingPrice ?? 0),
			wholesale: acc.wholesale + (batch.wholesalePrice ?? 0),
			bulk: acc.bulk + (batch.bulkPrice ?? 0),
			count: {
				cost: acc.count.cost + (batch.costPrice !== null ? 1 : 0),
				selling: acc.count.selling + (batch.sellingPrice !== null ? 1 : 0),
				wholesale: acc.count.wholesale + (batch.wholesalePrice !== null ? 1 : 0),
				bulk: acc.count.bulk + (batch.bulkPrice !== null ? 1 : 0),
			},
		}),
		{ cost: 0, selling: 0, wholesale: 0, bulk: 0, count: { cost: 0, selling: 0, wholesale: 0, bulk: 0 } }
	);

	return {
		averageCost: sum.count.cost > 0 ? sum.cost / sum.count.cost : null,
		averageSelling: sum.count.selling > 0 ? sum.selling / sum.count.selling : null,
		averageWholesale: sum.count.wholesale > 0 ? sum.wholesale / sum.count.wholesale : null,
		averageBulk: sum.count.bulk > 0 ? sum.bulk / sum.count.bulk : null,
		batchCount: batches.length,
	};
}

/**
 * Get the resolved price with overlays applied (new layered pricing system)
 * This is the primary function for the layered pricing architecture
 */
export async function getPriceWithOverlays(context: IPricingContext): Promise<IResolvedPrice> {
	// 1. Get base price using existing logic
	const baseResult = await getPrice({
		skuId: context.skuId,
		variantId: context.variantId,
		batchId: context.batchId,
		quantity: context.quantity,
		priceType: context.priceType,
	});

	// 2. Get applicable overlays for this context
	const applicableOverlays = await getApplicableOverlays(context);

	// 3. Apply overlays using stacking rules
	const { finalPrice, appliedOverlays, warnings } = resolveOverlays(baseResult.price, applicableOverlays);

	// 4. Return resolved price with full details
	return {
		basePrice: baseResult.price,
		finalPrice,
		currency: baseResult.currency,
		priceType: baseResult.priceType,
		batchNumber: baseResult.batchNumber,
		source: baseResult.source,
		appliedOverlays,
		warnings,
	};
}

