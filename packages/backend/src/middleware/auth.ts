import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { getUpstreamServerUrl, isLocalReplicaMode } from '../utils/runtimePaths';

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

async function verifyAuthTokenAgainstUpstream(token: string): Promise<UpstreamTokenVerificationResult> {
  const upstreamServerUrl = getUpstreamServerUrl();
  if (!isLocalReplicaMode() || !upstreamServerUrl) {
    return null;
  }

  try {
    const response = await fetch(`${upstreamServerUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof payload.error === 'string' ? payload.error : 'Invalid or expired token',
      };
    }

    const userPayload = (payload.data ?? payload) as unknown;
    if (!isAuthTokenPayload(userPayload)) {
      return {
        ok: false,
        status: 502,
        error: 'Upstream auth verification returned incomplete user data',
      };
    }

    return {
      ok: true,
      user: userPayload,
    };
  } catch (error) {
    logger.warn('Upstream token verification failed', error);
    return {
      ok: false,
      status: 503,
      error: 'Authentication is unavailable because the upstream server could not be reached',
    };
  }
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
    if (err instanceof Error && err.message === 'JWT_SECRET is not configured') {
      const upstreamResult = await verifyAuthTokenAgainstUpstream(token);
      if (upstreamResult?.ok) {
        req.user = upstreamResult.user;
        next();
        return;
      }

      if (upstreamResult && !upstreamResult.ok) {
        if (upstreamResult.status >= 500) {
          logger.error(err.message);
        }

        res.status(upstreamResult.status).json({ error: upstreamResult.error });
        return;
      }

      logger.error(err.message);
      res.status(500).json({ error: 'Server configuration error' });
      return;
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
