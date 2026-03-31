/**
 * Status Lookup Helper
 * 
 * Provides helpers to fetch status values from the database using special keys.
 * This replaces hardcoded enum usage throughout the application.
 */

import prisma from '../../prisma/client';

// Special keys for statuses with business logic significance
export const SpecialStatusKeys = {
	// Inventory states
	INVENTORY_UNOPENED_BOX: 'INVENTORY_UNOPENED_BOX',
	INVENTORY_UNINSPECTED: 'INVENTORY_UNINSPECTED',
	INVENTORY_INSPECTED: 'INVENTORY_INSPECTED',
	INVENTORY_SHELF_READY: 'INVENTORY_SHELF_READY',
	INVENTORY_DAMAGED: 'INVENTORY_DAMAGED',
	INVENTORY_RETURNED: 'INVENTORY_RETURNED',
	INVENTORY_RESERVED: 'INVENTORY_RESERVED',
	INVENTORY_SOLD: 'INVENTORY_SOLD',

	// GRN statuses
	GRN_DRAFT: 'GRN_DRAFT',
	GRN_SUBMITTED: 'GRN_SUBMITTED',
	GRN_PARTIALLY_INSPECTED: 'GRN_PARTIALLY_INSPECTED',
	GRN_FULLY_INSPECTED: 'GRN_FULLY_INSPECTED',
	GRN_CLOSED: 'GRN_CLOSED',

	// Stock transfer statuses
	TRANSFER_DRAFT: 'TRANSFER_DRAFT',
	TRANSFER_PENDING: 'TRANSFER_PENDING',
	TRANSFER_APPROVED: 'TRANSFER_APPROVED',
	TRANSFER_IN_TRANSIT: 'TRANSFER_IN_TRANSIT',
	TRANSFER_COMPLETED: 'TRANSFER_COMPLETED',
	TRANSFER_CANCELLED: 'TRANSFER_CANCELLED',

	// Damage classifications
	DAMAGE_MINOR: 'DAMAGE_MINOR',
	DAMAGE_MAJOR: 'DAMAGE_MAJOR',
	DAMAGE_TOTALED: 'DAMAGE_TOTALED',

	// Vendor types
	VENDOR_TYPE_VENDOR: 'VENDOR_TYPE_VENDOR',
	VENDOR_TYPE_SUPPLIER: 'VENDOR_TYPE_SUPPLIER',
	VENDOR_TYPE_BOTH: 'VENDOR_TYPE_BOTH',
} as const;

const FALLBACK_STATUS_BY_KEY: Record<string, string> = {
	INVENTORY_UNOPENED_BOX: 'UnopenedBox',
	INVENTORY_UNINSPECTED: 'Uninspected',
	INVENTORY_INSPECTED: 'Inspected',
	INVENTORY_SHELF_READY: 'ShelfReady',
	INVENTORY_DAMAGED: 'Damaged',
	INVENTORY_RETURNED: 'Returned',
	INVENTORY_RESERVED: 'Reserved',
	INVENTORY_SOLD: 'Sold',
	GRN_DRAFT: 'Draft',
	GRN_SUBMITTED: 'Submitted',
	GRN_PARTIALLY_INSPECTED: 'PartiallyInspected',
	GRN_FULLY_INSPECTED: 'FullyInspected',
	GRN_CLOSED: 'Closed',
	TRANSFER_DRAFT: 'Draft',
	TRANSFER_PENDING: 'Pending',
	TRANSFER_APPROVED: 'Approved',
	TRANSFER_IN_TRANSIT: 'InTransit',
	TRANSFER_COMPLETED: 'Completed',
	TRANSFER_CANCELLED: 'Cancelled',
	DAMAGE_MINOR: 'Minor',
	DAMAGE_MAJOR: 'Major',
	DAMAGE_TOTALED: 'Totaled',
	VENDOR_TYPE_VENDOR: 'Vendor',
	VENDOR_TYPE_SUPPLIER: 'Supplier',
	VENDOR_TYPE_BOTH: 'Both',
};

// Cache for status lookups (cleared on app restart)
const statusCache = new Map<string, string>();

/**
 * Get the status value by special key
 * @param specialKey The special key (e.g., 'INVENTORY_UNOPENED_BOX')
 * @returns The status value (e.g., 'UnopenedBox')
 * @throws Error if status not found
 */
export async function getStatusByKey(specialKey: string): Promise<string> {
	// Check cache first
	if (statusCache.has(specialKey)) {
		return statusCache.get(specialKey)!;
	}

	const statusModel = (prisma as any).statusOption;
	if (!statusModel?.findUnique) {
		const fallback = FALLBACK_STATUS_BY_KEY[specialKey];
		if (!fallback) {
			throw new Error(`Status with special key '${specialKey}' not found in database`);
		}
		statusCache.set(specialKey, fallback);
		return fallback;
	}

	const status = await statusModel.findUnique({
		where: { specialKey },
		select: { value: true },
	});

	if (!status) {
		const fallback = FALLBACK_STATUS_BY_KEY[specialKey];
		if (!fallback) {
			throw new Error(`Status with special key '${specialKey}' not found in database`);
		}
		statusCache.set(specialKey, fallback);
		return fallback;
	}

	// Cache for future lookups
	statusCache.set(specialKey, status.value);

	return status.value;
}

/**
 * Get multiple status values by special keys
 * @param specialKeys Array of special keys
 * @returns Map of special key to status value
 */
export async function getStatusesByKeys(specialKeys: string[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const uncachedKeys: string[] = [];

	// Check cache first
	for (const key of specialKeys) {
		if (statusCache.has(key)) {
			result.set(key, statusCache.get(key)!);
		} else {
			uncachedKeys.push(key);
		}
	}

	// Fetch uncached statuses
	if (uncachedKeys.length > 0) {
		const statusModel = (prisma as any).statusOption;
		if (statusModel?.findMany) {
			const statuses = await statusModel.findMany({
				where: { specialKey: { in: uncachedKeys } },
				select: { specialKey: true, value: true },
			});

			for (const status of statuses) {
				if (status.specialKey) {
					statusCache.set(status.specialKey, status.value);
					result.set(status.specialKey, status.value);
				}
			}
		}

		for (const key of uncachedKeys) {
			if (!result.has(key) && FALLBACK_STATUS_BY_KEY[key]) {
				const fallback = FALLBACK_STATUS_BY_KEY[key];
				statusCache.set(key, fallback);
				result.set(key, fallback);
			}
		}
	}

	// Check if all keys were found
	for (const key of specialKeys) {
		if (!result.has(key)) {
			throw new Error(`Status with special key '${key}' not found in database`);
		}
	}

	return result;
}

/**
 * Preload all statuses with special keys into cache
 * Call this on app startup for better performance
 */
export async function preloadStatusCache(): Promise<void> {
	const statusModel = (prisma as any).statusOption;
	if (!statusModel?.findMany) {
		return;
	}

	const statuses = await statusModel.findMany({
		where: { specialKey: { not: null } },
		select: { specialKey: true, value: true },
	});

	for (const status of statuses) {
		if (status.specialKey) {
			statusCache.set(status.specialKey, status.value);
		}
	}

	console.log(`Preloaded ${statuses.length} statuses into cache`);
}

/**
 * Clear the status cache (useful for testing)
 */
export function clearStatusCache(): void {
	statusCache.clear();
}
