import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@jingles/shared';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = {
      id: 'user-001',
      role: UserRole.Admin,
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));

const { default: inventoryRouter } = await import('../../routes/inventory');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRouter);
  return app;
}

describe('inventory routes', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('returns a single inventory record by id', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue({
      id: 'inv-001',
      quantity: 8,
      version: 5,
    } as any);

    const app = createTestApp();
    const res = await request(app).get('/api/inventory/inv-001');

    expect(res.status).toBe(200);
    expect(prismaMock.inventoryRecord.findUnique).toHaveBeenCalledWith({
      where: { id: 'inv-001' },
      include: expect.any(Object),
    });
    expect(res.body.data).toMatchObject({
      id: 'inv-001',
      quantity: 8,
      version: 5,
    });
  });

  it('returns 404 when the inventory record does not exist', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(null);

    const app = createTestApp();
    const res = await request(app).get('/api/inventory/missing-record');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: 'Inventory record not found',
    });
  });
});
