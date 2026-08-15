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
  requireRole:
    () =>
    (_req: any, _res: any, next: () => void) =>
      next(),
}));
vi.mock('../../modules/typesense/client', () => ({
  testTypesenseConnection: vi.fn(),
}));
vi.mock('../../modules/typesense/syncService', () => ({
  startSyncJob: vi.fn(),
}));
vi.mock('../../modules/typesense/jobTracker', () => ({
  getJob: vi.fn(),
  getAllJobs: vi.fn().mockReturnValue([]),
}));

const { default: settingsRouter } = await import('../../routes/settings');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRouter);
  return app;
}

function mockSettingsTransaction(sequence = 91) {
  const tx = {
    statusOption: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    syncServerSequence: {
      create: vi.fn().mockResolvedValue({ seq: sequence }),
    },
    syncServerChange: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  };

  prismaMock.$transaction.mockImplementation((fn: (innerTx: typeof tx) => Promise<unknown>) =>
    fn(tx)
  );

  return tx;
}

describe('settings routes sync coverage', () => {
  const statusId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    resetPrismaMocks();
  });

  it('records sync metadata when creating a status option', async () => {
    prismaMock.statusOption.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const tx = mockSettingsTransaction(91);
    tx.statusOption.create.mockResolvedValue({
      id: statusId,
      entityType: 'inventory',
      value: 'ShelfReady',
      label: 'Shelf Ready',
      specialKey: 'INVENTORY_SHELF_READY',
    });
    tx.statusOption.findUnique.mockResolvedValue({
      id: statusId,
      entityType: 'inventory',
      value: 'ShelfReady',
      label: 'Shelf Ready',
      specialKey: 'INVENTORY_SHELF_READY',
      serverSeq: 91,
      deletedAt: null,
    });

    const app = createTestApp();
    const res = await request(app).post('/api/settings/statuses').send({
      entityType: 'inventory',
      value: 'ShelfReady',
      label: 'Shelf Ready',
      specialKey: 'INVENTORY_SHELF_READY',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: statusId,
      serverSeq: 91,
      deletedAt: null,
    });
    expect(tx.syncServerSequence.create).toHaveBeenCalledWith({
      data: {
        operationId: null,
        aggregateType: 'status_option',
        aggregateId: statusId,
      },
    });
    expect(tx.syncServerChange.createMany).toHaveBeenCalledWith({
      data: [
        {
          seq: 91,
          tableName: 'status_options',
          rowId: statusId,
          action: 'upsert',
        },
      ],
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "status_options" SET "server_seq" = ?, "deleted_at" = ?'),
      91,
      null,
      statusId
    );
  });

  it('soft-deletes a status option and records a delete sync change', async () => {
    prismaMock.statusOption.findUnique.mockResolvedValue({
      id: statusId,
      entityType: 'inventory',
      value: 'Damaged',
      label: 'Damaged',
      specialKey: 'INVENTORY_DAMAGED',
      isActive: true,
    });

    const tx = mockSettingsTransaction(92);
    tx.statusOption.update.mockResolvedValue({
      id: statusId,
      deletedAt: new Date('2026-05-19T08:00:00.000Z'),
      isActive: false,
    });

    const app = createTestApp();
    const res = await request(app).delete(`/api/settings/statuses/${statusId}`);

    expect(res.status).toBe(200);
    expect(tx.statusOption.update).toHaveBeenCalledWith({
      where: { id: statusId },
      data: {
        isActive: false,
        deletedAt: expect.any(Date),
      },
    });
    expect(tx.syncServerChange.createMany).toHaveBeenCalledWith({
      data: [
        {
          seq: 92,
          tableName: 'status_options',
          rowId: statusId,
          action: 'delete',
        },
      ],
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "status_options" SET "server_seq" = ?, "deleted_at" = ?'),
      92,
      expect.any(Date),
      statusId
    );
  });

  it('returns the default commission settings when no config value exists', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    const app = createTestApp();
    const res = await request(app).get('/api/settings/commission');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      defaultRatePercent: 2,
      commissionBasis: 'after_discounts',
    });
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
  });

  it('saves commission settings', async () => {
    const app = createTestApp();
    const res = await request(app).put('/api/settings/commission').send({
      defaultRatePercent: 3.5,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      defaultRatePercent: 3.5,
      commissionBasis: 'after_discounts',
    });
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
