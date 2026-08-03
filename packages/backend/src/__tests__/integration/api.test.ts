import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock prisma before importing app
vi.mock('../../prisma/client', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
    inventoryEvent: {
      create: vi.fn().mockResolvedValue({ id: 'ev-test' }),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
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

describe('GET /api/runtime/build', () => {
  it('returns build metadata for this backend', async () => {
    const res = await request(app).get('/api/runtime/build');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toMatchObject({
      packageName: '@jingles/backend',
      appVersion: expect.any(String),
    });
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

  it('authenticates locally in replica mode without calling upstream login', async () => {
    const { default: prisma } = await import('../../prisma/client');
    const originalReplicaMode = process.env.JINGLES_LOCAL_SQLITE;
    const originalFetch = global.fetch;
    const passwordHash = await bcrypt.hash('password123', 4);
    const fetchSpy = vi.fn();

    try {
      process.env.JINGLES_LOCAL_SQLITE = '1';
      global.fetch = fetchSpy as typeof global.fetch;

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-001',
        email: 'admin@theredsun.org',
        passwordHash,
        isActive: true,
        role: 'Admin',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@theredsun.org', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: 'user-001',
        email: 'admin@theredsun.org',
        role: 'Admin',
        hasPin: false,
      });
      expect(typeof res.body.token).toBe('string');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      process.env.JINGLES_LOCAL_SQLITE = originalReplicaMode;
      global.fetch = originalFetch;
    }
  });

  it('returns a sync token when upstream login succeeds during local replica sign-in', async () => {
    const { default: prisma } = await import('../../prisma/client');
    const originalReplicaMode = process.env.JINGLES_LOCAL_SQLITE;
    const originalUpstreamUrl = process.env.JINGLES_UPSTREAM_SERVER_URL;
    const originalFetch = global.fetch;
    const passwordHash = await bcrypt.hash('password123', 4);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        token: 'upstream-token-001',
        user: {
          id: 'user-001',
          email: 'admin@theredsun.org',
          role: 'Admin',
        },
      }),
    });

    try {
      process.env.JINGLES_LOCAL_SQLITE = '1';
      process.env.JINGLES_UPSTREAM_SERVER_URL = 'https://inv.theredsun.org';
      global.fetch = fetchSpy as typeof global.fetch;

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-001',
        email: 'admin@theredsun.org',
        passwordHash,
        isActive: true,
        role: 'Admin',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@theredsun.org', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.syncToken).toBe('upstream-token-001');
      expect(fetchSpy).toHaveBeenCalledWith(
        new URL('/api/auth/login', 'https://inv.theredsun.org/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'admin@theredsun.org',
            password: 'password123',
          }),
        })
      );
    } finally {
      process.env.JINGLES_LOCAL_SQLITE = originalReplicaMode;
      process.env.JINGLES_UPSTREAM_SERVER_URL = originalUpstreamUrl;
      global.fetch = originalFetch;
    }
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

  it('returns the cached desktop user offline when JWT_SECRET is not configured', async () => {
    const { default: prisma } = await import('../../prisma/client');
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalReplicaMode = process.env.JINGLES_LOCAL_SQLITE;

    try {
      process.env.JWT_SECRET = '';
      process.env.JINGLES_LOCAL_SQLITE = '1';

      (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
        { key: 'authToken', value: 'desktop-cached-token' },
        {
          key: 'authUser',
          value: JSON.stringify({
            id: 'user-001',
            email: 'admin@theredsun.org',
            role: 'Admin',
          }),
        },
      ]);
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer desktop-cached-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'user-001',
        email: 'admin@theredsun.org',
        role: 'Admin',
      });
    } finally {
      process.env.JWT_SECRET = originalJwtSecret;
      process.env.JINGLES_LOCAL_SQLITE = originalReplicaMode;
    }
  });
});

describe('POST /api/auth/sync-token', () => {
  it('refreshes the upstream sync token for an authenticated local session', async () => {
    const originalReplicaMode = process.env.JINGLES_LOCAL_SQLITE;
    const originalUpstreamUrl = process.env.JINGLES_UPSTREAM_SERVER_URL;
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        token: 'upstream-sync-token-002',
        user: {
          id: 'user-001',
          email: 'admin@theredsun.org',
          role: 'Admin',
        },
      }),
    });

    try {
      process.env.JINGLES_LOCAL_SQLITE = '1';
      process.env.JINGLES_UPSTREAM_SERVER_URL = 'https://inv.theredsun.org';
      process.env.JWT_SECRET = 'desktop-test-secret';
      global.fetch = fetchSpy as typeof global.fetch;

      const localToken = jwt.sign(
        {
          id: 'user-001',
          email: 'admin@theredsun.org',
          role: 'Admin',
        },
        process.env.JWT_SECRET
      );

      const res = await request(app)
        .post('/api/auth/sync-token')
        .set('Authorization', `Bearer ${localToken}`)
        .send({ password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        syncToken: 'upstream-sync-token-002',
        userId: 'user-001',
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        new URL('/api/auth/login', 'https://inv.theredsun.org/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'admin@theredsun.org',
            password: 'password123',
          }),
        })
      );
    } finally {
      process.env.JINGLES_LOCAL_SQLITE = originalReplicaMode;
      process.env.JINGLES_UPSTREAM_SERVER_URL = originalUpstreamUrl;
      process.env.JWT_SECRET = originalJwtSecret;
      global.fetch = originalFetch;
    }
  });
});
