import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';
import logger from '../utils/logger';
import { isLocalReplicaMode } from '../utils/runtimePaths';

export interface AuthTokenPayload {
  id: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthTokenPayload;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return secret;
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
}

type UpstreamTokenVerificationResult =
  | { ok: true; user: AuthTokenPayload }
  | { ok: false; status: number; error: string }
  | null;

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AuthTokenPayload).id === 'string' &&
    typeof (value as AuthTokenPayload).email === 'string' &&
    typeof (value as AuthTokenPayload).role === 'string'
  );
}

type DesktopAuthConfigRow = {
  key: string;
  value: string;
};

type DesktopCachedSession = {
  token: string;
  user: AuthTokenPayload;
};

type CachedLanToken = {
  user: AuthTokenPayload;
  expiresAt: string;
};

function lanTokenCacheKey(token: string) {
  return `lanAuth:${createHash('sha256').update(token).digest('hex')}`;
}

function tokenCacheExpiry(token: string) {
  const maximum = Date.now() + 24 * 60 * 60 * 1000;
  try {
    const payload = jwt.decode(token) as { exp?: unknown } | null;
    const expiresAt = typeof payload?.exp === 'number' ? payload.exp * 1000 : maximum;
    return new Date(Math.min(maximum, expiresAt)).toISOString();
  } catch {
    return new Date(maximum).toISOString();
  }
}

async function readCachedLanUser(token: string): Promise<AuthTokenPayload | null> {
  try {
    const rows = await (prisma as any).$queryRawUnsafe(
      'SELECT value FROM config WHERE key = ? LIMIT 1',
      lanTokenCacheKey(token)
    ) as Array<{ value?: string }>;
    if (!rows[0]?.value) return null;
    const cached = JSON.parse(rows[0].value) as CachedLanToken;
    return Date.parse(cached.expiresAt) > Date.now() && isAuthTokenPayload(cached.user)
      ? cached.user
      : null;
  } catch {
    return null;
  }
}

async function cacheLanUser(token: string, user: AuthTokenPayload) {
  try {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      lanTokenCacheKey(token),
      JSON.stringify({ user, expiresAt: tokenCacheExpiry(token) } satisfies CachedLanToken)
    );
  } catch (error) {
    logger.warn('Failed to cache an authenticated LAN sync token', error);
  }
}

async function verifyLanTokenWithUpstream(token: string): Promise<AuthTokenPayload | null> {
  const cached = await readCachedLanUser(token);
  if (cached) return cached;

  const upstreamUrl = process.env.JINGLES_UPSTREAM_SERVER_URL?.trim();
  if (!upstreamUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(new URL('/api/auth/me', `${upstreamUrl.replace(/\/+$/, '')}/`), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    const candidate = payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : payload;
    if (!isAuthTokenPayload(candidate)) return null;
    await cacheLanUser(token, candidate);
    return candidate;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readDesktopCachedSession(): Promise<DesktopCachedSession | null> {
  if (!isLocalReplicaMode()) {
    return null;
  }

  try {
    const rows = (await (prisma as typeof prisma & {
      $queryRawUnsafe: (query: string, ...params: unknown[]) => Promise<DesktopAuthConfigRow[]>;
    }).$queryRawUnsafe(
      'SELECT key, value FROM config WHERE key IN (?, ?, ?)',
      'localSessionToken',
      'authUser',
      'authToken'
    )) as DesktopAuthConfigRow[];

    const authToken =
      rows.find((row) => row.key === 'localSessionToken')?.value?.trim() ||
      rows.find((row) => row.key === 'authToken')?.value?.trim();
    const rawAuthUser = rows.find((row) => row.key === 'authUser')?.value;

    if (!authToken || !rawAuthUser) {
      return null;
    }

    const parsedAuthUser = JSON.parse(rawAuthUser) as unknown;
    if (!isAuthTokenPayload(parsedAuthUser)) {
      return null;
    }

    return {
      token: authToken,
      user: parsedAuthUser,
    };
  } catch (error) {
    logger.warn('Failed to read the cached desktop auth session', error);
    return null;
  }
}

export async function getCachedDesktopUserForToken(token: string): Promise<AuthTokenPayload | null> {
  const cachedSession = await readDesktopCachedSession();
  if (!cachedSession || cachedSession.token !== token) {
    return null;
  }

  return cachedSession.user;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch (err) {
    if (isLocalReplicaMode()) {
      const cachedUser = await getCachedDesktopUserForToken(token);
      if (cachedUser) {
        req.user = cachedUser;
        next();
        return;
      }

      const lanUser = await verifyLanTokenWithUpstream(token);
      if (lanUser) {
        req.user = lanUser;
        next();
        return;
      }

      if (err instanceof Error && err.message === 'JWT_SECRET is not configured') {
        logger.error(err.message);
        res.status(500).json({ error: 'Desktop authentication is unavailable because the local JWT secret is missing' });
        return;
      }
    }

    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export { authenticate as authenticateToken };
