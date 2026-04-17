import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';

export interface CreateBatchParams {
	skuId: string;
	variantId?: string | null;
	vendorId?: string | null;
	costPrice?: number | null;
	sellingPrice?: number | null;
	wholesalePrice?: number | null;
	bulkPrice?: number | null;
	currency?: string;
	marginType?: 'fixed' | 'percentage' | null;
	marginValue?: number | null;
	expiryDate?: Date | null;
	manufacturingDate?: Date | null;
	notes?: string | null;
}

export interface UpdateBatchParams {
	costPrice?: number | null;
	sellingPrice?: number | null;
	wholesalePrice?: number | null;
	bulkPrice?: number | null;
	currency?: string;
	marginType?: 'fixed' | 'percentage' | null;
	marginValue?: number | null;
	expiryDate?: Date | null;
	manufacturingDate?: Date | null;
	notes?: string | null;
	isActive?: boolean;
}

/**
 * Generate the next batch number for a SKU or Variant
 * Format: SKUCODE-B001, VARIANTCODE-B001
 */
export async function generateBatchNumber(skuId: string, variantId?: string | null): Promise<string> {
	// Get the SKU or variant code
	let code: string;

	if (variantId) {
		const variant = await prisma.sKUVariant.findUnique({
			where: { id: variantId },
			select: { variantCode: true },
		});
		if (!variant) throw new Error('Variant not found');
		code = variant.variantCode;
	} else {
		const sku = await prisma.sKU.findUnique({
			where: { id: skuId },
			select: { skuCode: true },
		});
		if (!sku) throw new Error('SKU not found');
		code = sku.skuCode;
	}

	// Get the highest sequence number for this SKU/Variant combination
	const lastBatch = await prisma.batch.findFirst({
		where: {
			skuId,
			variantId: variantId ?? null,
		},
		orderBy: { sequenceNumber: 'desc' },
		select: { sequenceNumber: true },
	});

	const nextSequence = (lastBatch?.sequenceNumber ?? 0) + 1;
	const batchNumber = `${code}-B${String(nextSequence).padStart(3, '0')}`;

	return batchNumber;
}

/**
 * Create a new batch with auto-incremented batch number
 * Inherits default dates and shelf life from SKU if not provided
 */
export async function createBatch(params: CreateBatchParams) {
	const batchNumber = await generateBatchNumber(params.skuId, params.variantId);

	// Get the sequence number from the batch number
	const lastBatch = await prisma.batch.findFirst({
		where: {
			skuId: params.skuId,
			variantId: params.variantId ?? null,
		},
		orderBy: { sequenceNumber: 'desc' },
		select: { sequenceNumber: true },
	});
	const sequenceNumber = (lastBatch?.sequenceNumber ?? 0) + 1;

	// Fetch SKU to get default dates and shelf life
	const sku = await prisma.sKU.findUnique({
		where: { id: params.skuId },
		select: {
			defaultManufacturingDate: true,
			defaultExpiryDate: true,
			shelfLifeDays: true,
			createdAt: true,
		},
	});

	if (!sku) {
		throw new Error('SKU not found');
	}

	// Determine manufacturing date: use provided, or SKU default, or SKU creation date
	let manufacturingDate = params.manufacturingDate;
	if (!manufacturingDate) {
		manufacturingDate = sku.defaultManufacturingDate ?? sku.createdAt;
	}

	// Determine expiry date: use provided, or calculate from manufacturing date + shelf life, or use SKU default
	let expiryDate = params.expiryDate;
	if (!expiryDate) {
		if (manufacturingDate && sku.shelfLifeDays) {
			// Calculate expiry from manufacturing date + shelf life
			expiryDate = new Date(manufacturingDate);
			expiryDate.setDate(expiryDate.getDate() + sku.shelfLifeDays);
		} else {
			// Fall back to SKU default expiry date
			expiryDate = sku.defaultExpiryDate ?? null;
		}
	}

	const batch = await prisma.batch.create({
		data: {
			batchNumber,
			skuId: params.skuId,
			variantId: params.variantId ?? null,
			vendorId: params.vendorId ?? null,
			sequenceNumber,
			costPrice: params.costPrice,
			sellingPrice: params.sellingPrice,
			wholesalePrice: params.wholesalePrice,
			bulkPrice: params.bulkPrice,
			currency: params.currency ?? 'LKR',
			marginType: params.marginType,
			marginValue: params.marginValue,
			expiryDate,
			manufacturingDate,
			notes: params.notes,
		},
		include: {
			sku: true,
			variant: true,
			vendor: true,
		},
	});

	return batch;
}

/**
 * Get all batches for a SKU (optionally filtered by variant)
 */
export async function listBatches(params: {
	skuId?: string;
	variantId?: string;
	isActive?: boolean;
	page?: number;
	pageSize?: number;
}) {
	const where: Prisma.BatchWhereInput = {};

	if (params.skuId) where.skuId = params.skuId;
	if (params.variantId !== undefined) where.variantId = params.variantId;
	if (params.isActive !== undefined) where.isActive = params.isActive;

	const page = params.page ?? 1;
	const pageSize = params.pageSize ?? 50;
	const skip = (page - 1) * pageSize;

	const [batches, total] = await Promise.all([
		prisma.batch.findMany({
			where,
			include: {
				sku: {
					select: {
						id: true,
						skuCode: true,
						name: true,
					},
				},
				variant: {
					select: {
						id: true,
						variantCode: true,
						name: true,
					},
				},
				vendor: {
					select: {
						id: true,
						name: true,
					},
				},
			},
			orderBy: [
				{ createdAt: 'desc' },
			],
			skip,
			take: pageSize,
		}),
		prisma.batch.count({ where }),
	]);

	return {
		items: batches,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
	};
}

/**
 * Get a single batch by ID
 */
export async function getBatch(id: string) {
	const batch = await prisma.batch.findUnique({
		where: { id },
		include: {
			sku: true,
			variant: true,
		},
	});

	if (!batch) {
		throw new Error('Batch not found');
	}

	return batch;
}

/**
 * Get a batch by batch number
 */
export async function getBatchByNumber(batchNumber: string) {
	const batch = await prisma.batch.findUnique({
		where: { batchNumber },
		include: {
			sku: true,
			variant: true,
		},
	});

	if (!batch) {
		throw new Error('Batch not found');
	}

	return batch;
}

/**
 * Update batch pricing and metadata
 */
export async function updateBatch(id: string, params: UpdateBatchParams) {
	const batch = await prisma.batch.update({
		where: { id },
		data: {
			costPrice: params.costPrice,
			sellingPrice: params.sellingPrice,
			wholesalePrice: params.wholesalePrice,
			bulkPrice: params.bulkPrice,
			currency: params.currency,
			marginType: params.marginType,
			marginValue: params.marginValue,
			expiryDate: params.expiryDate,
			manufacturingDate: params.manufacturingDate,
			notes: params.notes,
			isActive: params.isActive,
		},
		include: {
			sku: true,
			variant: true,
		},
	});

	return batch;
}

/**
 * Bulk update pricing for multiple batches (shortcuts feature)
 */
export async function bulkUpdateBatchPricing(params: {
	batchIds: string[];
	operation: 'set' | 'increase_fixed' | 'increase_percentage';
	priceField: 'costPrice' | 'sellingPrice' | 'wholesalePrice' | 'bulkPrice';
	value: number;
}) {
	const { batchIds, operation, priceField, value } = params;

	if (operation === 'set') {
		// Set all to a fixed value
		await prisma.batch.updateMany({
			where: { id: { in: batchIds } },
			data: { [priceField]: value },
		});
	} else if (operation === 'increase_fixed') {
		// Increase by a fixed amount
		// Note: Prisma doesn't support increment on updateMany, so we need to do it in a transaction
		const batches = await prisma.batch.findMany({
			where: { id: { in: batchIds } },
		});

		await prisma.$transaction(
			batches.map((batch) => {
				const currentValue = (batch as any)[priceField] ?? 0;
				return prisma.batch.update({
					where: { id: batch.id },
					data: { [priceField]: currentValue + value },
				});
			})
		);
	} else if (operation === 'increase_percentage') {
		// Increase by a percentage
		const batches = await prisma.batch.findMany({
			where: { id: { in: batchIds } },
		});

		await prisma.$transaction(
			batches.map((batch) => {
				const currentValue = (batch as any)[priceField] ?? 0;
				const newValue = currentValue * (1 + value / 100);
				return prisma.batch.update({
					where: { id: batch.id },
					data: { [priceField]: newValue },
				});
			})
		);
	}

	return { updated: batchIds.length };
}

/**
 * Apply margin to calculate selling price from cost price
 */
export async function applyMargin(batchId: string) {
	const batch = await prisma.batch.findUnique({
		where: { id: batchId },
		select: {
			id: true,
			costPrice: true,
			marginType: true,
			marginValue: true,
		},
	});

	if (!batch) {
		throw new Error('Batch not found');
	}

	if (!batch.costPrice || !batch.marginType || batch.marginValue === null || batch.marginValue === undefined) {
		throw new Error('Batch must have cost price, margin type, and margin value to apply margin');
	}

	let sellingPrice: number;

	if (batch.marginType === 'fixed') {
		sellingPrice = batch.costPrice + batch.marginValue;
	} else if (batch.marginType === 'percentage') {
		sellingPrice = batch.costPrice * (1 + batch.marginValue / 100);
	} else {
		throw new Error('Invalid margin type');
	}

	const updated = await prisma.batch.update({
		where: { id: batchId },
		data: { sellingPrice },
		include: {
			sku: true,
			variant: true,
		},
	});

	return updated;
}

/**
 * Bulk apply margin to multiple batches
 */
export async function bulkApplyMargin(batchIds: string[]) {
	const batches = await prisma.batch.findMany({
		where: { id: { in: batchIds } },
		select: {
			id: true,
			costPrice: true,
			marginType: true,
			marginValue: true,
		},
	});

	const updates = batches
		.filter(
			(batch) =>
				batch.costPrice !== null &&
				batch.marginType !== null &&
				batch.marginValue !== null
		)
		.map((batch) => {
			let sellingPrice: number;

			if (batch.marginType === 'fixed') {
				sellingPrice = batch.costPrice! + batch.marginValue!;
			} else if (batch.marginType === 'percentage') {
				sellingPrice = batch.costPrice! * (1 + batch.marginValue! / 100);
			} else {
				return null;
			}

			return prisma.batch.update({
				where: { id: batch.id },
				data: { sellingPrice },
			});
		})
		.filter((update) => update !== null) as Prisma.PrismaPromise<any>[];

	await prisma.$transaction(updates);

	return { updated: updates.length };
}
