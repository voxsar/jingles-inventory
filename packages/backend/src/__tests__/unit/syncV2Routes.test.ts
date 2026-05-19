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
}));

const { default: syncRouter } = await import('../../routes/sync');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sync', syncRouter);
  return app;
}

describe('sync v2 routes', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('returns delta log entries and emits deletes when rows no longer exist', async () => {
    prismaMock.syncServerChange.findMany.mockResolvedValue([
      {
        id: 'chg-001',
        seq: 10,
        tableName: 'inventory_records',
        rowId: 'inv-001',
        action: 'upsert',
        createdAt: new Date('2026-05-18T12:10:00.000Z'),
      },
      {
        id: 'chg-002',
        seq: 11,
        tableName: 'inventory_events',
        rowId: 'evt-001',
        action: 'upsert',
        createdAt: new Date('2026-05-18T12:11:00.000Z'),
      },
      {
        id: 'chg-003',
        seq: 12,
        tableName: 'inventory_records',
        rowId: 'inv-deleted',
        action: 'upsert',
        createdAt: new Date('2026-05-18T12:12:00.000Z'),
      },
    ]);
    prismaMock.inventoryRecord.findUnique
      .mockResolvedValueOnce({ id: 'inv-001', quantity: 8, version: 4 } as any)
      .mockResolvedValueOnce(null);
    prismaMock.inventoryEvent.findUnique.mockResolvedValueOnce({
      id: 'evt-001',
      eventType: 'STATE_CHANGE',
      parentEntityId: 'inv-001',
    } as any);

    const app = createTestApp();
    const res = await request(app)
      .get('/api/sync/log')
      .query({ sinceSeq: 9, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.lastServerSeq).toBe(12);
    expect(res.body.data.hasMore).toBe(false);
    expect(res.body.data.changes).toEqual([
      {
        seq: 10,
        table: 'inventory_records',
        action: 'upsert',
        row: { id: 'inv-001', quantity: 8, version: 4 },
        emittedAt: '2026-05-18T12:10:00.000Z',
      },
      {
        seq: 11,
        table: 'inventory_events',
        action: 'upsert',
        row: {
          id: 'evt-001',
          eventType: 'STATE_CHANGE',
          parentEntityId: 'inv-001',
        },
        emittedAt: '2026-05-18T12:11:00.000Z',
      },
      {
        seq: 12,
        table: 'inventory_records',
        action: 'delete',
        row: { id: 'inv-deleted' },
        emittedAt: '2026-05-18T12:12:00.000Z',
      },
    ]);
  });

  it('filters pending conflicts by client id', async () => {
    prismaMock.syncConflict.findMany.mockResolvedValue([
      {
        id: 'conf-001',
        operationId: 'op-001',
        clientId: 'desktop-001',
        aggregateType: 'inventory_record',
        aggregateId: 'inv-001',
        status: 'Pending',
        createdAt: new Date('2026-05-18T12:00:00.000Z'),
      },
    ]);

    const app = createTestApp();
    const res = await request(app)
      .get('/api/sync/conflicts')
      .query({ clientId: 'desktop-001' });

    expect(res.status).toBe(200);
    expect(prismaMock.syncConflict.findMany).toHaveBeenCalledWith({
      where: {
        clientId: 'desktop-001',
        status: 'Pending',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'conf-001',
      operationId: 'op-001',
      clientId: 'desktop-001',
    });
  });
});
