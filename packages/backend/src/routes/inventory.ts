import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole, InventoryState, InventoryEventType } from '@jingles/shared';
import { performTransition } from '../modules/inventory/stateMachine';
import { getEvents } from '../modules/inventory/eventLedger';
import { convert } from '../modules/conversion/unitConverter';
import { getStatusesByKeys, SpecialStatusKeys } from '../modules/statuses/statusLookup';
import { queueDashboardStatsRefresh } from '../modules/dashboard/dashboardService';
import {
	SYNC_V2_OPERATION_TYPES,
	enqueueLocalSyncOperation,
	recordServerSyncChanges,
	type SyncV2ChangeDescriptor,
} from '../sync/syncV2';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

function normalizeQuantityInput(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

const inventoryRecordDetailInclude = {
	sku: { include: { vendor: { select: { id: true, name: true } } } },
	variant: {
		include: {
			attributeValues: {
				include: { attribute: true, attributeValue: true },
			},
		},
	},
	floor: { include: { branch: { select: { id: true, name: true } } } },
	shelf: true,
	box: true,
	batch: { select: { id: true, batchNumber: true, costPrice: true, sellingPrice: true, expiryDate: true } },
	user: { select: { email: true } },
} satisfies Prisma.InventoryRecordInclude;

// GET /api/inventory
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const {
			state,
			skuId,
			vendorId,
			categoryId,
			branchId,
			floorId,
			rackId,
			shelfId,
			boxId,
			search,
			page = '1',
			pageSize = '50',
		} = req.query as Record<string, string>;
		const user = req.user!;
		const pageNum = parseInt(page);
		const pageSizeNum = parseInt(pageSize);

		const where: Prisma.InventoryRecordWhereInput = {};
		if (state) where.state = state as InventoryState;
		if (skuId) where.skuId = skuId;
		if (vendorId || categoryId || search) {
			const skuWhere: Prisma.SKUWhereInput = {};
			if (vendorId) skuWhere.vendorId = vendorId;
			if (categoryId) skuWhere.categoryId = categoryId;
			if (search) {
				skuWhere.OR = [
					{ skuCode: { contains: search, mode: 'insensitive' } },
					{ name: { contains: search, mode: 'insensitive' } },
					{ description: { contains: search, mode: 'insensitive' } },
				];
			}
			where.sku = skuWhere;
		}
		if (shelfId) {
			where.shelfId = shelfId;
		} else if (rackId) {
			where.shelf = { rackId };
		} else if (floorId) {
			where.floorId = floorId;
		} else if (branchId) {
			where.floor = { branchId };
		}
		if (boxId) where.boxId = boxId;
		if (search) {
			where.OR = [
				{ batch: { batchNumber: { contains: search, mode: 'insensitive' } } },
				{ box: { code: { contains: search, mode: 'insensitive' } } },
				{ shelf: { code: { contains: search, mode: 'insensitive' } } },
				{ floor: { name: { contains: search, mode: 'insensitive' } } },
			];
		}

		if (user.role === UserRole.Vendor) {
			const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
			if (dbUser?.vendorId) {
				where.sku = {
					...(where.sku as Prisma.SKUWhereInput | undefined),
					vendorId: dbUser.vendorId,
				} as Prisma.SKUWhereInput;
			}
		}

		const [items, total] = await Promise.all([
			prisma.inventoryRecord.findMany({
				where,
				skip: (pageNum - 1) * pageSizeNum,
				take: pageSizeNum,
				include: inventoryRecordDetailInclude,
				orderBy: { updatedAt: 'desc' },
			}),
			prisma.inventoryRecord.count({ where }),
		]);

		res.json({
			success: true,
			data: { items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum) },
		});
	} catch (error) {
		logger.error('Get inventory error', error);
		res.status(500).json({ success: false, error: 'Failed to fetch inventory' });
	}
});

// GET /api/inventory/events
router.get('/events', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { parentEntityId, eventType, fromDate, toDate, page = '1', pageSize = '50' } = req.query as Record<string, string>;
		const user = req.user!;

		const filters: any = {
			page: parseInt(page),
			pageSize: parseInt(pageSize),
		};
		if (parentEntityId) filters.parentEntityId = parentEntityId;
		if (eventType) filters.eventType = eventType as InventoryEventType;
		if (fromDate) filters.fromDate = new Date(fromDate);
		if (toDate) filters.toDate = new Date(toDate);

		if (user.role === UserRole.Staff) filters.userId = user.id;

		const result = await getEvents(filters);
		res.json({ success: true, data: result });
	} catch (error) {
		logger.error('Get events error', error);
		res.status(500).json({ success: false, error: 'Failed to fetch events' });
	}
});

// GET /api/inventory/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { id } = req.params as { id: string };

		const record = await prisma.inventoryRecord.findUnique({
			where: { id },
			include: inventoryRecordDetailInclude,
		});

		if (!record) {
			res.status(404).json({ success: false, error: 'Inventory record not found' });
			return;
		}

		res.json({ success: true, data: record });
	} catch (error) {
		logger.error('Get inventory record error', error);
		res.status(500).json({ success: false, error: 'Failed to fetch inventory record' });
	}
});

// POST /api/inventory
router.post(
	'/',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const { skuId, variantId, floorId, shelfId, boxId, quantity, state, batchId, terminalId } = req.body as {
				skuId: string;
				variantId?: string;
				floorId?: string;
				shelfId?: string;
				boxId?: string;
				quantity: number | string;
				state?: string;
				batchId?: string;
				terminalId?: string;
			};
			const user = req.user!;
			const normalizedQuantity = normalizeQuantityInput(quantity);

			if (!skuId || normalizedQuantity === undefined) {
				res.status(400).json({ success: false, error: 'skuId and quantity are required' });
				return;
			}
			if (normalizedQuantity <= 0) {
				res.status(400).json({ success: false, error: 'quantity must be greater than 0' });
				return;
			}

			const statusMap = await getStatusesByKeys([SpecialStatusKeys.INVENTORY_UNINSPECTED]);
			const defaultUninspectedState = statusMap.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)!;

			const record = await prisma.$transaction(async (tx: any) => {
				const createdRecord = await tx.inventoryRecord.create({
					data: {
						skuId,
						variantId: variantId ?? null,
						floorId,
						shelfId,
						boxId,
						quantity: normalizedQuantity,
						state: state ?? defaultUninspectedState,
						batchId,
						terminalId,
						userId: user.id,
						version: 1,
					},
					include: {
						sku: true,
						variant: {
							include: {
								attributeValues: {
									include: { attribute: true, attributeValue: true },
								},
							},
						},
						floor: true,
						shelf: true,
						box: true,
					},
				});

				const createdEvent = await tx.inventoryEvent.create({
					data: {
						eventType: InventoryEventType.MANUAL_ADJUSTMENT,
						parentEntityId: createdRecord.id,
						quantityDelta: normalizedQuantity,
						beforeQuantity: 0,
						afterQuantity: normalizedQuantity,
						userId: user.id,
						terminalId,
						overrideFlag: false,
					},
				});

				await enqueueLocalSyncOperation(tx, {
					opType: SYNC_V2_OPERATION_TYPES.INVENTORY_CREATE,
					aggregateId: createdRecord.id,
					baseVersion: 0,
					payload: {
						id: createdRecord.id,
						skuId,
						variantId: variantId ?? null,
						floorId: floorId ?? null,
						shelfId: shelfId ?? null,
						boxId: boxId ?? null,
						quantity: normalizedQuantity,
						state: state ?? defaultUninspectedState,
						batchId: batchId ?? null,
						terminalId: terminalId ?? null,
					},
				});

				await recordServerSyncChanges(tx, {
					aggregateId: createdRecord.id,
					changes: [
						{ tableName: 'inventory_records', rowId: createdRecord.id, action: 'upsert' },
						{ tableName: 'inventory_events', rowId: createdEvent.id, action: 'upsert' },
					],
				});

				return createdRecord;
			});

			// Queue dashboard stats refresh in background
			queueDashboardStatsRefresh();

			res.status(201).json({ success: true, data: record });
		} catch (error) {
			logger.error('Create inventory error', error);
			res.status(500).json({ success: false, error: 'Failed to create inventory record' });
		}
	}
);

// POST /api/inventory/box-open
router.post(
	'/box-open',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const { inventoryRecordId, quantityToOpen, targetFloorId } = req.body as {
				inventoryRecordId: string;
				quantityToOpen: number | string;
				targetFloorId?: string;
			};
			const user = req.user!;
			const normalizedQuantityToOpen = normalizeQuantityInput(quantityToOpen);

			if (!inventoryRecordId || normalizedQuantityToOpen === undefined) {
				res.status(400).json({ success: false, error: 'inventoryRecordId and quantityToOpen are required' });
				return;
			}
			if (normalizedQuantityToOpen <= 0) {
				res.status(400).json({ success: false, error: 'quantityToOpen must be greater than 0' });
				return;
			}

			const boxRecord = await prisma.inventoryRecord.findUnique({
				where: { id: inventoryRecordId },
				include: { sku: true },
			});

			if (!boxRecord) {
				res.status(404).json({ success: false, error: 'Inventory record not found' });
				return;
			}

			const statusMap = await getStatusesByKeys([
				SpecialStatusKeys.INVENTORY_UNOPENED_BOX,
				SpecialStatusKeys.INVENTORY_SHELF_READY,
				SpecialStatusKeys.INVENTORY_UNINSPECTED,
			]);
			const unopenedBoxState = statusMap.get(SpecialStatusKeys.INVENTORY_UNOPENED_BOX)!;
			const shelfReadyState = statusMap.get(SpecialStatusKeys.INVENTORY_SHELF_READY)!;
			const uninspectedState = statusMap.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)!;

			if (boxRecord.state !== unopenedBoxState && boxRecord.state !== shelfReadyState) {
				res.status(400).json({ success: false, error: 'Record must be in UnopenedBox or ShelfReady state' });
				return;
			}
			if (boxRecord.quantity < normalizedQuantityToOpen) {
				res.status(400).json({ success: false, error: 'Insufficient quantity' });
				return;
			}

			const conversionRules = boxRecord.sku.conversionRules as any[];
			let piecesPerBox = 12;
			try {
				piecesPerBox = await convert(1, boxRecord.sku.unitOfMeasure, 'Piece', conversionRules);
			} catch {
				// use default
			}

			const totalPieces = normalizedQuantityToOpen * piecesPerBox;

			const { updatedBox, pieceRecord } = await prisma.$transaction(async (tx: any) => {
				const updated = await tx.inventoryRecord.update({
					where: { id: inventoryRecordId },
					data: {
						quantity: boxRecord.quantity - normalizedQuantityToOpen,
						version: { increment: 1 },
						updatedAt: new Date(),
					},
				});
				const createdPieceRecord = await tx.inventoryRecord.create({
					data: {
						skuId: boxRecord.skuId,
						batchId: boxRecord.batchId,
						floorId: targetFloorId ?? boxRecord.floorId,
						quantity: totalPieces,
						state: uninspectedState,
						userId: user.id,
						version: 1,
					},
				});
				const createdEvent = await tx.inventoryEvent.create({
					data: {
						eventType: InventoryEventType.BOX_OPENED,
						parentEntityId: inventoryRecordId,
						quantityDelta: -normalizedQuantityToOpen,
						beforeQuantity: boxRecord.quantity,
						afterQuantity: boxRecord.quantity - normalizedQuantityToOpen,
						userId: user.id,
						overrideFlag: false,
						metadata: {
							boxesOpened: normalizedQuantityToOpen,
							piecesCreated: totalPieces,
							newRecordId: createdPieceRecord.id,
						},
					},
				});

				await enqueueLocalSyncOperation(tx, {
					opType: SYNC_V2_OPERATION_TYPES.INVENTORY_BOX_OPEN,
					aggregateId: inventoryRecordId,
					baseVersion: boxRecord.version,
					payload: {
						inventoryRecordId,
						quantityToOpen: normalizedQuantityToOpen,
						targetFloorId: targetFloorId ?? null,
						expectedState: boxRecord.state,
					},
				});

				await recordServerSyncChanges(tx, {
					aggregateId: inventoryRecordId,
					changes: [
						{ tableName: 'inventory_records', rowId: updated.id, action: 'upsert' },
						{ tableName: 'inventory_records', rowId: createdPieceRecord.id, action: 'upsert' },
						{ tableName: 'inventory_events', rowId: createdEvent.id, action: 'upsert' },
					],
				});

				return {
					updatedBox: updated,
					pieceRecord: createdPieceRecord,
				};
			});

			// Queue dashboard stats refresh in background
			queueDashboardStatsRefresh();

			res.json({ success: true, data: { boxRecord: updatedBox, pieceRecord, piecesCreated: totalPieces } });
		} catch (error) {
			logger.error('Box open error', error);
			res.status(500).json({ success: false, error: 'Failed to open box' });
		}
	}
);

// PUT /api/inventory/:id
router.put(
	'/:id',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const { id } = req.params as { id: string };
			const { floorId, shelfId, boxId, quantity, batchId } = req.body as {
				floorId?: string | null;
				shelfId?: string | null;
				boxId?: string | null;
				quantity?: number | string;
				batchId?: string | null;
			};
			const user = req.user!;

			const existing = await prisma.inventoryRecord.findUnique({ where: { id } });
			if (!existing) {
				res.status(404).json({ success: false, error: 'Inventory record not found' });
				return;
			}

			const updateData: any = { version: { increment: 1 }, updatedAt: new Date() };
			if (floorId !== undefined) updateData.floorId = floorId || null;
			if (shelfId !== undefined) updateData.shelfId = shelfId || null;
			if (boxId !== undefined) updateData.boxId = boxId || null;
			if (quantity !== undefined) {
				const normalizedQuantity = normalizeQuantityInput(quantity);
				if (normalizedQuantity === undefined) {
					res.status(400).json({ success: false, error: 'quantity must be a valid number' });
					return;
				}
				if (normalizedQuantity <= 0) {
					res.status(400).json({ success: false, error: 'quantity must be greater than 0' });
					return;
				}
				updateData.quantity = normalizedQuantity;
			}
			if (batchId !== undefined) updateData.batchId = batchId || null;

			const normalizedQuantity = quantity !== undefined ? normalizeQuantityInput(quantity) : undefined;
			const record = await prisma.$transaction(async (tx: any) => {
				const updatedRecord = await tx.inventoryRecord.update({
					where: { id },
					data: updateData,
					include: { sku: true, floor: true, shelf: true, box: true },
				});

				let adjustmentEventId: string | null = null;
				if (normalizedQuantity !== undefined && normalizedQuantity !== existing.quantity) {
					const adjustmentEvent = await tx.inventoryEvent.create({
						data: {
							eventType: InventoryEventType.MANUAL_ADJUSTMENT,
							parentEntityId: id,
							quantityDelta: normalizedQuantity - existing.quantity,
							beforeQuantity: existing.quantity,
							afterQuantity: normalizedQuantity,
							userId: user.id,
							overrideFlag: false,
						},
					});
					adjustmentEventId = adjustmentEvent.id;
				}

				const payload: Record<string, unknown> = { id };
				if (floorId !== undefined) payload.floorId = floorId || null;
				if (shelfId !== undefined) payload.shelfId = shelfId || null;
				if (boxId !== undefined) payload.boxId = boxId || null;
				if (normalizedQuantity !== undefined) payload.quantity = normalizedQuantity;
				if (batchId !== undefined) payload.batchId = batchId || null;

				await enqueueLocalSyncOperation(tx, {
					opType: SYNC_V2_OPERATION_TYPES.INVENTORY_UPDATE,
					aggregateId: id,
					baseVersion: existing.version,
					payload,
				});

				const changes: SyncV2ChangeDescriptor[] = [
					{ tableName: 'inventory_records' as const, rowId: id, action: 'upsert' as const },
				];
				if (adjustmentEventId) {
					changes.push({
						tableName: 'inventory_events' as const,
						rowId: adjustmentEventId,
						action: 'upsert' as const,
					});
				}
				await recordServerSyncChanges(tx, {
					aggregateId: id,
					changes,
				});

				return updatedRecord;
			});

			// Queue dashboard stats refresh in background
			queueDashboardStatsRefresh();

			res.json({ success: true, data: record });
		} catch (error) {
			logger.error('Update inventory error', error);
			res.status(500).json({ success: false, error: 'Failed to update inventory record' });
		}
	}
);

// POST /api/inventory/:id/transition
router.post('/:id/transition', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { id } = req.params as { id: string };
		const { toState, reason } = req.body as { toState: string; reason?: string };
		const user = req.user!;

		if (!toState) {
			res.status(400).json({ success: false, error: 'toState is required' });
			return;
		}

		const result = await performTransition(id, toState as InventoryState, user.id, user.role as UserRole, reason);

		if (!result.success) {
			res.status(400).json({ success: false, error: result.error });
			return;
		}

		res.json({ success: true, data: result.record, requiresOverride: result.requiresOverride });
	} catch (error) {
		logger.error('Transition error', error);
		res.status(500).json({ success: false, error: 'Failed to perform state transition' });
	}
});

export default router;
