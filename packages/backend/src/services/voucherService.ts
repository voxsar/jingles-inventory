/**
 * Voucher Service
 * 
 * Business logic for gift voucher management, including:
 * - Voucher code generation
 * - Bulk batch generation
 * - Redemption validation
 * - Balance tracking
 * - Restriction checking
 */

import prisma from '../prisma/client';
import { VoucherStatus, VoucherRestrictionType, VoucherBatchStatus } from '@jingles/shared';
import type { IVoucherValidationContext, IVoucherValidationResult, IVoucherCode } from '@jingles/shared';

/**
 * Generate a unique voucher code
 */
export async function generateVoucherCode(prefix?: string): Promise<string> {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar-looking chars
	const codeLength = 12;
	let code: string;
	let exists = true;

	while (exists) {
		const randomPart = Array.from({ length: codeLength }, () =>
			chars[Math.floor(Math.random() * chars.length)]
		).join('');

		code = prefix ? `${prefix}-${randomPart}` : randomPart;

		// Check if code already exists
		const existing = await prisma.voucherCode.findUnique({
			where: { code },
		});
		exists = !!existing;
	}

	return code!;
}

/**
 * Create a single voucher code
 */
export async function createVoucherCode(params: {
	skuId: string;
	variantId?: string | null;
	batchId?: string | null;
	voucherBatchId?: string | null;
	value: number;
	currency?: string;
	expiresAt?: Date | null;
	customerId?: string | null;
	orderId?: string | null;
	purchaseReference?: string | null;
	notes?: string | null;
	createdBy?: string | null;
	prefix?: string;
}): Promise<IVoucherCode> {
	const code = await generateVoucherCode(params.prefix);

	const voucherCode = await prisma.voucherCode.create({
		data: {
			code,
			skuId: params.skuId,
			variantId: params.variantId,
			batchId: params.batchId,
			voucherBatchId: params.voucherBatchId,
			initialValue: params.value,
			currentBalance: params.value,
			currency: params.currency || 'LKR',
			status: VoucherStatus.Active,
			expiresAt: params.expiresAt,
			customerId: params.customerId,
			orderId: params.orderId,
			purchaseReference: params.purchaseReference,
			notes: params.notes,
			createdBy: params.createdBy,
		},
	});

	return voucherCode as IVoucherCode;
}

/**
 * Create a bulk batch of voucher codes
 */
export async function createVoucherBatch(params: {
	skuId: string;
	variantId?: string | null;
	batchName: string;
	prefix?: string;
	quantity: number;
	defaultValue: number;
	expiryDays?: number | null;
	defaultExpiresAt?: Date | null;
	createdBy?: string | null;
}) {
	// Create the batch record
	const batch = await prisma.voucherBatch.create({
		data: {
			skuId: params.skuId,
			variantId: params.variantId,
			batchName: params.batchName,
			prefix: params.prefix,
			quantity: params.quantity,
			defaultValue: params.defaultValue,
			expiryDays: params.expiryDays,
			defaultExpiresAt: params.defaultExpiresAt,
			status: VoucherBatchStatus.Generating,
			createdBy: params.createdBy,
		},
	});

	try {
		// Generate voucher codes
		const codes: string[] = [];
		for (let i = 0; i < params.quantity; i++) {
			const code = await generateVoucherCode(params.prefix);
			codes.push(code);
		}

		// Calculate expiry date if expiryDays is provided
		let expiresAt = params.defaultExpiresAt;
		if (params.expiryDays && !expiresAt) {
			expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + params.expiryDays);
		}

		// Bulk insert voucher codes
		await prisma.voucherCode.createMany({
			data: codes.map((code) => ({
				code,
				skuId: params.skuId,
				variantId: params.variantId,
				voucherBatchId: batch.id,
				initialValue: params.defaultValue,
				currentBalance: params.defaultValue,
				currency: 'LKR',
				status: VoucherStatus.Active,
				expiresAt,
				createdBy: params.createdBy,
			})),
		});

		// Update batch status
		await prisma.voucherBatch.update({
			where: { id: batch.id },
			data: {
				generatedCount: params.quantity,
				status: VoucherBatchStatus.Completed,
				completedAt: new Date(),
			},
		});

		return batch;
	} catch (error) {
		// Mark batch as failed
		await prisma.voucherBatch.update({
			where: { id: batch.id },
			data: {
				status: VoucherBatchStatus.Failed,
			},
		});
		throw error;
	}
}

/**
 * Validate a voucher code for redemption
 */
export async function validateVoucher(
	context: IVoucherValidationContext
): Promise<IVoucherValidationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Find the voucher code
	const voucherCode = await prisma.voucherCode.findUnique({
		where: { code: context.voucherCode },
		include: {
			sku: {
				include: {
					voucherRestrictions: true,
				},
			},
			variant: true,
		},
	});

	if (!voucherCode) {
		return {
			isValid: false,
			errors: ['Voucher code not found'],
		};
	}

	// Check status
	if (voucherCode.status !== VoucherStatus.Active) {
		return {
			isValid: false,
			errors: [`Voucher is ${voucherCode.status.toLowerCase()}`],
		};
	}

	// Check expiry
	if (voucherCode.expiresAt && new Date() > new Date(voucherCode.expiresAt)) {
		return {
			isValid: false,
			errors: ['Voucher has expired'],
		};
	}

	// Check balance
	if (voucherCode.currentBalance <= 0) {
		return {
			isValid: false,
			errors: ['Voucher balance is empty'],
		};
	}

	// Get restrictions
	const restrictions = voucherCode.sku.voucherRestrictions || [];

	// Check if other vouchers are allowed
	if (context.hasOtherVouchers) {
		const noStack = restrictions.some(
			(r: any) => r.cannotCombineWithOtherVouchers
		);
		if (noStack) {
			errors.push('This voucher cannot be combined with other vouchers');
		}
	}

	// Check if discounts are allowed
	if (context.hasDiscounts) {
		const noDiscount = restrictions.some(
			(r: any) => r.cannotCombineWithDiscounts
		);
		if (noDiscount) {
			errors.push('This voucher cannot be combined with discounts');
		}
	}

	// Check minimum purchase amount
	const minPurchase = restrictions.find(
		(r: any) => r.minPurchaseAmount !== null
	);
	if (minPurchase && context.totalAmount < (minPurchase as any).minPurchaseAmount) {
		errors.push(
			`Minimum purchase amount of ${(minPurchase as any).minPurchaseAmount} ${voucherCode.currency} required`
		);
	}

	// Filter applicable items based on restrictions
	const applicableItems = context.items.filter((item) => {
		// Check category restrictions
		const categoryExclusions = restrictions.filter(
			(r: any) =>
				r.restrictionType === VoucherRestrictionType.CategoryExclude &&
				r.targetCategoryIds
		);
		for (const restriction of categoryExclusions) {
			if (
				item.categoryId &&
				(restriction as any).targetCategoryIds?.includes(item.categoryId)
			) {
				return false; // Item category is excluded
			}
		}

		const categoryInclusions = restrictions.filter(
			(r: any) =>
				r.restrictionType === VoucherRestrictionType.CategoryInclude &&
				r.targetCategoryIds
		);
		if (categoryInclusions.length > 0) {
			const included = categoryInclusions.some((restriction: any) =>
				restriction.targetCategoryIds?.includes(item.categoryId)
			);
			if (!included) {
				return false; // Item category not in inclusion list
			}
		}

		// Check SKU restrictions
		const skuExclusions = restrictions.filter(
			(r: any) =>
				r.restrictionType === VoucherRestrictionType.SkuExclude &&
				r.targetSkuIds
		);
		for (const restriction of skuExclusions) {
			if ((restriction as any).targetSkuIds?.includes(item.skuId)) {
				return false; // Item SKU is excluded
			}
		}

		const skuInclusions = restrictions.filter(
			(r: any) =>
				r.restrictionType === VoucherRestrictionType.SkuInclude &&
				r.targetSkuIds
		);
		if (skuInclusions.length > 0) {
			const included = skuInclusions.some((restriction: any) =>
				restriction.targetSkuIds?.includes(item.skuId)
			);
			if (!included) {
				return false; // Item SKU not in inclusion list
			}
		}

		// Check variant restrictions
		if (item.variantId) {
			const variantExclusions = restrictions.filter(
				(r: any) =>
					r.restrictionType === VoucherRestrictionType.VariantExclude &&
					r.targetVariantIds
			);
			for (const restriction of variantExclusions) {
				if ((restriction as any).targetVariantIds?.includes(item.variantId)) {
					return false; // Item variant is excluded
				}
			}

			const variantInclusions = restrictions.filter(
				(r: any) =>
					r.restrictionType === VoucherRestrictionType.VariantInclude &&
					r.targetVariantIds
			);
			if (variantInclusions.length > 0) {
				const included = variantInclusions.some((restriction: any) =>
					restriction.targetVariantIds?.includes(item.variantId)
				);
				if (!included) {
					return false; // Item variant not in inclusion list
				}
			}
		}

		return true; // Item passes all restriction checks
	});

	if (applicableItems.length === 0) {
		errors.push('No items in cart are eligible for this voucher');
	}

	// Calculate maximum redeemable amount
	const applicableTotalPrice = applicableItems.reduce(
		(sum, item) => sum + item.price * item.quantity,
		0
	);

	let maxRedeemableAmount = Math.min(
		voucherCode.currentBalance,
		applicableTotalPrice
	);

	// Check max discount amount restriction
	const maxDiscountRestriction = restrictions.find(
		(r: any) => r.maxDiscountAmount !== null
	);
	if (maxDiscountRestriction) {
		maxRedeemableAmount = Math.min(
			maxRedeemableAmount,
			(maxDiscountRestriction as any).maxDiscountAmount
		);
	}

	if (errors.length > 0) {
		return {
			isValid: false,
			errors,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	return {
		isValid: true,
		voucher: voucherCode as IVoucherCode,
		maxRedeemableAmount,
		applicableItems: applicableItems.map((item) => ({
			skuId: item.skuId,
			variantId: item.variantId,
			quantity: item.quantity,
			maxDiscount: Math.min(item.price * item.quantity, maxRedeemableAmount),
		})),
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

/**
 * Redeem a voucher
 */
export async function redeemVoucher(params: {
	voucherCode: string;
	redeemedAmount: number;
	orderId?: string | null;
	invoiceNumber?: string | null;
	branchId?: string | null;
	appliedToItems?: any[] | null;
	redeemedBy?: string | null;
	notes?: string | null;
}) {
	return await prisma.$transaction(async (tx) => {
		// Find and lock the voucher code
		const voucherCode = await tx.voucherCode.findUnique({
			where: { code: params.voucherCode },
		});

		if (!voucherCode) {
			throw new Error('Voucher code not found');
		}

		if (voucherCode.status !== VoucherStatus.Active) {
			throw new Error(`Voucher is ${voucherCode.status.toLowerCase()}`);
		}

		if (voucherCode.currentBalance < params.redeemedAmount) {
			throw new Error('Insufficient voucher balance');
		}

		// Calculate new balance
		const balanceBefore = voucherCode.currentBalance;
		const balanceAfter = balanceBefore - params.redeemedAmount;

		// Update voucher code
		const updatedVoucher = await tx.voucherCode.update({
			where: { id: voucherCode.id },
			data: {
				currentBalance: balanceAfter,
				status: balanceAfter <= 0 ? VoucherStatus.Redeemed : VoucherStatus.Active,
				fullyRedeemedAt: balanceAfter <= 0 ? new Date() : null,
				activatedAt: voucherCode.activatedAt || new Date(),
			},
		});

		// Create redemption record
		const redemption = await tx.voucherRedemption.create({
			data: {
				voucherCodeId: voucherCode.id,
				code: params.voucherCode,
				redeemedAmount: params.redeemedAmount,
				balanceBefore,
				balanceAfter,
				orderId: params.orderId,
				invoiceNumber: params.invoiceNumber,
				branchId: params.branchId,
				appliedToItems: params.appliedToItems || [],
				redeemedBy: params.redeemedBy,
				notes: params.notes,
			},
		});

		return {
			voucherCode: updatedVoucher,
			redemption,
		};
	});
}

/**
 * Get voucher balance
 */
export async function getVoucherBalance(code: string) {
	const voucherCode = await prisma.voucherCode.findUnique({
		where: { code },
		select: {
			currentBalance: true,
			initialValue: true,
			currency: true,
			status: true,
			expiresAt: true,
		},
	});

	if (!voucherCode) {
		throw new Error('Voucher code not found');
	}

	return voucherCode;
}

/**
 * Get voucher redemption history
 */
export async function getVoucherRedemptionHistory(code: string) {
	const redemptions = await prisma.voucherRedemption.findMany({
		where: { code },
		include: {
			branch: {
				select: {
					id: true,
					name: true,
					code: true,
				},
			},
			redeemer: {
				select: {
					id: true,
					email: true,
				},
			},
		},
		orderBy: {
			redeemedAt: 'desc',
		},
	});

	return redemptions;
}

/**
 * Cancel a voucher
 */
export async function cancelVoucher(code: string, reason?: string) {
	const voucherCode = await prisma.voucherCode.update({
		where: { code },
		data: {
			status: VoucherStatus.Cancelled,
			notes: reason ? `Cancelled: ${reason}` : 'Cancelled',
		},
	});

	return voucherCode;
}

/**
 * Extend voucher expiry
 */
export async function extendVoucherExpiry(code: string, newExpiryDate: Date) {
	const voucherCode = await prisma.voucherCode.update({
		where: { code },
		data: {
			expiresAt: newExpiryDate,
		},
	});

	return voucherCode;
}
