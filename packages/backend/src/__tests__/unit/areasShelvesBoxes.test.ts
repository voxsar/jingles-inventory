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

beforeEach(() => { resetPrismaMocks(); });

// ── Areas ─────────────────────────────────────────────────────
describe('GET /api/areas', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/areas');
    expect(res.status).toBe(401);
  });

  it('returns list of areas', async () => {
    const areas = [
      { id: 'area-001', locationId: 'loc-001', name: 'Zone A', code: 'ZA', isActive: true, createdAt: new Date(), location: null, shelves: [], boxes: [] },
    ];
    (prismaMock.area.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(areas);

    const res = await request(app)
      .get('/api/areas')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 400 for invalid locationId query param', async () => {
    const res = await request(app)
      .get('/api/areas?locationId=not-a-uuid')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/areas', () => {
  it('returns 403 for Staff role', async () => {
    const res = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${makeToken('Staff')}`)
      .send({ locationId: 'aad8f10c-3b0a-4bce-b4c0-8e5400f20001', name: 'Area A', code: 'AA' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({ name: 'Area A' });
    expect(res.status).toBe(400);
  });

  it('creates an area as Admin', async () => {
    const newArea = { id: 'area-002', locationId: 'aad8f10c-3b0a-4bce-b4c0-8e5400f20001', name: 'Area B', code: 'AB', isActive: true, createdAt: new Date() };
    (prismaMock.area.create as ReturnType<typeof vi.fn>).mockResolvedValue(newArea);

    const res = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({ locationId: 'aad8f10c-3b0a-4bce-b4c0-8e5400f20001', name: 'Area B', code: 'AB' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Area B');
  });
});

// ── Shelves ───────────────────────────────────────────────────
describe('GET /api/shelves', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/shelves');
    expect(res.status).toBe(401);
  });

  it('returns list of shelves', async () => {
    const shelves = [
      { id: 'shelf-001', areaId: 'area-001', name: 'Shelf 1', code: 'S1', height: 200, width: 100, length: 50, rotationAngle: 0, isActive: true, createdAt: new Date(), area: null, boxes: [] },
    ];
    (prismaMock.shelf.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(shelves);

    const res = await request(app)
      .get('/api/shelves')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/shelves', () => {
  it('returns 400 for missing dimensions', async () => {
    const res = await request(app)
      .post('/api/shelves')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({ areaId: 'aad8f10c-3b0a-4bce-b4c0-8e5400f20001', name: 'S1', code: 'S1' });
    expect(res.status).toBe(400);
  });

  it('creates a shelf with dimensions', async () => {
    const newShelf = { id: 'shelf-001', areaId: 'aad8f10c-3b0a-4bce-b4c0-8e5400f20001', name: 'S1', code: 'S1', height: 200, width: 80, length: 40, rotationAngle: 0, isActive: true, createdAt: new Date() };
    (prismaMock.shelf.create as ReturnType<typeof vi.fn>).mockResolvedValue(newShelf);

    const res = await request(app)
      .post('/api/shelves')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({ areaId: 'aad8f10c-3b0a-4bce-b4c0-8e5400f20001', name: 'S1', code: 'S1', height: 200, width: 80, length: 40 });
    expect(res.status).toBe(201);
    expect(res.body.height).toBe(200);
    expect(res.body.rotationAngle).toBe(0);
  });
});

// ── Boxes ─────────────────────────────────────────────────────
describe('GET /api/boxes', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/boxes');
    expect(res.status).toBe(401);
  });

  it('returns list of boxes', async () => {
    const boxes = [
      { id: 'box-001', name: 'Box A', code: 'BA', height: 30, width: 20, length: 15, isActive: true, createdAt: new Date(), barcodes: [], area: null, shelf: null },
    ];
    (prismaMock.storageBox.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(boxes);

    const res = await request(app)
      .get('/api/boxes')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/boxes', () => {
  it('returns 400 for missing name', async () => {
    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({ code: 'BA', height: 30, width: 20, length: 15 });
    expect(res.status).toBe(400);
  });

  it('creates a box', async () => {
    const newBox = { id: 'box-002', name: 'Box B', code: 'BB', height: 30, width: 20, length: 15, isActive: true, createdAt: new Date(), barcodes: [] };
    (prismaMock.storageBox.create as ReturnType<typeof vi.fn>).mockResolvedValue(newBox);

    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({ name: 'Box B', code: 'BB', height: 30, width: 20, length: 15 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Box B');
  });
});

describe('POST /api/boxes/:id/barcodes', () => {
  it('creates a barcode for a box', async () => {
    const newBarcode = { id: 'bc-001', boxId: 'box-001', barcode: '1234567890123', barcodeType: 'EAN13', isDefault: false, label: null, createdAt: new Date() };
    (prismaMock.boxBarcode.create as ReturnType<typeof vi.fn>).mockResolvedValue(newBarcode);

    const res = await request(app)
      .post('/api/boxes/aad8f10c-3b0a-4bce-b4c0-8e5400f20001/barcodes')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({ barcode: '1234567890123' });
    expect(res.status).toBe(201);
    expect(res.body.barcode).toBe('1234567890123');
  });

  it('returns 400 for missing barcode', async () => {
    const res = await request(app)
      .post('/api/boxes/aad8f10c-3b0a-4bce-b4c0-8e5400f20001/barcodes')
      .set('Authorization', `Bearer ${makeToken('Admin')}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
