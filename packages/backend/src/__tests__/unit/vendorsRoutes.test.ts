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
vi.mock('../../utils/localSearch', () => ({
  searchVendorIdsFts: vi.fn().mockResolvedValue(null),
}));

const { default: vendorsRouter } = await import('../../routes/vendors');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vendors', vendorsRouter);
  return app;
}

describe('vendor duplicate routes', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('returns likely duplicate supplier groups', async () => {
    const targetId = '11111111-1111-4111-8111-111111111111';
    const sourceId = '22222222-2222-4222-8222-222222222222';

    prismaMock.vendor.findMany.mockResolvedValue([
      {
        id: targetId,
        name: 'Acme Trading Ltd',
        contactEmail: 'sales@acme.example',
        contactPhone: '+94 77 123 4567',
        address: '12 Harbor Road, Colombo',
        type: 'Supplier',
        website: 'https://acme.example',
        taxId: 'TX-100',
        notes: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        isActive: true,
        _count: {
          users: 1,
          skus: 5,
          grns: 3,
          prns: 1,
          skuVendors: 7,
          batches: 4,
        },
      },
      {
        id: sourceId,
        name: 'Acme Trading Limited',
        contactEmail: 'sales@acme.example',
        contactPhone: '0771234567',
        address: '12 Harbor Rd Colombo',
        type: 'Supplier',
        website: 'http://www.acme.example',
        taxId: 'TX100',
        notes: null,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        isActive: true,
        _count: {
          users: 0,
          skus: 1,
          grns: 0,
          prns: 0,
          skuVendors: 1,
          batches: 1,
        },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'North Star Foods',
        contactEmail: 'hello@northstar.example',
        contactPhone: '+94 11 555 0000',
        address: '55 Market Street, Kandy',
        type: 'Supplier',
        website: 'https://northstar.example',
        taxId: 'NS-55',
        notes: null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        isActive: true,
        _count: {
          users: 0,
          skus: 0,
          grns: 0,
          prns: 0,
          skuVendors: 0,
          batches: 0,
        },
      },
    ] as any);

    const app = createTestApp();
    const res = await request(app).get('/api/vendors/duplicates');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.vendor.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      take: 600,
      include: {
        _count: {
          select: {
            users: true,
            skus: true,
            grns: true,
            prns: true,
            skuVendors: true,
            batches: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].target.id).toBe(targetId);
    expect(res.body.data.items[0].items[0].vendor.id).toBe(sourceId);
    expect(res.body.data.items[0].items[0].matchedSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'email', value: 'sales@acme.example' }),
      expect.objectContaining({ key: 'taxId' }),
    ]));
  });

  it('merges a duplicate supplier and reassigns related records', async () => {
    const targetId = '11111111-1111-4111-8111-111111111111';
    const sourceId = '22222222-2222-4222-8222-222222222222';
    const tx = {
      vendor: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: targetId }),
        delete: vi.fn().mockResolvedValue({ id: sourceId }),
      },
      sKU: {
        findMany: vi.fn().mockResolvedValue([{ id: 'sku-a' }, { id: 'sku-b' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      sKUVendor: {
        findMany: vi.fn().mockResolvedValue([{ skuId: 'sku-a' }, { skuId: 'sku-c' }]),
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      gRN: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      pRN: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      batch: {
        updateMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
    };

    tx.vendor.findUnique
      .mockResolvedValueOnce({
        id: targetId,
        name: 'Acme Trading Ltd',
        contactEmail: 'sales@acme.example',
        contactPhone: null,
        address: null,
        type: 'Vendor',
        website: 'https://acme.example',
        taxId: null,
        paymentTerms: null,
        notes: 'Preferred supplier',
        isActive: true,
        _count: {
          users: 1,
          skus: 5,
          grns: 3,
          prns: 1,
          skuVendors: 7,
          batches: 4,
        },
      })
      .mockResolvedValueOnce({
        id: sourceId,
        name: 'Acme Supplier',
        contactEmail: 'sales@acme.example',
        contactPhone: '+94 77 123 4567',
        address: '12 Harbor Road, Colombo',
        type: 'Supplier',
        website: 'https://alt.acme.example',
        taxId: 'TX-100',
        paymentTerms: 'Net 30',
        notes: 'Secondary contact',
        isActive: true,
        _count: {
          users: 1,
          skus: 2,
          grns: 2,
          prns: 1,
          skuVendors: 2,
          batches: 4,
        },
      });

    prismaMock.$transaction.mockImplementation(async (fn: (innerTx: typeof tx) => Promise<unknown>) => fn(tx));

    const app = createTestApp();
    const res = await request(app).post(`/api/vendors/${targetId}/duplicates/${sourceId}/merge`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(tx.sKUVendor.createMany).toHaveBeenCalledWith({
      data: [
        { skuId: 'sku-a', vendorId: targetId },
        { skuId: 'sku-b', vendorId: targetId },
        { skuId: 'sku-c', vendorId: targetId },
      ],
      skipDuplicates: true,
    });
    expect(tx.vendor.update).toHaveBeenCalledWith({
      where: { id: targetId },
      data: expect.objectContaining({
        contactPhone: '+94 77 123 4567',
        address: '12 Harbor Road, Colombo',
        taxId: 'TX-100',
        paymentTerms: 'Net 30',
        type: 'Both',
        isActive: true,
        notes: expect.stringContaining('Merged from Acme Supplier'),
      }),
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { vendorId: sourceId }, data: { vendorId: targetId } });
    expect(tx.sKU.updateMany).toHaveBeenCalledWith({ where: { vendorId: sourceId }, data: { vendorId: targetId } });
    expect(tx.gRN.updateMany).toHaveBeenCalledWith({ where: { supplierId: sourceId }, data: { supplierId: targetId } });
    expect(tx.pRN.updateMany).toHaveBeenCalledWith({ where: { supplierId: sourceId }, data: { supplierId: targetId } });
    expect(tx.batch.updateMany).toHaveBeenCalledWith({ where: { vendorId: sourceId }, data: { vendorId: targetId } });
    expect(tx.sKUVendor.deleteMany).toHaveBeenCalledWith({ where: { vendorId: sourceId } });
    expect(tx.vendor.delete).toHaveBeenCalledWith({ where: { id: sourceId } });
    expect(res.body.data).toMatchObject({
      mergedVendorName: 'Acme Supplier',
      movedUsers: 1,
      movedPrimaryProducts: 2,
      movedProductLinks: 2,
      movedGrns: 2,
      movedPrns: 1,
      movedBatches: 4,
    });
    expect(res.body.data.updatedFields).toEqual(expect.arrayContaining([
      'contactPhone',
      'address',
      'type',
      'taxId',
      'paymentTerms',
      'notes',
    ]));
  });
});
