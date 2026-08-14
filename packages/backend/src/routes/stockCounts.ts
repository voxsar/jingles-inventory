import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { InventoryEventType, UserRole } from '@jingles/shared';
import { getStatusByKey, SpecialStatusKeys } from '../modules/statuses/statusLookup';
import { queueDashboardStatsRefresh } from '../modules/dashboard/dashboardService';
import {
	SYNC_V2_OPERATION_TYPES,
	enqueueLocalSyncOperation,
	recordServerSyncChanges,
} from '../sync/syncV2';
import logger from '../utils/logger';

const stockCountRunRouter = Router();
const stockCountRouter = Router();
const countingRoles = [UserRole.Admin, UserRole.Manager, UserRole.Staff];

stockCountRunRouter.use(authenticate);
stockCountRouter.use(authenticate);
stockCountRunRouter.use(requireRole(...countingRoles));
stockCountRouter.use(requireRole(...countingRoles));

class StockCountError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

function cleanText(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function readQuantity(value: unknown) {
	const quantity = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}

function readAdjustment(value: unknown) {
	const quantity = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(quantity) && quantity !== 0 ? quantity : null;
}

function uniqueVendors(sku: any) {
	const vendors = [sku.vendor, ...(sku.skuVendors ?? []).map((entry: any) => entry.vendor)]
		.filter(Boolean)
		.map((vendor: any) => ({ id: vendor.id, name: vendor.name }));
	return Array.from(new Map(vendors.map((vendor: any) => [vendor.id, vendor])).values());
}

const skuVendorInclude = {
	vendor: { select: { id: true, name: true } },
	skuVendors: { include: { vendor: { select: { id: true, name: true } } } },
} as const;

async function loadStockCatalogProducts() {
	const skus = await prisma.sKU.findMany({
		where: { isActive: true },
		include: {
			...skuVendorInclude,
			barcodes: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
			variants: {
				where: { isActive: true },
				include: { barcodes: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } },
				orderBy: { variantCode: 'asc' },
			},
		},
		orderBy: [{ name: 'asc' }, { skuCode: 'asc' }],
	});

	return skus.flatMap((sku: any) => {
		const common = {
			skuId: sku.id,
			skuCode: sku.skuCode,
			name: sku.name,
			vendors: uniqueVendors(sku),
		};
		const baseEntry = {
			...common,
			variantId: null,
			variantCode: null,
			variantName: null,
			barcodes: sku.barcodes.filter((barcode: any) => !barcode.variantId).map((barcode: any) => barcode.barcode),
		};
		if (sku.variants.length === 0) return [baseEntry];
		const variantEntries = sku.variants.map((variant: any) => ({
			...common,
			variantId: variant.id,
			variantCode: variant.variantCode,
			variantName: variant.name,
			barcodes: variant.barcodes.map((barcode: any) => barcode.barcode),
		}));
		return baseEntry.barcodes.length > 0 ? [baseEntry, ...variantEntries] : variantEntries;
	});
}

function locationKey(floorId: string, shelfId: string | null) {
	return shelfId ? `shelf:${shelfId}` : `floor:${floorId}`;
}

function isRetryableTransactionError(error: unknown) {
	const code = typeof error === 'object' && error !== null && 'code' in error
		? String((error as { code: unknown }).code)
		: '';
	return code === 'P2034' || code === 'P2002';
}

async function serializableTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			return await prisma.$transaction(callback, { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel });
		} catch (error) {
			lastError = error;
			if (!isRetryableTransactionError(error) || attempt === 2) throw error;
		}
	}
	throw lastError;
}

function sendRouteError(res: Response, error: unknown, fallback: string) {
	if (error instanceof StockCountError) {
		res.status(error.status).json({ success: false, error: error.message });
		return;
	}
	logger.error(fallback, error);
	res.status(500).json({ success: false, error: fallback });
}

function runPayload(run: any) {
	return {
		runId: run.id,
		branchId: run.branchId,
		status: run.status,
		startedAt: run.startedAt,
		completedAt: run.completedAt,
		branch: run.branch,
	};
}

// GET /api/stock-count-runs/open?branchId=...
stockCountRunRouter.get('/open', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const branchId = cleanText(req.query.branchId);
		if (!branchId) throw new StockCountError(400, 'branchId is required');
		const run = await prisma.stockCountRun.findFirst({
			where: { branchId, status: 'OPEN' },
			include: { branch: { select: { id: true, name: true, code: true } } },
		});
		if (!run) throw new StockCountError(404, 'No open stock-count run for this branch');
		res.json({ success: true, data: runPayload(run) });
	} catch (error) {
		sendRouteError(res, error, 'Failed to find the open stock-count run');
	}
});

// POST /api/stock-count-runs
stockCountRunRouter.post(
	'/',
	requireRole(UserRole.Admin, UserRole.Manager),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const branchId = cleanText(req.body.branchId);
			const requestId = cleanText(req.body.requestId);
			if (!branchId || !requestId) throw new StockCountError(400, 'branchId and requestId are required');

			const repeated = await prisma.stockCountRun.findUnique({
				where: { requestId },
				include: { branch: { select: { id: true, name: true, code: true } } },
			});
			if (repeated) {
				res.json({ success: true, replayed: true, data: runPayload(repeated) });
				return;
			}

			const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
			if (!branch) throw new StockCountError(404, 'Branch not found');
			const run = await prisma.stockCountRun.create({
				data: {
					branchId,
					requestId,
					openBranchKey: branchId,
					startedById: req.user!.id,
					status: 'OPEN',
				},
				include: { branch: { select: { id: true, name: true, code: true } } },
			});
			res.status(201).json({ success: true, data: runPayload(run) });
		} catch (error) {
			if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002') {
				res.status(409).json({ success: false, error: 'This branch already has an open stock-count run' });
				return;
			}
			sendRouteError(res, error, 'Failed to start the stock-count run');
		}
	},
);

// GET /api/stock-count-runs/:runId/catalog
stockCountRunRouter.get('/:runId/catalog', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const run = await prisma.stockCountRun.findUnique({ where: { id: req.params.runId } });
		if (!run) throw new StockCountError(404, 'Stock-count run not found');
		const products = await loadStockCatalogProducts();

		res.json({
			success: true,
			data: {
				runId: run.id,
				catalogVersion: run.startedAt.toISOString(),
				products,
			},
		});
	} catch (error) {
		sendRouteError(res, error, 'Failed to load the stock-count catalog');
	}
});

// GET /api/stock-count/catalog
// Current catalog for online mobile stock additions that do not belong to a count run.
stockCountRouter.get('/catalog', async (_req: AuthRequest, res: Response): Promise<void> => {
	try {
		const products = await loadStockCatalogProducts();
		res.json({
			success: true,
			data: { catalogVersion: new Date().toISOString(), products },
		});
	} catch (error) {
		sendRouteError(res, error, 'Failed to load the mobile stock catalog');
	}
});

function adjustmentPayload(event: any) {
	const metadata = event.metadata ?? {};
	return {
		requestId: event.id,
		skuId: metadata.skuId,
		variantId: metadata.variantId ?? null,
		floorId: metadata.floorId,
		shelfId: metadata.shelfId ?? null,
		quantityDelta: event.quantityDelta,
		beforeQuantity: event.beforeQuantity,
		afterQuantity: event.afterQuantity,
		recordsChanged: metadata.recordsChanged ?? 0,
	};
}

// POST /api/stock-count/adjust
// Idempotent online stock-up/stock-down action used by the Android scanner.
stockCountRouter.post(
	'/adjust',
	requireRole(...countingRoles),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const requestId = cleanText(req.body.requestId);
			const skuId = cleanText(req.body.skuId);
			const variantId = cleanText(req.body.variantId) || null;
			const floorId = cleanText(req.body.floorId);
			const shelfId = cleanText(req.body.shelfId) || null;
			const terminalId = cleanText(req.body.terminalId) || null;
			const quantityDelta = readAdjustment(req.body.quantityDelta);
			if (!requestId || !skuId || !floorId || quantityDelta === null) {
				throw new StockCountError(400, 'requestId, skuId, floorId and a non-zero quantityDelta are required');
			}

			const replayed = await prisma.inventoryEvent.findUnique({ where: { id: requestId } });
			if (replayed) {
				if (replayed.reasonCode !== 'MOBILE_STOCK_ADJUSTMENT') {
					throw new StockCountError(409, 'requestId was already used by another inventory action');
				}
				res.json({ success: true, replayed: true, data: adjustmentPayload(replayed) });
				return;
			}

			await resolveManualProduct(skuId, variantId);
			const floor = await prisma.floor.findFirst({ where: { id: floorId, isActive: true } });
			if (!floor) throw new StockCountError(400, 'Floor not found or inactive');
			if (shelfId) {
				const shelf = await prisma.shelf.findFirst({ where: { id: shelfId, floorId, isActive: true } });
				if (!shelf) throw new StockCountError(400, 'Shelf does not belong to the selected floor');
			}
			const shelfReadyState = await getStatusByKey(SpecialStatusKeys.INVENTORY_SHELF_READY);

			let result;
			try {
				result = await serializableTransaction(async (tx) => {
					const concurrentReplay = await tx.inventoryEvent.findUnique({ where: { id: requestId } });
					if (concurrentReplay) {
						if (concurrentReplay.reasonCode !== 'MOBILE_STOCK_ADJUSTMENT') {
							throw new StockCountError(409, 'requestId was already used by another inventory action');
						}
						return { replayed: true, data: adjustmentPayload(concurrentReplay) };
					}

					const where: Prisma.InventoryRecordWhereInput = { skuId, variantId, floorId, shelfId };
					const records = await tx.inventoryRecord.findMany({ where, orderBy: { createdAt: 'asc' } });
					const beforeQuantity = records.reduce((sum: number, record: any) => sum + record.quantity, 0);
					const afterQuantity = beforeQuantity + quantityDelta;
					if (afterQuantity < -1e-9) {
						throw new StockCountError(409, `Cannot remove ${Math.abs(quantityDelta)}; only ${beforeQuantity} is available at this location`);
					}

					const changedRecords: Array<{ record: any; created: boolean; baseVersion: number }> = [];
					if (quantityDelta > 0) {
						const target = records.find((record: any) => (
							record.boxId === null && record.batchId === null && record.state === shelfReadyState
						));
						if (target) {
							const updated = await tx.inventoryRecord.update({
								where: { id: target.id },
								data: {
									quantity: target.quantity + quantityDelta,
									terminalId,
									userId: req.user!.id,
									version: { increment: 1 },
								},
							});
							changedRecords.push({ record: updated, created: false, baseVersion: target.version });
						} else {
							const created = await tx.inventoryRecord.create({
								data: {
									skuId,
									variantId,
									floorId,
									shelfId,
									quantity: quantityDelta,
									state: shelfReadyState,
									terminalId,
									userId: req.user!.id,
								},
							});
							changedRecords.push({ record: created, created: true, baseVersion: 0 });
						}
					} else {
						let remaining = Math.abs(quantityDelta);
						const removalOrder = [...records].sort((left: any, right: any) => {
							const leftGeneric = left.boxId === null && left.batchId === null && left.state === shelfReadyState ? 0 : 1;
							const rightGeneric = right.boxId === null && right.batchId === null && right.state === shelfReadyState ? 0 : 1;
							return leftGeneric - rightGeneric;
						});
						for (const record of removalOrder) {
							if (remaining <= 1e-9 || record.quantity <= 0) continue;
							const removed = Math.min(record.quantity, remaining);
							const updated = await tx.inventoryRecord.update({
								where: { id: record.id },
								data: {
									quantity: Math.max(0, record.quantity - removed),
									terminalId,
									userId: req.user!.id,
									version: { increment: 1 },
								},
							});
							changedRecords.push({ record: updated, created: false, baseVersion: record.version });
							remaining -= removed;
						}
					}

					const event = await tx.inventoryEvent.create({
						data: {
							id: requestId,
							eventType: InventoryEventType.MANUAL_ADJUSTMENT,
							parentEntityId: `mobile-stock:${skuId}:${variantId ?? ''}:${floorId}:${shelfId ?? ''}`,
							quantityDelta,
							beforeQuantity,
							afterQuantity: Math.max(0, afterQuantity),
							reasonCode: 'MOBILE_STOCK_ADJUSTMENT',
							userId: req.user!.id,
							terminalId,
							metadata: { skuId, variantId, floorId, shelfId, recordsChanged: changedRecords.length } as any,
						},
					});

					for (const change of changedRecords) {
						await enqueueLocalSyncOperation(tx as any, {
							opType: change.created
								? SYNC_V2_OPERATION_TYPES.INVENTORY_CREATE
								: SYNC_V2_OPERATION_TYPES.INVENTORY_UPDATE,
							aggregateId: change.record.id,
							baseVersion: change.baseVersion,
							payload: change.created
								? {
									id: change.record.id,
									skuId,
									variantId,
									floorId,
									shelfId,
									quantity: change.record.quantity,
									state: change.record.state,
									terminalId,
								}
								: { id: change.record.id, quantity: change.record.quantity },
						});
					}
					await recordServerSyncChanges(tx as any, {
						aggregateId: requestId,
						changes: [
							...changedRecords.map((change) => ({
								tableName: 'inventory_records' as const,
								rowId: change.record.id,
								action: 'upsert' as const,
							})),
							{ tableName: 'inventory_events', rowId: event.id, action: 'upsert' },
						],
					});

					return { replayed: false, data: adjustmentPayload(event) };
				});
			} catch (error) {
				if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002') {
					const concurrentReplay = await prisma.inventoryEvent.findUnique({ where: { id: requestId } });
					if (concurrentReplay?.reasonCode === 'MOBILE_STOCK_ADJUSTMENT') {
						res.json({ success: true, replayed: true, data: adjustmentPayload(concurrentReplay) });
						return;
					}
				}
				throw error;
			}

			queueDashboardStatsRefresh();
			res.json({ success: true, ...result });
		} catch (error) {
			sendRouteError(res, error, 'Failed to adjust stock from the phone');
		}
	},
);

// POST /api/stock-count-runs/:runId/device-sessions
stockCountRunRouter.post(
	'/:runId/device-sessions',
	requireRole(...countingRoles),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const deviceId = cleanText(req.body.deviceId);
			const deviceName = cleanText(req.body.deviceName);
			const floorId = cleanText(req.body.floorId);
			const shelfId = cleanText(req.body.shelfId) || null;
			if (!deviceId || !deviceName || !floorId) {
				throw new StockCountError(400, 'deviceId, deviceName and floorId are required');
			}
			const run = await prisma.stockCountRun.findUnique({ where: { id: req.params.runId } });
			if (!run) throw new StockCountError(404, 'Stock-count run not found');
			if (run.status !== 'OPEN') throw new StockCountError(409, 'Stock-count run is not open');
			const floor = await prisma.floor.findFirst({ where: { id: floorId, branchId: run.branchId, isActive: true } });
			if (!floor) throw new StockCountError(400, 'Floor does not belong to the selected branch');
			if (shelfId) {
				const shelf = await prisma.shelf.findFirst({ where: { id: shelfId, floorId, isActive: true } });
				if (!shelf) throw new StockCountError(400, 'Shelf does not belong to the selected floor');
			}

			const existing = await prisma.stockCountDeviceSession.findUnique({
				where: { runId_deviceId: { runId: run.id, deviceId } },
				include: { floor: true, shelf: true, run: { include: { branch: true } } },
			});
			if (existing) {
				if (existing.floorId !== floorId || existing.shelfId !== shelfId) {
					throw new StockCountError(409, 'This phone already joined the run with a different location');
				}
				res.json({ success: true, replayed: true, data: existing });
				return;
			}

			const session = await prisma.stockCountDeviceSession.create({
				data: { runId: run.id, deviceId, deviceName, floorId, shelfId, startedById: req.user!.id },
				include: { floor: true, shelf: true, run: { include: { branch: true } } },
			});
			res.status(201).json({ success: true, data: session });
		} catch (error) {
			sendRouteError(res, error, 'Failed to create the phone stock-count session');
		}
	},
);

// POST /api/stock-count-runs/:runId/complete
stockCountRunRouter.post(
	'/:runId/complete',
	requireRole(UserRole.Admin, UserRole.Manager),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const run = await prisma.stockCountRun.findUnique({ where: { id: req.params.runId } });
			if (!run) throw new StockCountError(404, 'Stock-count run not found');
			if (run.status === 'COMPLETED') {
				res.json({ success: true, replayed: true, data: run });
				return;
			}
			const openSessions = await prisma.stockCountDeviceSession.count({
				where: { runId: run.id, status: 'OPEN' },
			});
			if (openSessions > 0) throw new StockCountError(409, `${openSessions} phone session(s) are still open`);
			const [totals, productCount] = await Promise.all([
				prisma.stockCountItem.aggregate({ where: { runId: run.id }, _sum: { quantity: true } }),
				prisma.stockCountItem.count({ where: { runId: run.id } }),
			]);
			const completed = await prisma.stockCountRun.update({
				where: { id: run.id },
				data: { status: 'COMPLETED', openBranchKey: null, completedAt: new Date(), completedById: req.user!.id },
			});
			res.json({
				success: true,
				data: { ...completed, productCount, totalCountedQuantity: totals._sum.quantity ?? 0 },
			});
		} catch (error) {
			sendRouteError(res, error, 'Failed to complete the stock-count run');
		}
	},
);

// GET /api/stock-count/device-sessions/open?deviceId=...&branchId=...
stockCountRouter.get('/device-sessions/open', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const deviceId = cleanText(req.query.deviceId);
		const branchId = cleanText(req.query.branchId);
		if (!deviceId) throw new StockCountError(400, 'deviceId is required');
		const session = await prisma.stockCountDeviceSession.findFirst({
			where: {
				deviceId,
				status: 'OPEN',
				run: { status: 'OPEN', ...(branchId ? { branchId } : {}) },
			},
			include: { floor: true, shelf: true, run: { include: { branch: true } } },
			orderBy: { startedAt: 'desc' },
		});
		if (!session) throw new StockCountError(404, 'No open stock-count session for this phone');
		res.json({ success: true, data: session });
	} catch (error) {
		sendRouteError(res, error, 'Failed to resume the phone stock-count session');
	}
});

async function resolveManualProduct(skuId: string, variantId: string | null) {
	const sku = await prisma.sKU.findFirst({
		where: { id: skuId, isActive: true },
		include: skuVendorInclude,
	});
	if (!sku) throw new StockCountError(404, 'Product not found');
	const variant = variantId
		? await prisma.sKUVariant.findFirst({ where: { id: variantId, skuId, isActive: true } })
		: null;
	if (variantId && !variant) throw new StockCountError(400, 'Variant does not belong to the selected product');
	return { sku, variant };
}

async function replayedSubmission(requestId: string, deviceSessionId: string) {
	const submission = await prisma.stockCountSubmission.findUnique({
		where: { requestId },
		include: {
			item: true,
			sku: { include: skuVendorInclude },
			variant: true,
		},
	});
	if (!submission) return null;
	if (submission.deviceSessionId !== deviceSessionId) {
		throw new StockCountError(409, 'requestId was already used by another phone session');
	}
	return {
		skuId: submission.skuId,
		variantId: submission.variantId,
		name: submission.sku.name,
		variantName: submission.variant?.name ?? null,
		deviceQuantity: submission.deviceAfter,
		totalCountedQuantity: submission.item.quantity,
		vendors: uniqueVendors(submission.sku),
	};
}

async function applyCount(input: {
	deviceSessionId: string;
	sku: any;
	variant: any | null;
	quantity: number;
	barcode: string | null;
	requestId: string;
	userId: string;
}) {
	const replayed = await replayedSubmission(input.requestId, input.deviceSessionId);
	if (replayed) return { replayed: true, data: replayed };
	const shelfReadyState = await getStatusByKey(SpecialStatusKeys.INVENTORY_SHELF_READY);

	let result: { deviceQuantity: number; totalCountedQuantity: number };
	try {
		result = await serializableTransaction(async (tx) => {
		const session = await tx.stockCountDeviceSession.findUnique({
			where: { id: input.deviceSessionId },
			include: { run: true },
		});
		if (!session) throw new StockCountError(404, 'Phone stock-count session not found');
		if (session.status !== 'OPEN' || session.run.status !== 'OPEN') {
			throw new StockCountError(409, 'Phone stock-count session is not open');
		}
		// Lock this phone session so completion cannot race an in-flight count.
		await tx.stockCountDeviceSession.update({
			where: { id: session.id },
			data: { deviceName: session.deviceName },
		});

		const variantId = input.variant?.id ?? null;
		const variantKey = variantId ?? '';
		const itemLocationKey = locationKey(session.floorId, session.shelfId);
		let item = await tx.stockCountItem.findUnique({
			where: {
				runId_skuId_variantKey_locationKey: {
					runId: session.runId,
					skuId: input.sku.id,
					variantKey,
					locationKey: itemLocationKey,
				},
			},
			include: { inventoryRecord: true },
		});

		let createdInventoryRecord = false;
		const locationWhere: Prisma.InventoryRecordWhereInput = {
			skuId: input.sku.id,
			variantId,
			floorId: session.floorId,
			shelfId: session.shelfId,
		};
		if (!item) {
			const locationRecords = await tx.inventoryRecord.findMany({
				where: locationWhere,
				orderBy: { createdAt: 'asc' },
			});
			let inventoryRecord = locationRecords.find((record: any) => (
				record.boxId === null && record.batchId === null && record.state === shelfReadyState
			)) ?? null;
			if (!inventoryRecord) {
				inventoryRecord = await tx.inventoryRecord.create({
					data: {
						skuId: input.sku.id,
						variantId,
						floorId: session.floorId,
						shelfId: session.shelfId,
						quantity: 0,
						state: shelfReadyState,
						terminalId: session.deviceId,
						userId: input.userId,
					},
				});
				createdInventoryRecord = true;
			}

			// A physical count replaces the existing quantity at this exact location.
			// Reset lazily, inside the same serializable transaction as the first count,
			// so users never need to zero the branch manually and a failed count cannot
			// leave a half-reset location.
			for (const existingRecord of locationRecords) {
				if (existingRecord.quantity === 0) continue;
				const resetRecord = await tx.inventoryRecord.update({
					where: { id: existingRecord.id },
					data: {
						quantity: 0,
						terminalId: session.deviceId,
						userId: input.userId,
						version: { increment: 1 },
					},
				});
				const resetEvent = await tx.inventoryEvent.create({
					data: {
						eventType: InventoryEventType.MANUAL_ADJUSTMENT,
						parentEntityId: existingRecord.id,
						quantityDelta: -existingRecord.quantity,
						beforeQuantity: existingRecord.quantity,
						afterQuantity: 0,
						reasonCode: 'STOCK_COUNT_BASELINE_RESET',
						userId: input.userId,
						terminalId: session.deviceId,
						metadata: {
							runId: session.runId,
							deviceSessionId: session.id,
							requestId: input.requestId,
						} as any,
					},
				});
				await enqueueLocalSyncOperation(tx as any, {
					opType: SYNC_V2_OPERATION_TYPES.INVENTORY_UPDATE,
					aggregateId: resetRecord.id,
					baseVersion: existingRecord.version,
					payload: { id: resetRecord.id, quantity: 0 },
				});
				await recordServerSyncChanges(tx as any, {
					aggregateId: resetRecord.id,
					changes: [
						{ tableName: 'inventory_records', rowId: resetRecord.id, action: 'upsert' },
						{ tableName: 'inventory_events', rowId: resetEvent.id, action: 'upsert' },
					],
				});
				if (inventoryRecord.id === resetRecord.id) inventoryRecord = resetRecord;
			}
			item = await tx.stockCountItem.create({
				data: {
					runId: session.runId,
					skuId: input.sku.id,
					variantId,
					variantKey,
					floorId: session.floorId,
					shelfId: session.shelfId,
					locationKey: itemLocationKey,
					inventoryRecordId: inventoryRecord.id,
				},
				include: { inventoryRecord: true },
			});
		}

		const currentLocationStock = await tx.inventoryRecord.aggregate({
			where: locationWhere,
			_sum: { quantity: true },
		});
		if ((currentLocationStock._sum.quantity ?? 0) !== item.quantity) {
			throw new StockCountError(409, 'Inventory changed outside this stock count; reload before continuing');
		}
		const existingLine = await tx.stockCountLine.findUnique({
			where: { deviceSessionId_itemId: { deviceSessionId: session.id, itemId: item.id } },
		});
		const deviceBefore = existingLine?.quantity ?? 0;
		const delta = input.quantity - deviceBefore;
		const totalAfter = item.quantity + delta;

		const updatedRecord = await tx.inventoryRecord.update({
			where: { id: item.inventoryRecordId },
			data: {
				quantity: totalAfter,
				terminalId: session.deviceId,
				userId: input.userId,
				version: { increment: 1 },
			},
		});
		await tx.stockCountItem.update({ where: { id: item.id }, data: { quantity: totalAfter } });
		const line = existingLine
			? await tx.stockCountLine.update({
				where: { id: existingLine.id },
				data: { quantity: input.quantity, lastBarcode: input.barcode, updatedById: input.userId },
			})
			: await tx.stockCountLine.create({
				data: {
					deviceSessionId: session.id,
					itemId: item.id,
					quantity: input.quantity,
					lastBarcode: input.barcode,
					updatedById: input.userId,
				},
			});
		const event = await tx.inventoryEvent.create({
			data: {
				eventType: InventoryEventType.MANUAL_ADJUSTMENT,
				parentEntityId: item.inventoryRecordId,
				quantityDelta: delta,
				beforeQuantity: item.quantity,
				afterQuantity: totalAfter,
				reasonCode: 'STOCK_COUNT',
				userId: input.userId,
				terminalId: session.deviceId,
				metadata: {
					runId: session.runId,
					deviceSessionId: session.id,
					requestId: input.requestId,
					barcode: input.barcode,
					deviceQuantity: input.quantity,
				} as any,
			},
		});
		await tx.stockCountSubmission.create({
			data: {
				requestId: input.requestId,
				deviceSessionId: session.id,
				itemId: item.id,
				lineId: line.id,
				skuId: input.sku.id,
				variantId,
				barcode: input.barcode,
				submittedQuantity: input.quantity,
				deviceBefore,
				deviceAfter: input.quantity,
				totalAfter,
				submittedById: input.userId,
			},
		});

		await enqueueLocalSyncOperation(tx as any, {
			opType: createdInventoryRecord
				? SYNC_V2_OPERATION_TYPES.INVENTORY_CREATE
				: SYNC_V2_OPERATION_TYPES.INVENTORY_UPDATE,
			aggregateId: updatedRecord.id,
			baseVersion: createdInventoryRecord ? 0 : item.inventoryRecord.version,
			payload: createdInventoryRecord
				? {
					id: updatedRecord.id,
					skuId: updatedRecord.skuId,
					variantId: updatedRecord.variantId,
					floorId: updatedRecord.floorId,
					shelfId: updatedRecord.shelfId,
					quantity: updatedRecord.quantity,
					state: updatedRecord.state,
					terminalId: updatedRecord.terminalId,
				}
				: { id: updatedRecord.id, quantity: updatedRecord.quantity },
		});
		await recordServerSyncChanges(tx as any, {
			aggregateId: updatedRecord.id,
			changes: [
				{ tableName: 'inventory_records', rowId: updatedRecord.id, action: 'upsert' },
				{ tableName: 'inventory_events', rowId: event.id, action: 'upsert' },
			],
		});

			return { deviceQuantity: input.quantity, totalCountedQuantity: totalAfter };
		});
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002') {
			const concurrentReplay = await replayedSubmission(input.requestId, input.deviceSessionId);
			if (concurrentReplay) return { replayed: true, data: concurrentReplay };
		}
		throw error;
	}

	queueDashboardStatsRefresh();
	return {
		replayed: false,
		data: {
			skuId: input.sku.id,
			variantId: input.variant?.id ?? null,
			name: input.sku.name,
			variantName: input.variant?.name ?? null,
			...result,
			vendors: uniqueVendors(input.sku),
		},
	};
}

// POST /api/stock-count/device-sessions/:deviceSessionId/scan
stockCountRouter.post(
	'/device-sessions/:deviceSessionId/scan',
	requireRole(...countingRoles),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const barcode = cleanText(req.body.barcode);
			const requestId = cleanText(req.body.requestId);
			const quantity = readQuantity(req.body.quantity);
			if (!barcode || !requestId || quantity === null) {
				throw new StockCountError(400, 'barcode, a non-negative quantity and requestId are required');
			}
			const barcodeRecord = await prisma.productBarcode.findUnique({
				where: { barcode },
				include: {
					sku: { include: skuVendorInclude },
					variant: true,
				},
			});
			if (!barcodeRecord || !barcodeRecord.sku.isActive || (barcodeRecord.variant && !barcodeRecord.variant.isActive)) {
				res.json({ success: true, found: false, barcode, action: 'SELECT_PRODUCT' });
				return;
			}
			const result = await applyCount({
				deviceSessionId: req.params.deviceSessionId,
				sku: barcodeRecord.sku,
				variant: barcodeRecord.variant,
				quantity,
				barcode,
				requestId,
				userId: req.user!.id,
			});
			res.json({ success: true, found: true, replayed: result.replayed, data: result.data });
		} catch (error) {
			sendRouteError(res, error, 'Failed to record the barcode stock count');
		}
	},
);

// POST /api/stock-count/device-sessions/:deviceSessionId/count
stockCountRouter.post(
	'/device-sessions/:deviceSessionId/count',
	requireRole(...countingRoles),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const skuId = cleanText(req.body.skuId);
			const variantId = cleanText(req.body.variantId) || null;
			const requestId = cleanText(req.body.requestId);
			const scannedBarcode = cleanText(req.body.scannedBarcode) || null;
			const quantity = readQuantity(req.body.quantity);
			if (!skuId || !requestId || quantity === null) {
				throw new StockCountError(400, 'skuId, a non-negative quantity and requestId are required');
			}
			const product = await resolveManualProduct(skuId, variantId);
			const result = await applyCount({
				deviceSessionId: req.params.deviceSessionId,
				...product,
				quantity,
				barcode: scannedBarcode,
				requestId,
				userId: req.user!.id,
			});
			res.json({ success: true, replayed: result.replayed, data: result.data });
		} catch (error) {
			sendRouteError(res, error, 'Failed to record the selected product stock count');
		}
	},
);

// GET /api/stock-count/device-sessions/:deviceSessionId/lines
stockCountRouter.get('/device-sessions/:deviceSessionId/lines', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const session = await prisma.stockCountDeviceSession.findUnique({ where: { id: req.params.deviceSessionId } });
		if (!session) throw new StockCountError(404, 'Phone stock-count session not found');
		const lines = await prisma.stockCountLine.findMany({
			where: { deviceSessionId: session.id },
			include: {
				item: {
					include: {
						sku: { include: skuVendorInclude },
						variant: true,
					},
				},
			},
			orderBy: { updatedAt: 'desc' },
		});
		res.json({
			success: true,
			data: lines.map((line: any) => ({
				lineId: line.id,
				skuId: line.item.skuId,
				variantId: line.item.variantId,
				name: line.item.sku.name,
				variantName: line.item.variant?.name ?? null,
				deviceQuantity: line.quantity,
				totalCountedQuantity: line.item.quantity,
				lastBarcode: line.lastBarcode,
				vendors: uniqueVendors(line.item.sku),
				updatedAt: line.updatedAt,
			})),
		});
	} catch (error) {
		sendRouteError(res, error, 'Failed to load the phone stock-count lines');
	}
});

// POST /api/stock-count/device-sessions/:deviceSessionId/complete
stockCountRouter.post(
	'/device-sessions/:deviceSessionId/complete',
	requireRole(...countingRoles),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const session = await prisma.stockCountDeviceSession.findUnique({ where: { id: req.params.deviceSessionId } });
			if (!session) throw new StockCountError(404, 'Phone stock-count session not found');
			if (session.status === 'COMPLETED') {
				res.json({ success: true, replayed: true, data: session });
				return;
			}
			const [totals, productCount] = await Promise.all([
				prisma.stockCountLine.aggregate({ where: { deviceSessionId: session.id }, _sum: { quantity: true } }),
				prisma.stockCountLine.count({ where: { deviceSessionId: session.id } }),
			]);
			const completed = await prisma.stockCountDeviceSession.update({
				where: { id: session.id },
				data: { status: 'COMPLETED', completedAt: new Date() },
			});
			res.json({
				success: true,
				data: { ...completed, productCount, deviceCountedQuantity: totals._sum.quantity ?? 0 },
			});
		} catch (error) {
			sendRouteError(res, error, 'Failed to complete the phone stock-count session');
		}
	},
);

export { stockCountRunRouter, stockCountRouter };
