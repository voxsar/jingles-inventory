import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@jingles/shared';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../middleware/auth', () => ({
	authenticate: (req: any, _res: any, next: () => void) => {
		req.user = { id: 'user-001', role: UserRole.Manager };
		next();
	},
	requireRole:
		() =>
		(_req: any, _res: any, next: () => void) =>
			next(),
}));

const { default: posTerminalRouter } = await import('../../routes/posTerminal');

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use('/api/pos-terminal', posTerminalRouter);
	return app;
}

function mockSaleTransaction() {
	const tx = {
		inventoryRecord: {
			findMany: vi.fn().mockResolvedValue([
				{ id: 'inv-001', skuId: 'sku-001', variantId: null, quantity: 10, version: 3, batch: null },
			]),
			update: vi.fn().mockResolvedValue({}),
		},
		inventoryEvent: {
			create: vi.fn().mockResolvedValue({ id: 'evt-001' }),
			update: vi.fn().mockResolvedValue({}),
		},
		posSale: {
			create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)),
		},
		posHeldSale: {
			delete: vi.fn().mockResolvedValue({}),
		},
		syncOperationLog: { create: vi.fn().mockResolvedValue({}) },
		syncServerSequence: { create: vi.fn().mockResolvedValue({ seq: 1 }) },
		syncServerChange: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
	};

	prismaMock.$transaction.mockImplementation((fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx));
	return tx;
}

describe('POS terminal routes', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	describe('shifts', () => {
		it('requires terminalId to look up the active shift', async () => {
			const res = await request(createTestApp()).get('/api/pos-terminal/shifts/active');
			expect(res.status).toBe(400);
		});

		it('opens a shift when none is open on the terminal', async () => {
			prismaMock.posShift.findFirst.mockResolvedValue(null);
			prismaMock.posShift.create.mockResolvedValue({ id: 'shift-001', status: 'OPEN', openingFloat: 5000 });

			const res = await request(createTestApp())
				.post('/api/pos-terminal/shifts')
				.send({ terminalId: 'till-1', openingFloat: 5000 });

			expect(res.status).toBe(201);
			expect(res.body.data.status).toBe('OPEN');
			expect(prismaMock.posShift.create).toHaveBeenCalled();
		});

		it('refuses to open a second shift on the same terminal', async () => {
			prismaMock.posShift.findFirst.mockResolvedValue({ id: 'shift-existing', status: 'OPEN' });

			const res = await request(createTestApp())
				.post('/api/pos-terminal/shifts')
				.send({ terminalId: 'till-1', openingFloat: 5000 });

			expect(res.status).toBe(409);
			expect(prismaMock.posShift.create).not.toHaveBeenCalled();
		});

		it('closes an open shift', async () => {
			prismaMock.posShift.findUnique.mockResolvedValue({ id: 'shift-001', status: 'OPEN', notes: null });
			prismaMock.posShift.update.mockResolvedValue({ id: 'shift-001', status: 'CLOSED' });

			const res = await request(createTestApp())
				.post('/api/pos-terminal/shifts/shift-001/close')
				.send({ closingFloat: 5200 });

			expect(res.status).toBe(200);
			expect(res.body.data.status).toBe('CLOSED');
		});
	});

	describe('held sales', () => {
		it('rejects a hold with no lines', async () => {
			const res = await request(createTestApp())
				.post('/api/pos-terminal/held-sales')
				.send({ terminalId: 'till-1', lines: [] });

			expect(res.status).toBe(400);
		});

		it('holds a sale with lines', async () => {
			prismaMock.posHeldSale.create.mockResolvedValue({ id: 'held-001', holdNumber: 'HOLD-1' });

			const res = await request(createTestApp())
				.post('/api/pos-terminal/held-sales')
				.send({ terminalId: 'till-1', total: 100, lines: [{ skuId: 'sku-001', qty: 1 }] });

			expect(res.status).toBe(201);
			expect(res.body.data.id).toBe('held-001');
		});
	});

	describe('sales', () => {
		it('rejects a sale with no lines', async () => {
			const res = await request(createTestApp())
				.post('/api/pos-terminal/sales')
				.send({ terminalId: 'till-1', lines: [] });

			expect(res.status).toBe(400);
		});

		it('finalizes a sale and deducts stock FIFO from ShelfReady records', async () => {
			const tx = mockSaleTransaction();

			const res = await request(createTestApp())
				.post('/api/pos-terminal/sales')
				.send({
					terminalId: 'till-1',
					branchId: 'branch-001',
					lines: [{ skuId: 'sku-001', qty: 3, unit: 'Piece', unitPrice: 100 }],
					payments: [{ type: 'Cash', amount: 300 }],
				});

			expect(res.status).toBe(201);
			expect(tx.inventoryRecord.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'inv-001' },
					data: expect.objectContaining({ quantity: 7 }),
				})
			);
			expect(tx.inventoryEvent.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ eventType: 'SALE_DEDUCTED', quantityDelta: -3 }),
				})
			);
			expect(res.body.data.total).toBe(300);
			expect(res.body.shortfalls).toEqual([]);
		});

		it('returns 409 with requiresOverride when stock is insufficient and no override is requested', async () => {
			const tx = mockSaleTransaction();
			tx.inventoryRecord.findMany.mockResolvedValue([
				{ id: 'inv-001', skuId: 'sku-001', variantId: null, quantity: 1, version: 1, batch: null },
			]);

			const res = await request(createTestApp())
				.post('/api/pos-terminal/sales')
				.send({
					terminalId: 'till-1',
					lines: [{ skuId: 'sku-001', qty: 3, unit: 'Piece', unitPrice: 100 }],
					payments: [{ type: 'Cash', amount: 300 }],
				});

			expect(res.status).toBe(409);
			expect(res.body.requiresOverride).toBe(true);
			expect(tx.posSale.create).not.toHaveBeenCalled();
		});
	});

	describe('paid in/out and drawer', () => {
		it('validates paid-in-out payload', async () => {
			const res = await request(createTestApp()).post('/api/pos-terminal/paid-in-out').send({});
			expect(res.status).toBe(400);
		});

		it('logs a paid-in as an audit entry', async () => {
			prismaMock.auditLog.create.mockResolvedValue({ id: 'log-001', action: 'POS_PAID_IN' });

			const res = await request(createTestApp())
				.post('/api/pos-terminal/paid-in-out')
				.send({ shiftId: 'shift-001', type: 'IN', amount: 500, reason: 'Change float top-up' });

			expect(res.status).toBe(201);
			expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
				expect.objectContaining({ data: expect.objectContaining({ action: 'POS_PAID_IN' }) })
			);
		});

		it('logs a drawer kick as a stub with a clear message', async () => {
			prismaMock.auditLog.create.mockResolvedValue({ id: 'log-002', action: 'POS_DRAWER_OPEN' });

			const res = await request(createTestApp())
				.post('/api/pos-terminal/drawer-kick')
				.send({ terminalId: 'till-1' });

			expect(res.status).toBe(200);
			expect(res.body.stub).toBe(true);
		});
	});
});
