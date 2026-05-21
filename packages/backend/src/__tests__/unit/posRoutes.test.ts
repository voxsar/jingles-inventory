import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensurePosCloudSchema = vi.fn();
const getPosCatalogSnapshot = vi.fn();
const posSyncHandshake = vi.fn();
const posSyncPlayback = vi.fn();
const posSyncConfirm = vi.fn();

vi.mock('../../services/posCloud', () => ({
  ensurePosCloudSchema,
  getPosCatalogSnapshot,
  posSyncHandshake,
  posSyncPlayback,
  posSyncConfirm,
}));

const { default: posRouter } = await import('../../routes/pos');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/pos', posRouter);
  return app;
}

describe('pos cloud routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensurePosCloudSchema.mockResolvedValue(undefined);
  });

  it('returns the shared POS catalog snapshot', async () => {
    getPosCatalogSnapshot.mockResolvedValue({
      generatedAt: '2026-05-21T12:00:00.000Z',
      categories: [{ id: 'cat-1', name: 'Cosmetics', icon: 'CO', sortOrder: 1 }],
      products: [{ id: 'sku-1', sku: 'SKU-1', name: 'Lipstick', categoryId: 'cat-1', subcategory: '', packSize: 1, unitLabel: 'pcs', stockOnHand: 12, priceTiers: [] }],
    });

    const app = createTestApp();
    const res = await request(app).get('/api/pos/catalog/snapshot');

    expect(res.status).toBe(200);
    expect(ensurePosCloudSchema).toHaveBeenCalled();
    expect(getPosCatalogSnapshot).toHaveBeenCalled();
    expect(res.body.products[0]).toMatchObject({
      id: 'sku-1',
      sku: 'SKU-1',
      name: 'Lipstick',
    });
  });

  it('wraps sync confirmation with the server vector clock payload', async () => {
    posSyncConfirm.mockResolvedValue({
      'device-term-03': 4,
      'server:api': 7,
    });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/pos/sync/confirm')
      .send({
        deviceId: 'device-term-03',
        terminalId: 'TERM-03',
        vectorClock: { 'device-term-03': 4 },
      });

    expect(res.status).toBe(200);
    expect(posSyncConfirm).toHaveBeenCalledWith({
      deviceId: 'device-term-03',
      terminalId: 'TERM-03',
      vectorClock: { 'device-term-03': 4 },
    });
    expect(res.body).toEqual({
      serverVectorClock: {
        'device-term-03': 4,
        'server:api': 7,
      },
    });
  });
});
