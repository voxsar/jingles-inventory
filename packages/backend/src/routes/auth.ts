import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { getUpstreamServerUrl, isLocalReplicaMode } from '../utils/runtimePaths';

const router = Router();

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    vendorId?: string | null;
    createdAt?: string | null;
  };
};

function buildJwtForUser(user: { id: string; email: string; role: string }) {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    return null;
  }

  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];

  return jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, {
    expiresIn,
  });
}

async function upsertReplicaUser(user: AuthPayload['user'], passwordHash = '') {
  await prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email,
      role: user.role,
      vendorId: user.vendorId ?? null,
      isActive: true,
      ...(passwordHash ? { passwordHash } : {}),
    },
    create: {
      id: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendorId ?? null,
      isActive: true,
      passwordHash,
      createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
    },
  });
}

async function cacheReplicaUser(user: AuthPayload['user'], passwordHash = '') {
  try {
    await upsertReplicaUser(user, passwordHash);
  } catch (error) {
    logger.warn('Failed to cache the authenticated user in the local replica', error);
  }
}

async function findLocalUserByEmail(email: string) {
  try {
    return await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    logger.warn('Failed to read the user from the local replica during login', error);
    return null;
  }
}

async function findLocalUserById(id: string) {
  try {
    return await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, vendorId: true, createdAt: true },
    });
  } catch (error) {
    logger.warn('Failed to read the current user from the local replica', error);
    return null;
  }
}

async function loginAgainstUpstream(email: string, password: string) {
  const upstreamServerUrl = getUpstreamServerUrl();
  if (!isLocalReplicaMode() || !upstreamServerUrl) {
    return null;
  }

  try {
    const response = await fetch(`${upstreamServerUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;

    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        body: payload,
      };
    }

    const authPayload = (payload?.data ?? payload) as AuthPayload;
    if (!authPayload?.token || !authPayload?.user?.id) {
      return {
        ok: false as const,
        status: 502,
        body: { error: 'Upstream login response was missing token or user data' },
      };
    }

    await cacheReplicaUser(authPayload.user);

    return {
      ok: true as const,
      status: response.status,
      body: payload,
    };
  } catch (error) {
    logger.warn('Upstream login fallback failed', error);
    return null;
  }
}

async function fetchUpstreamCurrentUser(authorizationHeader: string) {
  const upstreamServerUrl = getUpstreamServerUrl();
  if (!isLocalReplicaMode() || !upstreamServerUrl) {
    return null;
  }

  try {
    const response = await fetch(`${upstreamServerUrl}/api/auth/me`, {
      headers: {
        Authorization: authorizationHeader,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;

    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        body: payload,
      };
    }

    const user = (payload?.data ?? payload) as AuthPayload['user'];
    if (!user?.id) {
      return {
        ok: false as const,
        status: 502,
        body: { error: 'Upstream /me response was missing user data' },
      };
    }

    await cacheReplicaUser(user);

    return {
      ok: true as const,
      status: response.status,
      body: payload,
    };
  } catch (error) {
    logger.warn('Upstream auth/me fallback failed', error);
    return null;
  }
}

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password } = req.body as { email: string; password: string };

    const user = await findLocalUserByEmail(email);
    const canAuthenticateLocally =
      Boolean(user?.isActive) && typeof user?.passwordHash === 'string' && user.passwordHash.length > 0;

    if (canAuthenticateLocally && user) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (valid) {
        const token = buildJwtForUser(user);
        if (token) {
          res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
          return;
        }

        logger.warn(
          'Skipping local token issuance during login because JWT_SECRET is not configured.'
        );
      }
    }

    const upstreamResult = await loginAgainstUpstream(email, password);
    if (upstreamResult?.ok) {
      res.status(upstreamResult.status).json(upstreamResult.body);
      return;
    }
    if (upstreamResult && !upstreamResult.ok) {
      res.status(upstreamResult.status).json(upstreamResult.body);
      return;
    }

    if (user && !user.isActive) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!isLocalReplicaMode()) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    res.status(503).json({ error: 'Login is unavailable locally and the upstream server could not be reached' });
  }
);

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await findLocalUserById(req.user!.id);
  if (!user) {
    const authorization = req.headers.authorization;
    if (authorization) {
      const upstreamResult = await fetchUpstreamCurrentUser(authorization);
      if (upstreamResult?.ok) {
        res.status(upstreamResult.status).json(upstreamResult.body);
        return;
      }
      if (upstreamResult && !upstreamResult.ok) {
        res.status(upstreamResult.status).json(upstreamResult.body);
        return;
      }
    }

    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

export default router;
