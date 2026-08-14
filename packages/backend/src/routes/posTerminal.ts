import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import prisma from '../prisma/client';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { UserRole, InventoryEventType } from '@jingles/shared';
import { getStatusesByKeys, SpecialStatusKeys } from '../modules/statuses/statusLookup';
import { queueDashboardStatsRefresh } from '../modules/dashboard/dashboardService';
import {
	SYNC_V2_OPERATION_TYPES,
	enqueueLocalSyncOperation,
	recordServerSyncChanges,
} from '../sync/syncV2';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff));

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

interface SaleLineInput {
	skuId: string;
	variantId?: string | null;
	qty: number;
	unit: string;
	unitPrice: number;
	lineDiscount?: number;
}

interface PaymentInput {
	type: string;
	amount: number;
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function receiptNumber(prefix: string) {
	const stamp = new Date();
	const y = stamp.getFullYear();
	const m = String(stamp.getMonth() + 1).padStart(2, '0');
	const d = String(stamp.getDate()).padStart(2, '0');
	return `${prefix}-${y}${m}${d}-${stamp.getTime().toString(36).toUpperCase()}`;
}

/**
 * Deduct `qty` (already expressed in the SKU's canonical unit) from ShelfReady
 * inventory records for a SKU/variant, oldest batch first. Writes a
 * SALE_DEDUCTED InventoryEvent per touched record. If stock runs out and
 * `allowOversell` is true, the shortfall is logged as an override event with
 * no backing record (there is nothing physical left to decrement).
 *
 * Must be called inside an open prisma.$transaction (`tx`).
 */
async function deductStockForSale(
	tx: any,
	params: {
		skuId: string;
		variantId?: string | null;
		branchId?: string | null;
		qty: number;
		userId: string;
		terminalId?: string;
		allowOversell: boolean;
	}
): Promise<{ touchedRecordIds: string[]; eventIds: string[]; shortfall: number }> {
	const shelfReadyState = await getStatusesByKeys([SpecialStatusKeys.INVENTORY_SHELF_READY]).then(
		(m) => m.get(SpecialStatusKeys.INVENTORY_SHELF_READY)!
	);

	const candidates = await tx.inventoryRecord.findMany({
		where: {
			skuId: params.skuId,
			variantId: params.variantId ?? null,
			state: shelfReadyState,
			quantity: { gt: 0 },
			...(params.branchId ? { floor: { branchId: params.branchId } } : {}),
		},
		include: { batch: { select: { expiryDate: true, manufacturingDate: true } } },
		orderBy: [{ batch: { expiryDate: 'asc' } }, { createdAt: 'asc' }],
	});

	let remaining = params.qty;
	const touchedRecordIds: string[] = [];
	const eventIds: string[] = [];

	for (const record of candidates) {
		if (remaining <= 0) break;
		const take = Math.min(record.quantity, remaining);
		const beforeQuantity = record.quantity;
		const afterQuantity = record.quantity - take;

		await tx.inventoryRecord.update({
			where: { id: record.id },
			data: { quantity: afterQuantity, version: { increment: 1 }, updatedAt: new Date() },
		});

		const event = await tx.inventoryEvent.create({
			data: {
				eventType: InventoryEventType.SALE_DEDUCTED,
				parentEntityId: record.id,
				quantityDelta: -take,
				beforeQuantity,
				afterQuantity,
				userId: params.userId,
				terminalId: params.terminalId,
				overrideFlag: false,
			},
		});

		await enqueueLocalSyncOperation(tx, {
			opType: SYNC_V2_OPERATION_TYPES.INVENTORY_UPDATE,
			aggregateId: record.id,
			baseVersion: record.version,
			payload: { inventoryRecordId: record.id, quantity: afterQuantity },
		});

		touchedRecordIds.push(record.id);
		eventIds.push(event.id);
		remaining -= take;
	}

	if (remaining > 0) {
		if (!params.allowOversell) {
			throw Object.assign(new Error('INSUFFICIENT_STOCK'), { skuId: params.skuId, shortfall: remaining });
		}

		const event = await tx.inventoryEvent.create({
			data: {
				eventType: InventoryEventType.SALE_DEDUCTED,
				parentEntityId: null,
				quantityDelta: -remaining,
				beforeQuantity: null,
				afterQuantity: null,
				userId: params.userId,
				terminalId: params.terminalId,
				overrideFlag: true,
				metadata: { skuId: params.skuId, variantId: params.variantId ?? null, oversold: true },
			},
		});
		eventIds.push(event.id);
	}

	return { touchedRecordIds, eventIds, shortfall: Math.max(0, remaining) };
}

// -----------------------------------------------------------------------------
// Shifts
// -----------------------------------------------------------------------------

router.get('/shifts/active', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const terminalId = typeof req.query.terminalId === 'string' ? req.query.terminalId : undefined;
		if (!terminalId) {
			res.status(400).json({ success: false, error: 'terminalId is required' });
			return;
		}
		const shift = await prisma.posShift.findFirst({
			where: { terminalId, status: 'OPEN' },
			orderBy: { openedAt: 'desc' },
		});
		res.json({ success: true, data: shift });
	} catch (error) {
		logger.error('Failed to load active POS shift', error);
		res.status(500).json({ success: false, error: 'Failed to load active shift' });
	}
});

router.post('/shifts', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { terminalId, branchId, openingFloat, openingDeclaration, notes } = req.body as {
			terminalId?: string;
			branchId?: string | null;
			openingFloat?: number | string;
			openingDeclaration?: unknown;
			notes?: string;
		};
		const user = req.user!;
		const normalizedFloat = toFiniteNumber(openingFloat) ?? 0;

		if (!terminalId) {
			res.status(400).json({ success: false, error: 'terminalId is required' });
			return;
		}

		const existing = await prisma.posShift.findFirst({ where: { terminalId, status: 'OPEN' } });
		if (existing) {
			res.status(409).json({ success: false, error: 'A shift is already open on this terminal', data: existing });
			return;
		}

		const shift = await prisma.posShift.create({
			data: {
				id: randomUUID(),
				terminalId,
				branchId: branchId ?? null,
				userId: user.id,
				status: 'OPEN',
				openingFloat: normalizedFloat,
				openingDeclaration: (openingDeclaration ?? null) as any,
				notes,
			},
		});

		res.status(201).json({ success: true, data: shift });
	} catch (error) {
		logger.error('Failed to open POS shift', error);
		res.status(500).json({ success: false, error: 'Failed to open shift' });
	}
});

router.post('/shifts/:id/close', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { id } = req.params;
		const { closingFloat, closingDeclaration, notes } = req.body as {
			closingFloat?: number | string;
			closingDeclaration?: unknown;
			notes?: string;
		};

		const shift = await prisma.posShift.findUnique({ where: { id } });
		if (!shift) {
			res.status(404).json({ success: false, error: 'Shift not found' });
			return;
		}
		if (shift.status !== 'OPEN') {
			res.status(400).json({ success: false, error: 'Shift is not open' });
			return;
		}

		const updated = await prisma.posShift.update({
			where: { id },
			data: {
				status: 'CLOSED',
				closingFloat: toFiniteNumber(closingFloat) ?? null,
				closingDeclaration: (closingDeclaration ?? null) as any,
				notes: notes ?? shift.notes,
				closedAt: new Date(),
			},
		});

		res.json({ success: true, data: updated });
	} catch (error) {
		logger.error('Failed to close POS shift', error);
		res.status(500).json({ success: false, error: 'Failed to close shift' });
	}
});

// -----------------------------------------------------------------------------
// Held sales
// -----------------------------------------------------------------------------

router.get('/held-sales', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const terminalId = typeof req.query.terminalId === 'string' ? req.query.terminalId : undefined;
		const held = await prisma.posHeldSale.findMany({
			where: { status: 'HELD', ...(terminalId ? { terminalId } : {}) },
			orderBy: { createdAt: 'desc' },
		});
		res.json({ success: true, data: held });
	} catch (error) {
		logger.error('Failed to list held sales', error);
		res.status(500).json({ success: false, error: 'Failed to list held sales' });
	}
});

router.post('/held-sales', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { terminalId, branchId, customerId, customerName, subtotal, discountTotal, total, notes, lines } =
			req.body as {
				terminalId?: string;
				branchId?: string | null;
				customerId?: string | null;
				customerName?: string | null;
				subtotal?: number | string;
				discountTotal?: number | string;
				total?: number | string;
				notes?: string;
				lines?: unknown[];
			};
		const user = req.user!;

		if (!terminalId || !Array.isArray(lines) || lines.length === 0) {
			res.status(400).json({ success: false, error: 'terminalId and at least one line are required' });
			return;
		}

		const held = await prisma.posHeldSale.create({
			data: {
				id: randomUUID(),
				holdNumber: receiptNumber('HOLD'),
				terminalId,
				branchId: branchId ?? null,
				cashierId: user.id,
				customerId: customerId ?? null,
				customerName: customerName ?? null,
				status: 'HELD',
				subtotal: toFiniteNumber(subtotal) ?? 0,
				discountTotal: toFiniteNumber(discountTotal) ?? 0,
				total: toFiniteNumber(total) ?? 0,
				notes,
				lines: lines as any,
			},
		});

		res.status(201).json({ success: true, data: held });
	} catch (error) {
		logger.error('Failed to hold sale', error);
		res.status(500).json({ success: false, error: 'Failed to hold sale' });
	}
});

router.delete('/held-sales/:id', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { id } = req.params;
		await prisma.posHeldSale.delete({ where: { id } }).catch(() => null);
		res.json({ success: true });
	} catch (error) {
		logger.error('Failed to remove held sale', error);
		res.status(500).json({ success: false, error: 'Failed to remove held sale' });
	}
});

// -----------------------------------------------------------------------------
// Sales
// -----------------------------------------------------------------------------

router.get('/sales/:id', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const sale = await prisma.posSale.findUnique({ where: { id: req.params.id } });
		if (!sale) {
			res.status(404).json({ success: false, error: 'Sale not found' });
			return;
		}
		res.json({ success: true, data: sale });
	} catch (error) {
		logger.error('Failed to load POS sale', error);
		res.status(500).json({ success: false, error: 'Failed to load sale' });
	}
});

router.post('/sales', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const user = req.user!;
		const body = req.body as {
			terminalId?: string;
			branchId?: string | null;
			shiftId?: string | null;
			heldSaleId?: string | null;
			customerId?: string | null;
			customerName?: string | null;
			salesmanId?: string | null;
			isCredit?: boolean;
			lines?: SaleLineInput[];
			discountTotal?: number | string;
			taxTotal?: number | string;
			payments?: PaymentInput[];
			allowOversell?: boolean;
		};

		if (!body.terminalId) {
			res.status(400).json({ success: false, error: 'terminalId is required' });
			return;
		}
		if (!Array.isArray(body.lines) || body.lines.length === 0) {
			res.status(400).json({ success: false, error: 'At least one sale line is required' });
			return;
		}
		for (const line of body.lines) {
			if (!line.skuId || !toFiniteNumber(line.qty) || toFiniteNumber(line.qty)! <= 0) {
				res.status(400).json({ success: false, error: 'Every line needs a skuId and a positive qty' });
				return;
			}
		}

		const discountTotal = toFiniteNumber(body.discountTotal) ?? 0;
		const taxTotal = toFiniteNumber(body.taxTotal) ?? 0;
		const lineTotals = body.lines.map((line) => {
			const qty = toFiniteNumber(line.qty) ?? 0;
			const unitPrice = toFiniteNumber(line.unitPrice) ?? 0;
			const lineDiscount = toFiniteNumber(line.lineDiscount) ?? 0;
			return qty * unitPrice - lineDiscount;
		});
		const subtotal = lineTotals.reduce((sum, v) => sum + v, 0);
		const total = Math.max(0, subtotal - discountTotal + taxTotal);

		const allowOversell = Boolean(body.allowOversell) && [UserRole.Admin, UserRole.Manager].includes(user.role as UserRole);

		let shortfalls: Array<{ skuId: string; shortfall: number }> = [];

		const sale = await prisma.$transaction(async (tx: any) => {
			const touchedRecordIds: string[] = [];
			const touchedEventIds: string[] = [];

			for (const line of body.lines!) {
				const result = await deductStockForSale(tx, {
					skuId: line.skuId,
					variantId: line.variantId ?? null,
					branchId: body.branchId ?? null,
					qty: toFiniteNumber(line.qty) ?? 0,
					userId: user.id,
					terminalId: body.terminalId,
					allowOversell,
				});
				touchedRecordIds.push(...result.touchedRecordIds);
				touchedEventIds.push(...result.eventIds);
				if (result.shortfall > 0) shortfalls.push({ skuId: line.skuId, shortfall: result.shortfall });
			}

			const saleId = randomUUID();
			const created = await tx.posSale.create({
				data: {
					id: saleId,
					receiptNumber: receiptNumber('POS'),
					terminalId: body.terminalId,
					branchId: body.branchId ?? null,
					userId: user.id,
					customerId: body.customerId ?? null,
					shiftId: body.shiftId ?? null,
					heldSaleId: body.heldSaleId ?? null,
					status: 'COMPLETED',
					subtotal,
					discountTotal,
					taxTotal,
					total,
					marginTotal: 0,
					lines: body.lines as any,
					payments: (body.payments ?? []) as any,
					synced: true,
				},
			});

			if (body.heldSaleId) {
				await tx.posHeldSale.delete({ where: { id: body.heldSaleId } }).catch(() => null);
			}

			if (touchedRecordIds.length || touchedEventIds.length) {
				await recordServerSyncChanges(tx, {
					aggregateId: saleId,
					changes: [
						...touchedRecordIds.map((rowId: string) => ({ tableName: 'inventory_records' as const, rowId, action: 'upsert' as const })),
						...touchedEventIds.map((rowId: string) => ({ tableName: 'inventory_events' as const, rowId, action: 'upsert' as const })),
					],
				});
			}

			return created;
		});

		queueDashboardStatsRefresh();

		res.status(201).json({ success: true, data: sale, shortfalls });
	} catch (error: any) {
		if (error?.message === 'INSUFFICIENT_STOCK') {
			res.status(409).json({
				success: false,
				error: `Insufficient stock for SKU ${error.skuId} (short by ${error.shortfall}). Retry with a manager override to oversell.`,
				requiresOverride: true,
				skuId: error.skuId,
				shortfall: error.shortfall,
			});
			return;
		}
		logger.error('Failed to finalize POS sale', error);
		res.status(500).json({ success: false, error: 'Failed to finalize sale' });
	}
});

router.post('/sales/:id/return', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const user = req.user!;
		const { id } = req.params;
		const { lines, reason, terminalId, floorId } = req.body as {
			lines?: Array<{ skuId: string; variantId?: string | null; qty: number; unitPrice: number }>;
			reason?: string;
			terminalId?: string;
			floorId?: string;
		};

		const originalSale = await prisma.posSale.findUnique({ where: { id } });
		if (!originalSale) {
			res.status(404).json({ success: false, error: 'Original sale not found' });
			return;
		}
		if (!Array.isArray(lines) || lines.length === 0) {
			res.status(400).json({ success: false, error: 'At least one return line is required' });
			return;
		}

		const returnedState = await getStatusesByKeys([SpecialStatusKeys.INVENTORY_RETURNED]).then((m) =>
			m.get(SpecialStatusKeys.INVENTORY_RETURNED)!
		);

		const totalRefund = lines.reduce((sum, line) => sum + (toFiniteNumber(line.qty) ?? 0) * (toFiniteNumber(line.unitPrice) ?? 0), 0);

		const created = await prisma.$transaction(async (tx: any) => {
			for (const line of lines) {
				const qty = toFiniteNumber(line.qty) ?? 0;
				if (qty <= 0) continue;

				const record = await tx.inventoryRecord.create({
					data: {
						skuId: line.skuId,
						variantId: line.variantId ?? null,
						floorId: floorId ?? undefined,
						quantity: qty,
						state: returnedState,
						userId: user.id,
						terminalId: terminalId ?? originalSale.terminalId,
						version: 1,
					},
				});

				await tx.inventoryEvent.create({
					data: {
						eventType: InventoryEventType.RETURN_RECEIVED,
						parentEntityId: record.id,
						quantityDelta: qty,
						beforeQuantity: 0,
						afterQuantity: qty,
						userId: user.id,
						terminalId: terminalId ?? originalSale.terminalId,
						reasonCode: reason,
						overrideFlag: false,
						metadata: { saleId: id },
					},
				});
			}

			return tx.posReturn.create({
				data: {
					id: randomUUID(),
					saleId: id,
					userId: user.id,
					terminalId: terminalId ?? originalSale.terminalId,
					reason,
					totalRefund,
					lines: lines as any,
				},
			});
		});

		queueDashboardStatsRefresh();

		res.status(201).json({ success: true, data: created });
	} catch (error) {
		logger.error('Failed to process POS return', error);
		res.status(500).json({ success: false, error: 'Failed to process return' });
	}
});

// -----------------------------------------------------------------------------
// Paid in / out and drawer (audit-logged stubs — see plan notes: no ledger
// table or hardware SDK exists yet, these are traceable placeholders)
// -----------------------------------------------------------------------------

router.post('/paid-in-out', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const user = req.user!;
		const { shiftId, type, amount, reason } = req.body as {
			shiftId?: string;
			type?: 'IN' | 'OUT';
			amount?: number | string;
			reason?: string;
		};

		const normalizedAmount = toFiniteNumber(amount);
		if (!shiftId || (type !== 'IN' && type !== 'OUT') || !normalizedAmount || normalizedAmount <= 0) {
			res.status(400).json({ success: false, error: 'shiftId, type (IN/OUT) and a positive amount are required' });
			return;
		}

		const log = await prisma.auditLog.create({
			data: {
				userId: user.id,
				action: type === 'IN' ? 'POS_PAID_IN' : 'POS_PAID_OUT',
				entityType: 'PosShift',
				entityId: shiftId,
				changes: { amount: normalizedAmount, reason: reason ?? null },
			},
		});

		res.status(201).json({ success: true, data: log });
	} catch (error) {
		logger.error('Failed to record paid in/out', error);
		res.status(500).json({ success: false, error: 'Failed to record paid in/out' });
	}
});

router.post('/drawer-kick', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const user = req.user!;
		const { terminalId, shiftId } = req.body as { terminalId?: string; shiftId?: string };

		if (!terminalId) {
			res.status(400).json({ success: false, error: 'terminalId is required' });
			return;
		}

		await prisma.auditLog.create({
			data: {
				userId: user.id,
				action: 'POS_DRAWER_OPEN',
				entityType: 'Terminal',
				entityId: terminalId,
				changes: { shiftId: shiftId ?? null },
			},
		});

		res.json({
			success: true,
			stub: true,
			message: 'Drawer-open recorded. No cash-drawer hardware is wired up yet — this only logs the action.',
		});
	} catch (error) {
		logger.error('Failed to record drawer kick', error);
		res.status(500).json({ success: false, error: 'Failed to open drawer' });
	}
});

// -----------------------------------------------------------------------------
// Shift report (End key — X/Z style summary)
// -----------------------------------------------------------------------------

router.get('/reports/shift-summary', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const shiftId = typeof req.query.shiftId === 'string' ? req.query.shiftId : undefined;
		if (!shiftId) {
			res.status(400).json({ success: false, error: 'shiftId is required' });
			return;
		}

		const shift = await prisma.posShift.findUnique({ where: { id: shiftId } });
		if (!shift) {
			res.status(404).json({ success: false, error: 'Shift not found' });
			return;
		}

		const sales = await prisma.posSale.findMany({ where: { shiftId } });
		const returns = await prisma.posReturn.findMany({ where: { saleId: { in: sales.map((s) => s.id) } } });
		const paidInOut = await prisma.auditLog.findMany({
			where: { entityType: 'PosShift', entityId: shiftId, action: { in: ['POS_PAID_IN', 'POS_PAID_OUT'] } },
			orderBy: { timestamp: 'asc' },
		});

		const tenderTotals: Record<string, number> = {};
		for (const sale of sales) {
			const payments = Array.isArray(sale.payments) ? (sale.payments as any[]) : [];
			for (const payment of payments) {
				const key = String(payment?.type ?? 'Unknown');
				tenderTotals[key] = (tenderTotals[key] ?? 0) + (toFiniteNumber(payment?.amount) ?? 0);
			}
		}

		const totalRefunds = returns.reduce((sum, r) => sum + r.totalRefund, 0);
		const paidIn = paidInOut
			.filter((l) => l.action === 'POS_PAID_IN')
			.reduce((sum, l) => sum + (toFiniteNumber((l.changes as any)?.amount) ?? 0), 0);
		const paidOut = paidInOut
			.filter((l) => l.action === 'POS_PAID_OUT')
			.reduce((sum, l) => sum + (toFiniteNumber((l.changes as any)?.amount) ?? 0), 0);

		res.json({
			success: true,
			data: {
				shift,
				saleCount: sales.length,
				subtotal: sales.reduce((sum, s) => sum + s.subtotal, 0),
				discountTotal: sales.reduce((sum, s) => sum + s.discountTotal, 0),
				taxTotal: sales.reduce((sum, s) => sum + s.taxTotal, 0),
				total: sales.reduce((sum, s) => sum + s.total, 0),
				tenderTotals,
				returnCount: returns.length,
				totalRefunds,
				paidIn,
				paidOut,
				expectedCash: shift.openingFloat + (tenderTotals['Cash'] ?? 0) + paidIn - paidOut - totalRefunds,
			},
		});
	} catch (error) {
		logger.error('Failed to build POS shift report', error);
		res.status(500).json({ success: false, error: 'Failed to build shift report' });
	}
});

export default router;
