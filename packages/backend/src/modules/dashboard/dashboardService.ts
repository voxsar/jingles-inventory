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
		// Aggregate in the database instead of loading every record into memory
		const groupedStates = await prisma.inventoryRecord.groupBy({
			by: ['state'],
			where: { quantity: { gt: 0 } },
			_count: { _all: true },
			_sum: { quantity: true },
		});

		let totalItems = 0;
		let shelfReadyItems = 0;
		let damagedItems = 0;
		const inventoryByState: InventoryByState = {};

		// Initialize all states with zero counts
		Object.values(InventoryState).forEach((state) => {
			inventoryByState[state] = { count: 0, quantity: 0 };
		});

		for (const group of groupedStates) {
			const quantity = group._sum.quantity ?? 0;
			totalItems += quantity;

			if (group.state === InventoryState.ShelfReady) {
				shelfReadyItems += quantity;
			} else if (group.state === InventoryState.Damaged) {
				damagedItems += quantity;
			}

			inventoryByState[group.state] = {
				count: group._count._all,
				quantity,
			};
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

const REFRESH_COALESCE_MS = 2000;

let refreshTimer: NodeJS.Timeout | null = null;
let refreshRunning = false;
let refreshRequestedWhileRunning = false;

async function runCoalescedRefresh(): Promise<void> {
	refreshTimer = null;
	refreshRunning = true;
	try {
		await refreshDashboardStats();
	} catch (error) {
		logger.error('Background dashboard stats refresh failed', error);
	} finally {
		refreshRunning = false;
		if (refreshRequestedWhileRunning) {
			refreshRequestedWhileRunning = false;
			queueDashboardStatsRefresh();
		}
	}
}

/**
 * Queue a background refresh (non-blocking)
 * Use this in write operations to avoid blocking the response.
 * Calls are coalesced: a burst of writes (e.g. a bulk import) results in a
 * single recalculation shortly after, instead of one full refresh per write.
 */
export function queueDashboardStatsRefresh(): void {
	if (refreshRunning) {
		refreshRequestedWhileRunning = true;
		return;
	}
	if (refreshTimer) {
		return;
	}
	refreshTimer = setTimeout(() => {
		void runCoalescedRefresh();
	}, REFRESH_COALESCE_MS);
	refreshTimer.unref?.();
}
