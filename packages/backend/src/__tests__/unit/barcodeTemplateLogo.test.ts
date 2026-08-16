import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@jingles/shared';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../middleware/auth', () => ({
	authenticate: (req: any, _res: any, next: () => void) => {
		req.user = { id: 'user-001', role: UserRole.Admin };
		next();
	},
	requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));

const { default: barcodeRouter } = await import('../../routes/barcode');

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use('/api/barcode', barcodeRouter);
	return app;
}

describe('barcode print template logo field', () => {
	beforeEach(() => {
		resetPrismaMocks();
		prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
	});

	it('carries showLogo through create and defaults it false when omitted', async () => {
		const app = createTestApp();
		prismaMock.barcodePrintTemplate.create.mockResolvedValue({ id: 'tpl-1', name: 'With logo', showLogo: true, logoUrl: null });

		const res = await request(app)
			.post('/api/barcode/templates')
			.send({ name: 'With logo', showLogo: true });

		expect(res.status).toBe(201);
		expect(prismaMock.barcodePrintTemplate.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ showLogo: true }) }),
		);

		prismaMock.barcodePrintTemplate.create.mockResolvedValue({ id: 'tpl-2', name: 'No logo field sent', showLogo: false, logoUrl: null });
		const resDefault = await request(app)
			.post('/api/barcode/templates')
			.send({ name: 'No logo field sent' });

		expect(resDefault.status).toBe(201);
		expect(prismaMock.barcodePrintTemplate.create).toHaveBeenLastCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ showLogo: false }) }),
		);
	});

	it('carries showLogo through update, but leaves logoUrl untouched (set only via the upload endpoint)', async () => {
		const app = createTestApp();
		prismaMock.barcodePrintTemplate.update.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', name: 'Updated', showLogo: false });

		const res = await request(app)
			.put('/api/barcode/templates/11111111-1111-4111-8111-111111111111')
			.send({ name: 'Updated', showLogo: false, logoUrl: 'https://attacker.example/x.png' });

		expect(res.status).toBe(200);
		const call = prismaMock.barcodePrintTemplate.update.mock.calls[0][0];
		expect(call.data.showLogo).toBe(false);
		expect(call.data.logoUrl).toBeUndefined();
	});
});
