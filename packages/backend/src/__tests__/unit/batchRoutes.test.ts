import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../mocks/prismaMock';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('express-rate-limit', () => ({
	default: () => (_req: any, _res: any, next: any) => next(),
}));

const { default: app } = await import('../../server');
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-for-unit-tests';

function makeToken(role = 'Admin') {
	return jwt.sign({ id: 'user-001', email: 'admin@test.com', role }, JWT_SECRET, { expiresIn: '1h' });
}

beforeEach(() => {
	resetPrismaMocks();
});

describe('GET /api/batches', () => {
	it('does not apply isActive filter when query param is omitted', async () => {
		(prismaMock.batch.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(prismaMock.batch.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

		const res = await request(app)
			.get('/api/batches')
			.set('Authorization', `Bearer ${makeToken()}`);

		expect(res.status).toBe(200);
		expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {},
			})
		);
	});

	it('applies isActive filter when query param is provided', async () => {
		(prismaMock.batch.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(prismaMock.batch.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

		const res = await request(app)
			.get('/api/batches?isActive=true')
			.set('Authorization', `Bearer ${makeToken()}`);

		expect(res.status).toBe(200);
		expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ isActive: true }),
			})
		);
	});
});
