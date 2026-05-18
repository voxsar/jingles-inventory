import { Router, Response } from 'express';
import { REPLICA_TABLES } from '@jingles/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';
import logger from '../utils/logger';

interface SyncOperation {
	operation: string;
	payload: Record<string, unknown>;
}

const router = Router();

router.use(authenticate);

router.get('/replica/export', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot: Record<string, unknown[]> = {};

    for (const tableName of REPLICA_TABLES) {
      const rows = (await prisma.$queryRawUnsafe(`SELECT * FROM "${tableName}"`)) as Array<Record<string, unknown>>;
      snapshot[tableName] =
        tableName === 'users'
          ? rows.map((row) =>
              row.id === req.user?.id
                ? row
                : {
                    ...row,
                    password_hash: '',
                  }
            )
          : rows;
    }

    res.json({
      success: true,
      data: snapshot,
      meta: {
        exportedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Replica export error', error);
    res.status(500).json({ success: false, error: 'Replica export failed' });
  }
});

function normalizeQuantityInput(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function readStringField(payload: Record<string, unknown>, camelCaseKey: string, snakeCaseKey: string) {
	const directValue = payload[camelCaseKey];
	if (typeof directValue === 'string' && directValue.trim()) {
		return directValue.trim();
	}

	const snakeValue = payload[snakeCaseKey];
	if (typeof snakeValue === 'string' && snakeValue.trim()) {
		return snakeValue.trim();
	}

	return undefined;
}

function readDateField(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readVersionField(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(1, Math.trunc(value));
	}

	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? Math.max(1, parsed) : undefined;
	}

	return undefined;
}

router.post('/push', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { clientId, operations } = req.body as { clientId: string; operations: SyncOperation[] };

		if (!clientId || !Array.isArray(operations)) {
			res.status(400).json({ success: false, error: 'clientId and operations array are required' });
			return;
		}

		const results = [];

		for (const op of operations) {
			const entry = await prisma.syncQueue.create({
				data: {
					clientId,
					operation: op.operation,
					payload: op.payload as any,
					status: 'Pending',
				},
			});
			results.push(entry);
		}

		const processed = [];
		for (const entry of results) {
			try {
				let conflictFlag = false;
				let conflictNotes: string | undefined;

				if (entry.operation === 'UPSERT_INVENTORY') {
					const payload = entry.payload as Record<string, unknown>;
					const recordId = readStringField(payload, 'id', 'id');
					const existing = recordId
						? await prisma.inventoryRecord.findUnique({ where: { id: recordId } })
						: null;
					const normalizedQuantity = normalizeQuantityInput(payload.quantity);
					const normalizedVersion = readVersionField(payload.version);
					const normalizedSkuId = readStringField(payload, 'skuId', 'sku_id');
					const normalizedVariantId = readStringField(payload, 'variantId', 'variant_id') ?? null;
					const normalizedBatchId = readStringField(payload, 'batchId', 'batch_id') ?? null;
					const normalizedFloorId = readStringField(payload, 'floorId', 'floor_id') ?? null;
					const normalizedShelfId = readStringField(payload, 'shelfId', 'shelf_id') ?? null;
					const normalizedBoxId = readStringField(payload, 'boxId', 'box_id') ?? null;
					const normalizedTerminalId = readStringField(payload, 'terminalId', 'terminal_id') ?? null;
					const normalizedUserId =
						readStringField(payload, 'userId', 'user_id') ?? req.user?.id ?? null;
					const normalizedState = readStringField(payload, 'state', 'state');
					const normalizedCreatedAt = readDateField(payload.createdAt ?? payload.created_at);
					const normalizedUpdatedAt = readDateField(payload.updatedAt ?? payload.updated_at);

					if (!recordId || !normalizedSkuId || normalizedQuantity === undefined || !normalizedState) {
						throw new Error('Inventory sync payload requires id, skuId, quantity, and state');
					}

					if (existing && existing.version > (normalizedVersion ?? 0)) {
						conflictFlag = true;
						conflictNotes = `Server version ${existing.version} is newer than client version ${normalizedVersion}`;
					} else if (existing) {
						await prisma.inventoryRecord.update({
							where: { id: recordId },
							data: {
								quantity: normalizedQuantity ?? existing.quantity,
								state: normalizedState,
								skuId: normalizedSkuId,
								variantId: normalizedVariantId,
								batchId: normalizedBatchId,
								floorId: normalizedFloorId,
								shelfId: normalizedShelfId,
								boxId: normalizedBoxId,
								terminalId: normalizedTerminalId,
								userId: normalizedUserId ?? existing.userId,
								updatedAt: normalizedUpdatedAt ?? new Date(),
								version: { increment: 1 },
							},
						});
					} else {
						await prisma.inventoryRecord.create({
							data: {
								id: recordId,
								skuId: normalizedSkuId,
								variantId: normalizedVariantId,
								batchId: normalizedBatchId,
								floorId: normalizedFloorId,
								shelfId: normalizedShelfId,
								boxId: normalizedBoxId,
								quantity: normalizedQuantity,
								state: normalizedState,
								terminalId: normalizedTerminalId,
								userId: normalizedUserId,
								version: normalizedVersion ?? 1,
								createdAt: normalizedCreatedAt ?? new Date(),
								updatedAt: normalizedUpdatedAt ?? new Date(),
							},
						});
					}
				}

				await prisma.syncQueue.update({
					where: { id: entry.id },
					data: {
						status: conflictFlag ? 'Conflict' : 'Processed',
						processedAt: new Date(),
						conflictFlag,
						conflictNotes,
					},
				});

				processed.push({ id: entry.id, status: conflictFlag ? 'Conflict' : 'Processed', conflictNotes });
			} catch (err: any) {
				await prisma.syncQueue.update({
					where: { id: entry.id },
					data: { status: 'Failed' },
				});
				processed.push({ id: entry.id, status: 'Failed', error: err.message });
			}
		}

		res.json({ success: true, data: { processed } });
	} catch (error) {
		logger.error('Sync push error', error);
		res.status(500).json({ success: false, error: 'Sync push failed' });
	}
});

router.get('/pull', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { clientId, since } = req.query as { clientId?: string; since?: string };

		if (!clientId) {
			res.status(400).json({ success: false, error: 'clientId is required' });
			return;
		}

		const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

		const [inventoryRecords, inventoryEvents, skus, grns] = await Promise.all([
			prisma.inventoryRecord.findMany({
				where: { updatedAt: { gte: sinceDate } },
				include: { sku: true },
				take: 500,
			}),
			prisma.inventoryEvent.findMany({
				where: { timestamp: { gte: sinceDate } },
				take: 500,
				orderBy: { timestamp: 'asc' },
			}),
			prisma.sKU.findMany({
				where: { updatedAt: { gte: sinceDate } },
				take: 500,
			}),
			prisma.gRN.findMany({
				where: { updatedAt: { gte: sinceDate } },
				include: { lines: true },
				take: 100,
			}),
		]);

		const conflicts = await prisma.syncQueue.findMany({
			where: { clientId, conflictFlag: true, status: 'Conflict' },
		});

		res.json({
			success: true,
			data: { inventoryRecords, inventoryEvents, skus, grns, conflicts, since: sinceDate },
		});
	} catch (error) {
		logger.error('Sync pull error', error);
		res.status(500).json({ success: false, error: 'Sync pull failed' });
	}
});

export default router;
