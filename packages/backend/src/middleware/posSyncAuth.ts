import { timingSafeEqual } from 'crypto';
import { NextFunction, Response } from 'express';
import { UserRole } from '@jingles/shared';
import { authenticate, AuthRequest, requireRole } from './auth';

export const POS_SYNC_APP_TOKEN_HEADER = 'x-jingles-pos-app-token';
const POS_SYNC_APP_PRINCIPAL = {
  id: 'pos-app-sync',
  email: 'pos-sync@internal.jingles',
  role: UserRole.Admin,
} as const;

function getConfiguredPosSyncAppToken() {
  return (
    process.env.JINGLES_POS_SYNC_APP_TOKEN?.trim() ||
    process.env.POS_SYNC_APP_TOKEN?.trim() ||
    ''
  );
}

function readHeaderToken(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === 'string' && entry.trim())?.trim() || '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function tokensMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidPosSyncAppToken(req: Pick<AuthRequest, 'headers'>) {
  const configuredToken = getConfiguredPosSyncAppToken();
  const requestToken = readHeaderToken(req.headers[POS_SYNC_APP_TOKEN_HEADER]);

  return Boolean(configuredToken && requestToken && tokensMatch(configuredToken, requestToken));
}

export async function authenticatePosSyncRequest(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (hasValidPosSyncAppToken(req)) {
    req.user = { ...POS_SYNC_APP_PRINCIPAL };
    next();
    return;
  }

  await authenticate(req, res, () => {
    requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff)(req, res, next);
  });
}
