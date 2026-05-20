import { Request, Response, NextFunction } from 'express';
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
