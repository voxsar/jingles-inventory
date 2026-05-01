import prisma from '../../prisma/client';
import { PricingOverlayType, PricingOverlayStatus } from '@jingles/shared';
import type {
	IPricingOverlay,
	IPricingContext,
	IAppliedOverlay,
	IPricingOverlayAppliesTo,
	IPricingOverlayConditions,
} from '@jingles/shared';

export interface CreateOverlayParams {
	name: string;
	description?: string | null;
	type: PricingOverlayType;
	value: number;
	appliesTo: IPricingOverlayAppliesTo;
	conditions?: IPricingOverlayConditions | null;
	priority?: number;
	stackable?: boolean;
	status?: PricingOverlayStatus;
	validFrom?: Date | null;
	validTo?: Date | null;
	createdBy?: string | null;
}

export interface UpdateOverlayParams {
	name?: string;
	description?: string | null;
	type?: PricingOverlayType;
	value?: number;
	appliesTo?: IPricingOverlayAppliesTo;
	conditions?: IPricingOverlayConditions | null;
	priority?: number;
	stackable?: boolean;
	status?: PricingOverlayStatus;
	validFrom?: Date | null;
	validTo?: Date | null;
}

/**
 * Create a new pricing overlay
 */
export async function createOverlay(params: CreateOverlayParams) {
	const overlay = await prisma.pricingOverlay.create({
		data: {
			name: params.name,
			description: params.description,
			type: params.type,
			value: params.value,
			appliesTo: params.appliesTo as any,
			conditions: params.conditions as any,
			priority: params.priority ?? 0,
			stackable: params.stackable ?? false,
			status: params.status ?? PricingOverlayStatus.Active,
			validFrom: params.validFrom,
			validTo: params.validTo,
			createdBy: params.createdBy,
		},
	});

	return overlay;
}

/**
 * List pricing overlays with optional filters
 */
export async function listOverlays(params: {
	search?: string;
	status?: string;
	type?: string;
	page?: number;
	pageSize?: number;
}) {
	const where: any = {};

	if (params.search) {
		where.OR = [
			{ name: { contains: params.search, mode: 'insensitive' } },
			{ description: { contains: params.search, mode: 'insensitive' } },
		];
	}

	if (params.status) {
		where.status = params.status;
	}

	if (params.type) {
		where.type = params.type;
	}

	const page = params.page ?? 1;
	const pageSize = params.pageSize ?? 50;
	const skip = (page - 1) * pageSize;

	const [overlays, total] = await Promise.all([
		prisma.pricingOverlay.findMany({
			where,
			orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
			skip,
			take: pageSize,
		}),
		prisma.pricingOverlay.count({ where }),
	]);

	return {
		items: overlays,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
	};
}

/**
 * Get a single overlay by ID
 */
export async function getOverlay(id: string) {
	const overlay = await prisma.pricingOverlay.findUnique({
		where: { id },
	});

	if (!overlay) {
		throw new Error('Pricing overlay not found');
	}

	return overlay;
}

/**
 * Update an existing overlay
 */
export async function updateOverlay(id: string, params: UpdateOverlayParams) {
	const overlay = await prisma.pricingOverlay.update({
		where: { id },
		data: {
			name: params.name,
			description: params.description,
			type: params.type,
			value: params.value,
			appliesTo: params.appliesTo as any,
			conditions: params.conditions as any,
			priority: params.priority,
			stackable: params.stackable,
			status: params.status,
			validFrom: params.validFrom,
			validTo: params.validTo,
		},
	});

	return overlay;
}

/**
 * Delete (soft delete by setting status to inactive) an overlay
 */
export async function deleteOverlay(id: string) {
	const overlay = await prisma.pricingOverlay.update({
		where: { id },
		data: { status: PricingOverlayStatus.Inactive },
	});

	return overlay;
}

/**
 * Check if an overlay applies to the given context
 */
function overlayApplies(overlay: any, context: IPricingContext): boolean {
	const appliesTo = overlay.appliesTo as IPricingOverlayAppliesTo;
	const conditions = overlay.conditions as IPricingOverlayConditions | null;

	// Check if overlay applies to this product
	let productMatch = false;

	if (appliesTo.batchIds && appliesTo.batchIds.length > 0) {
		// Specific batch targeting
		if (context.batchId && appliesTo.batchIds.includes(context.batchId)) {
			productMatch = true;
		}
	} else if (appliesTo.variantIds && appliesTo.variantIds.length > 0) {
		// Variant-level targeting
		if (context.variantId && appliesTo.variantIds.includes(context.variantId)) {
			productMatch = true;
		}
	} else if (appliesTo.skuIds && appliesTo.skuIds.length > 0) {
		// SKU-level targeting
		if (appliesTo.skuIds.includes(context.skuId)) {
			productMatch = true;
		}
	} else if (appliesTo.categoryIds && appliesTo.categoryIds.length > 0) {
		// Category-level targeting (would need to fetch SKU's category)
		// For now, we skip this - can be enhanced later
		productMatch = false;
	} else {
		// No specific targeting = applies to all
		productMatch = true;
	}

	if (!productMatch) {
		return false;
	}

	// Check conditions
	if (conditions) {
		// Quantity conditions
		if (context.quantity !== undefined) {
			if (conditions.minQty !== undefined && context.quantity < conditions.minQty) {
				return false;
			}
			if (conditions.maxQty !== undefined && context.quantity > conditions.maxQty) {
				return false;
			}
		}

		// Customer type conditions
		if (conditions.customerType && context.customerType) {
			if (conditions.customerType !== context.customerType) {
				return false;
			}
		}

		// Customer group conditions
		if (conditions.customerGroups && conditions.customerGroups.length > 0 && context.customerGroup) {
			if (!conditions.customerGroups.includes(context.customerGroup)) {
				return false;
			}
		}

		// Branch conditions
		if (conditions.branches && conditions.branches.length > 0 && context.branchId) {
			if (!conditions.branches.includes(context.branchId)) {
				return false;
			}
		}

		// Date range conditions
		if (conditions.dateRange) {
			const checkDate = context.date ?? new Date();
			const startDate = new Date(conditions.dateRange.start);
			const endDate = new Date(conditions.dateRange.end);

			if (checkDate < startDate || checkDate > endDate) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Check if overlay is currently valid based on validFrom/validTo dates
 */
function isOverlayValid(overlay: any, date: Date = new Date()): boolean {
	if (overlay.validFrom && date < new Date(overlay.validFrom)) {
		return false;
	}

	if (overlay.validTo && date > new Date(overlay.validTo)) {
		return false;
	}

	return true;
}

/**
 * Get all applicable overlays for a given pricing context
 * Filters by applicability, status, and validity dates
 */
export async function getApplicableOverlays(context: IPricingContext): Promise<any[]> {
	// Fetch all active overlays
	const allOverlays = await prisma.pricingOverlay.findMany({
		where: {
			status: PricingOverlayStatus.Active,
		},
		orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
	});

	const checkDate = context.date ?? new Date();

	// Filter overlays that apply to this context
	const applicableOverlays = allOverlays.filter((overlay) => {
		// Check validity dates
		if (!isOverlayValid(overlay, checkDate)) {
			return false;
		}

		// Check if overlay applies to this context
		return overlayApplies(overlay, context);
	});

	return applicableOverlays;
}

/**
 * Apply a single overlay to a price and return the adjustment
 */
function applyOverlay(basePrice: number, overlay: any): { newPrice: number; adjustment: number } {
	let adjustment = 0;
	let newPrice = basePrice;

	switch (overlay.type) {
		case PricingOverlayType.PercentageDiscount:
			adjustment = -(basePrice * (overlay.value / 100));
			newPrice = basePrice + adjustment;
			break;

		case PricingOverlayType.FixedDiscount:
			adjustment = -overlay.value;
			newPrice = basePrice + adjustment;
			break;

		case PricingOverlayType.PercentageMarkup:
			adjustment = basePrice * (overlay.value / 100);
			newPrice = basePrice + adjustment;
			break;

		case PricingOverlayType.FixedMarkup:
			adjustment = overlay.value;
			newPrice = basePrice + adjustment;
			break;

		default:
			// Unknown type, no adjustment
			break;
	}

	// Ensure price doesn't go negative
	if (newPrice < 0) {
		newPrice = 0;
	}

	return { newPrice, adjustment };
}

/**
 * Resolve final price by applying overlays with stacking rules
 *
 * Stacking logic:
 * - Sort by priority (highest first)
 * - If overlay is not stackable, apply only that overlay and stop
 * - If overlay is stackable, apply and continue to next
 */
export function resolveOverlays(
	basePrice: number,
	overlays: any[]
): { finalPrice: number; appliedOverlays: IAppliedOverlay[]; warnings: string[] } {
	const appliedOverlays: IAppliedOverlay[] = [];
	const warnings: string[] = [];

	let currentPrice = basePrice;

	// Overlays are already sorted by priority (desc) from getApplicableOverlays
	for (const overlay of overlays) {
		const { newPrice, adjustment } = applyOverlay(currentPrice, overlay);

		appliedOverlays.push({
			overlayId: overlay.id,
			overlayName: overlay.name,
			type: overlay.type,
			value: overlay.value,
			adjustment,
		});

		currentPrice = newPrice;

		// If this overlay is not stackable, stop processing
		if (!overlay.stackable) {
			// Check if there are more overlays with the same priority
			const remainingHighPriority = overlays.filter(
				(o) => o.priority === overlay.priority && o.id !== overlay.id
			);

			if (remainingHighPriority.length > 0) {
				warnings.push(
					`Overlay "${overlay.name}" (non-stackable) overrides ${remainingHighPriority.length} other overlay(s) at the same priority level`
				);
			}

			break;
		}
	}

	return {
		finalPrice: currentPrice,
		appliedOverlays,
		warnings,
	};
}

/**
 * Get conflicts for overlays (overlays that would affect the same product but can't stack)
 */
export async function detectOverlayConflicts(overlayId: string): Promise<any[]> {
	const overlay = await getOverlay(overlayId);
	const appliesTo = overlay.appliesTo as IPricingOverlayAppliesTo;

	// Find other active overlays that:
	// 1. Are not stackable
	// 2. Target the same products
	// 3. Have the same priority

	const conflicts = await prisma.pricingOverlay.findMany({
		where: {
			id: { not: overlayId },
			status: PricingOverlayStatus.Active,
			stackable: false,
			priority: overlay.priority,
		},
	});

	// Filter to only those that overlap in targeting
	const actualConflicts = conflicts.filter((conflictOverlay) => {
		const conflictAppliesTo = conflictOverlay.appliesTo as IPricingOverlayAppliesTo;

		// Check for overlaps
		if (appliesTo.batchIds && conflictAppliesTo.batchIds) {
			const overlap = appliesTo.batchIds.some((id) => conflictAppliesTo.batchIds!.includes(id));
			if (overlap) return true;
		}

		if (appliesTo.variantIds && conflictAppliesTo.variantIds) {
			const overlap = appliesTo.variantIds.some((id) => conflictAppliesTo.variantIds!.includes(id));
			if (overlap) return true;
		}

		if (appliesTo.skuIds && conflictAppliesTo.skuIds) {
			const overlap = appliesTo.skuIds.some((id) => conflictAppliesTo.skuIds!.includes(id));
			if (overlap) return true;
		}

		if (appliesTo.categoryIds && conflictAppliesTo.categoryIds) {
			const overlap = appliesTo.categoryIds.some((id) => conflictAppliesTo.categoryIds!.includes(id));
			if (overlap) return true;
		}

		return false;
	});

	return actualConflicts;
}
