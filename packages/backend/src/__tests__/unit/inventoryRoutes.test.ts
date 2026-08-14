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
vi.mock('../../modules/dashboard/dashboardService', () => ({ queueDashboardStatsRefresh: vi.fn() }));
vi.mock('../../sync/syncV2', () => ({
  SYNC_V2_OPERATION_TYPES: { INVENTORY_CREATE: 'inventory.create', INVENTORY_UPDATE: 'inventory.update' },
  enqueueLocalSyncOperation: vi.fn(),
  recordServerSyncChanges: vi.fn(),
}));

const { default: inventoryRouter } = await import('../../routes/inventory');
const { enqueueLocalSyncOperation, recordServerSyncChanges } = await import('../../sync/syncV2');

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

describe('POST /api/inventory/:id/adjust', () => {
  const baseRecord = {
    id: 'inv-001',
    skuId: 'sku-001',
    variantId: null,
    floorId: 'floor-001',
    shelfId: null,
    boxId: null,
    batchId: null,
    quantity: 10,
    version: 3,
  };

  beforeEach(() => {
    resetPrismaMocks();
    vi.mocked(enqueueLocalSyncOperation).mockClear();
    vi.mocked(recordServerSyncChanges).mockClear();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
  });

  it('applies a stock-down adjustment and records the reason and note', async () => {
    prismaMock.inventoryEvent.findUnique.mockResolvedValue(null);
    prismaMock.inventoryRecord.findUnique
      .mockResolvedValueOnce(baseRecord as any)
      .mockResolvedValueOnce({ ...baseRecord, quantity: 7, version: 4 } as any);
    prismaMock.inventoryRecord.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.inventoryEvent.create.mockImplementation(async ({ data }: any) => ({
      id: 'event-001',
      timestamp: new Date('2026-08-14T10:00:00.000Z'),
      ...data,
    }));

    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: -3, reasonCode: 'Damaged', note: 'Crushed in transit', requestId: 'req-001' });

    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(false);
    expect(res.body.adjustment).toMatchObject({
      quantityDelta: -3,
      beforeQuantity: 10,
      afterQuantity: 7,
      reasonCode: 'Damaged',
      note: 'Crushed in transit',
    });

    // Optimistic lock guards the write with the version that was read.
    expect(prismaMock.inventoryRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-001', version: 3 },
        data: expect.objectContaining({ quantity: 7, version: { increment: 1 } }),
      }),
    );
    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'req-001',
          eventType: 'MANUAL_ADJUSTMENT',
          parentEntityId: 'inv-001',
          reasonCode: 'Damaged',
        }),
      }),
    );
    expect(enqueueLocalSyncOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ aggregateId: 'inv-001', baseVersion: 3, payload: { id: 'inv-001', quantity: 7 } }),
    );
    expect(recordServerSyncChanges).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.arrayContaining([
          { tableName: 'inventory_records', rowId: 'inv-001', action: 'upsert' },
          // requestId becomes the event id, so it is the row that syncs.
          { tableName: 'inventory_events', rowId: 'req-001', action: 'upsert' },
        ]),
      }),
    );
  });

  it('allows writing a record down to exactly zero', async () => {
    prismaMock.inventoryRecord.findUnique
      .mockResolvedValueOnce(baseRecord as any)
      .mockResolvedValueOnce({ ...baseRecord, quantity: 0, version: 4 } as any);
    prismaMock.inventoryRecord.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.inventoryEvent.create.mockImplementation(async ({ data }: any) => ({ id: 'event-002', ...data }));

    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: -10, reasonCode: 'LostOrStolen' });

    expect(res.status).toBe(200);
    expect(res.body.adjustment).toMatchObject({ afterQuantity: 0 });
  });

  it('rejects removing more than the record holds', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(baseRecord as any);

    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: -25, reasonCode: 'StockCountCorrection' });

    expect(res.status).toBe(409);
    expect(prismaMock.inventoryRecord.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.inventoryEvent.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown reason code before touching the record', async () => {
    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: 5, reasonCode: 'ShrinkageMaybe' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('reasonCode must be one of');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a zero delta', async () => {
    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: 0, reasonCode: 'FoundStock' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('quantityDelta must be a non-zero number');
  });

  it('requires a note when the reason is Other', async () => {
    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: 2, reasonCode: 'Other', note: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('note is required when reasonCode is Other');
  });

  it('replays a repeated requestId instead of adjusting twice', async () => {
    prismaMock.inventoryEvent.findUnique.mockResolvedValue({
      id: 'req-001',
      eventType: 'MANUAL_ADJUSTMENT',
      parentEntityId: 'inv-001',
      quantityDelta: -3,
      beforeQuantity: 10,
      afterQuantity: 7,
      reasonCode: 'Damaged',
      metadata: { note: 'Crushed in transit' },
    } as any);
    prismaMock.inventoryRecord.findUnique.mockResolvedValue({ ...baseRecord, quantity: 7 } as any);

    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: -3, reasonCode: 'Damaged', requestId: 'req-001' });

    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);
    expect(res.body.adjustment).toMatchObject({ afterQuantity: 7 });
    expect(prismaMock.inventoryRecord.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.inventoryEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a requestId already used by a different inventory action', async () => {
    prismaMock.inventoryEvent.findUnique.mockResolvedValue({
      id: 'req-001',
      eventType: 'GRN_CREATED',
      parentEntityId: 'grn-001',
    } as any);

    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: 1, reasonCode: 'FoundStock', requestId: 'req-001' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('requestId was already used by another inventory action');
  });

  it('returns 409 when the record changed while adjusting', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(baseRecord as any);
    prismaMock.inventoryRecord.updateMany.mockResolvedValue({ count: 0 } as any);

    const res = await request(createTestApp())
      .post('/api/inventory/inv-001/adjust')
      .send({ quantityDelta: 4, reasonCode: 'FoundStock' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('changed while adjusting');
    expect(prismaMock.inventoryEvent.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the record does not exist', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(null);

    const res = await request(createTestApp())
      .post('/api/inventory/missing/adjust')
      .send({ quantityDelta: 1, reasonCode: 'FoundStock' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Inventory record not found');
  });
});
