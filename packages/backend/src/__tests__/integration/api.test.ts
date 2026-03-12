import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

// Mock prisma before importing app
vi.mock('../../prisma/client', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
    inventoryEvent: {
      create: vi.fn().mockResolvedValue({ id: 'ev-test' }),
    },
    $disconnect: vi.fn(),
  },
}));

// Mock rate limiter for tests
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

const { default: app } = await import('../../server');

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /api/auth/login', () => {
  it('returns 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for non-existent user', async () => {
    const { default: prisma } = await import('../../prisma/client');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid credentials');
  });

  it('returns 401 for inactive user', async () => {
    const { default: prisma } = await import('../../prisma/client');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-001',
      email: 'inactive@test.com',
      passwordHash: '$2b$10$invalidhash',
      isActive: false,
      role: 'Staff',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-valid-token');
    expect(res.status).toBe(401);
  });

  it('returns 401 for Bearer without token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });
});
