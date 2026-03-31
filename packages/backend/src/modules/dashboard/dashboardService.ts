import prisma from '../../prisma/client';
import { InventoryState, GRNStatus } from '@jingles/shared';
import logger from '../../utils/logger';

const STATS_ID = '00000000-0000-0000-0000-000000000001';

interface InventoryByState {
	[state: string]: {
		count: number;
		quantity: number;
	};
}

/**
 * Calculate and update dashboard statistics
 * This should be called whenever inventory or GRN records change
 */
export async function refreshDashboardStats(): Promise<void> {
	try {
		// Calculate inventory stats by state
		const inventoryRecords = await prisma.inventoryRecord.findMany({
			where: { quantity: { gt: 0 } },
			select: {
				state: true,
				quantity: true,
			},
		});

		// Calculate totals and state breakdown
		let totalItems = 0;
		let shelfReadyItems = 0;
		let damagedItems = 0;
		const inventoryByState: InventoryByState = {};

		// Initialize all states with zero counts
		Object.values(InventoryState).forEach((state) => {
			inventoryByState[state] = { count: 0, quantity: 0 };
		});

		// Calculate sums
		for (const record of inventoryRecords) {
			const quantity = record.quantity;
			totalItems += quantity;

			if (record.state === InventoryState.ShelfReady) {
				shelfReadyItems += quantity;
			} else if (record.state === InventoryState.Damaged) {
				damagedItems += quantity;
			}

			if (!inventoryByState[record.state]) {
				inventoryByState[record.state] = { count: 0, quantity: 0 };
			}
			inventoryByState[record.state].count += 1;
			inventoryByState[record.state].quantity += quantity;
		}

		// Calculate open GRNs (Draft, Submitted, PartiallyInspected)
		const openGRNs = await prisma.gRN.count({
			where: {
				status: {
					in: [GRNStatus.Draft, GRNStatus.Submitted, GRNStatus.PartiallyInspected],
				},
			},
		});

		// Update or create dashboard stats (use upsert for safety)
		await prisma.dashboardStats.upsert({
			where: { id: STATS_ID },
			update: {
				totalItems,
				shelfReadyItems,
				damagedItems,
				openGRNs,
				inventoryByState: inventoryByState as any,
				lastUpdated: new Date(),
			},
			create: {
				id: STATS_ID,
				totalItems,
				shelfReadyItems,
				damagedItems,
				openGRNs,
				inventoryByState: inventoryByState as any,
				lastUpdated: new Date(),
			},
		});

		logger.info('Dashboard stats refreshed', {
			totalItems,
			shelfReadyItems,
			damagedItems,
			openGRNs,
		});
	} catch (error) {
		logger.error('Failed to refresh dashboard stats', error);
		throw error;
	}
}

/**
 * Get cached dashboard statistics
 */
export async function getDashboardStats() {
	try {
		let stats = await prisma.dashboardStats.findUnique({
			where: { id: STATS_ID },
		});

		// If stats don't exist, calculate them now
		if (!stats) {
			await refreshDashboardStats();
			stats = await prisma.dashboardStats.findUnique({
				where: { id: STATS_ID },
			});
		}

		return stats;
	} catch (error) {
		logger.error('Failed to get dashboard stats', error);
		throw error;
	}
}

/**
 * Queue a background refresh (non-blocking)
 * Use this in write operations to avoid blocking the response
 */
export function queueDashboardStatsRefresh(): void {
	// Use setImmediate to run outside the current execution cycle
	setImmediate(() => {
		refreshDashboardStats().catch((error) => {
			logger.error('Background dashboard stats refresh failed', error);
		});
	});
}
