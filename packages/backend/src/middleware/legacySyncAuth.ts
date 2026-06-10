import { timingSafeEqual } from 'crypto';
import { NextFunction, Response } from 'express';
import { UserRole } from '@jingles/shared';
import { authenticate, AuthRequest, requireRole } from './auth';

export const LEGACY_SYNC_TOKEN_HEADER = 'x-jingles-legacy-sync-token';
const LEGACY_SYNC_PRINCIPAL = {
  id: 'legacy-desktop-sync',
  email: 'legacy-sync@internal.jingles',
  role: UserRole.Admin,
} as const;

function getConfiguredLegacySyncToken() {
  return (
    process.env.JINGLES_LEGACY_SYNC_TOKEN?.trim() ||
    process.env.LEGACY_SYNC_TOKEN?.trim() ||
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

export function hasValidLegacySyncToken(req: Pick<AuthRequest, 'headers'>) {
  const configuredToken = getConfiguredLegacySyncToken();
  const requestToken = readHeaderToken(req.headers[LEGACY_SYNC_TOKEN_HEADER]);

  return Boolean(configuredToken && requestToken && tokensMatch(configuredToken, requestToken));
}

export async function authenticateLegacySyncRequest(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (hasValidLegacySyncToken(req)) {
    req.user = { ...LEGACY_SYNC_PRINCIPAL };
    next();
    return;
  }

  await authenticate(req, res, () => {
    requireRole(UserRole.Admin, UserRole.Manager)(req, res, next);
  });
}
