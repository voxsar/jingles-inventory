import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, AuthRequest, getCachedDesktopUserForToken } from '../middleware/auth';
import logger from '../utils/logger';
import { isLocalReplicaMode } from '../utils/runtimePaths';

const router = Router();

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    accessScope?: string;
    isSalesman?: boolean;
    vendorId?: string | null;
    createdAt?: string | null;
    hasPin?: boolean;
  };
};

type UpstreamSyncTokenResult =
  | { ok: true; token: string; user: AuthPayload['user'] }
  | { ok: false; status: number; error: string };

function parseAuthPayload(payload: unknown): AuthPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate =
    'data' in payload && payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const token = 'token' in candidate ? candidate.token : null;
  const user = 'user' in candidate ? candidate.user : null;

  if (typeof token !== 'string' || !user || typeof user !== 'object') {
    return null;
  }

  const id = 'id' in user ? user.id : null;
  const email = 'email' in user ? user.email : null;
  const role = 'role' in user ? user.role : null;
  const vendorId = 'vendorId' in user ? user.vendorId : null;
  const createdAt = 'createdAt' in user ? user.createdAt : null;
  const hasPin = 'hasPin' in user ? user.hasPin : false;
  const accessScope = 'accessScope' in user ? user.accessScope : 'BOTH';
  const isSalesman = 'isSalesman' in user ? user.isSalesman : true;

  if (typeof id !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    return null;
  }

  return {
    token,
    user: {
      id,
      email,
      role,
      accessScope: typeof accessScope === 'string' ? accessScope : 'BOTH',
      isSalesman: typeof isSalesman === 'boolean' ? isSalesman : true,
      vendorId: typeof vendorId === 'string' || vendorId === null ? vendorId : null,
      createdAt: typeof createdAt === 'string' || createdAt === null ? createdAt : null,
      hasPin: typeof hasPin === 'boolean' ? hasPin : false,
    },
  };
}

function readUpstreamAuthError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const directError =
    'error' in payload && typeof payload.error === 'string' ? payload.error.trim() : '';
  if (directError) {
    return directError;
  }

  const directMessage =
    'message' in payload && typeof payload.message === 'string' ? payload.message.trim() : '';
  if (directMessage) {
    return directMessage;
  }

  const nestedData = 'data' in payload && payload.data && typeof payload.data === 'object'
    ? payload.data
    : null;

  if (nestedData) {
    const nestedError =
      'error' in nestedData && typeof nestedData.error === 'string' ? nestedData.error.trim() : '';
    if (nestedError) {
      return nestedError;
    }

    const nestedMessage =
      'message' in nestedData && typeof nestedData.message === 'string'
        ? nestedData.message.trim()
        : '';
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return fallback;
}

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
      accessScope: user.accessScope ?? 'BOTH',
      isSalesman: user.isSalesman !== false,
      vendorId: user.vendorId ?? null,
      isActive: true,
      ...(passwordHash ? { passwordHash } : {}),
    },
    create: {
      id: user.id,
      email: user.email,
      role: user.role,
      accessScope: user.accessScope ?? 'BOTH',
      isSalesman: user.isSalesman !== false,
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
      select: { id: true, email: true, role: true, accessScope: true, isSalesman: true, vendorId: true, createdAt: true },
    });
  } catch (error) {
    logger.warn('Failed to read the current user from the local replica', error);
    return null;
  }
}

async function findPinHashByUserId(id: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ pinHash: string | null }>>`
      SELECT "pin_hash" AS "pinHash" FROM "users" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0]?.pinHash ?? null;
  } catch (error) {
    logger.warn('Failed to read the user unlock PIN', error);
    return null;
  }
}

async function requestUpstreamSyncToken(
  email: string,
  password: string
): Promise<UpstreamSyncTokenResult> {
  if (!isLocalReplicaMode()) {
    return {
      ok: false,
      status: 400,
      error: 'Sync auth exchange is only available in local replica mode.',
    };
  }

  const upstreamUrl = process.env.JINGLES_UPSTREAM_SERVER_URL?.trim();
  if (!upstreamUrl) {
    return {
      ok: false,
      status: 503,
      error: 'No upstream host is configured for desktop sync.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(new URL('/api/auth/login', `${upstreamUrl}/`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const fallbackMessage =
        response.status === 401 || response.status === 403
          ? 'Host credentials were rejected. Re-enter the host password to continue syncing.'
          : response.status >= 500
            ? 'The host is unavailable right now.'
            : `Host sync sign-in failed with HTTP ${response.status}.`;

      return {
        ok: false,
        status: response.status === 401 || response.status === 403 ? 400 : Math.max(response.status, 400),
        error: readUpstreamAuthError(payload, fallbackMessage),
      };
    }

    const payload = parseAuthPayload(await response.json().catch(() => null));
    const token = payload?.token?.trim();
    if (!payload || !token) {
      return {
        ok: false,
        status: 502,
        error: 'The host login response did not include a sync token.',
      };
    }

    return {
      ok: true,
      token,
      user: payload.user,
    };
  } catch (error) {
    logger.info('Unable to refresh the upstream sync token after local sign-in.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      status: 503,
      error: 'Unable to reach the host to refresh the sync token.',
    };
  } finally {
    clearTimeout(timeout);
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
          const upstreamSyncTokenResult = await requestUpstreamSyncToken(email, password);
          const syncToken = upstreamSyncTokenResult.ok ? upstreamSyncTokenResult.token : null;
          const pinHash = await findPinHashByUserId(user.id);
          res.json({
            token,
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              accessScope: user.accessScope ?? 'BOTH',
              isSalesman: user.isSalesman !== false,
              vendorId: user.vendorId,
              hasPin: Boolean(pinHash),
            },
            ...(syncToken ? { syncToken } : {}),
          });
          return;
        }

        logger.warn(
          'Skipping local token issuance during login because JWT_SECRET is not configured.'
        );
      }
    }

    if (user && !user.isActive) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!isLocalReplicaMode()) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const upstreamResult = await requestUpstreamSyncToken(email, password);
    if (!upstreamResult.ok) {
      const invalidCredentials = upstreamResult.status === 400;
      res.status(invalidCredentials ? 401 : upstreamResult.status).json({
        error: invalidCredentials ? 'Invalid credentials' : upstreamResult.error,
      });
      return;
    }

    if (upstreamResult.user.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
      res.status(502).json({ error: 'The host returned a different user for these credentials.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      await upsertReplicaUser(upstreamResult.user, passwordHash);
    } catch (error) {
      logger.error('Failed to bootstrap the authenticated user in the local replica', error);
      res.status(500).json({ error: 'Unable to prepare local sign-in on this desktop.' });
      return;
    }

    const token = buildJwtForUser(upstreamResult.user);
    if (!token) {
      res.status(503).json({ error: 'Local sign-in is unavailable because JWT_SECRET is not configured.' });
      return;
    }

    res.json({
      token,
      syncToken: upstreamResult.token,
      user: {
        id: upstreamResult.user.id,
        email: upstreamResult.user.email,
        role: upstreamResult.user.role,
        accessScope: upstreamResult.user.accessScope ?? 'BOTH',
        isSalesman: upstreamResult.user.isSalesman !== false,
        vendorId: upstreamResult.user.vendorId,
        hasPin: Boolean(upstreamResult.user.hasPin),
      },
    });
  }
);

router.post(
  '/unlock',
  authenticate,
  [body('pin').matches(/^\d{4,6}$/).withMessage('PIN must contain 4 to 6 digits')],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({ error: 'Enter a valid 4 to 6 digit PIN' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { isActive: true },
    });

    if (!user?.isActive) {
      res.status(403).json({ error: 'This account is not active' });
      return;
    }
    const pinHash = await findPinHashByUserId(req.user!.id);
    if (!pinHash) {
      res.status(409).json({ error: 'No unlock PIN has been configured for this user' });
      return;
    }

    const valid = await bcrypt.compare(String(req.body.pin), pinHash);
    if (!valid) {
      // Deliberately avoid 401: the regular API interceptor treats 401 as a full logout.
      res.status(422).json({ error: 'Incorrect PIN' });
      return;
    }

    res.json({ success: true });
  }
);

router.post(
  '/sync-token',
  authenticate,
  [
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!isLocalReplicaMode()) {
      res.status(400).json({ error: 'Sync auth exchange is only available in local replica mode.' });
      return;
    }

    const { password } = req.body as { password: string };
    const upstreamSyncTokenResult = await requestUpstreamSyncToken(req.user!.email, password);

    if (!upstreamSyncTokenResult.ok) {
      res.status(upstreamSyncTokenResult.status).json({ error: upstreamSyncTokenResult.error });
      return;
    }

    res.json({
      syncToken: upstreamSyncTokenResult.token,
      userId: req.user!.id,
    });
  }
);

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await findLocalUserById(req.user!.id);
  if (!user) {
    const authorization = req.headers.authorization;
    if (authorization) {
      const cachedUser = await getCachedDesktopUserForToken(
        authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization
      );
      if (cachedUser) {
        res.json(cachedUser);
        return;
      }
    }

    res.json(req.user);
    return;
  }
  const pinHash = await findPinHashByUserId(user.id);
  res.json({ ...user, hasPin: Boolean(pinHash) });
});

export default router;
