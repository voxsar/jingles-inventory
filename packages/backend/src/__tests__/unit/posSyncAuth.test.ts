import { UserRole } from '@jingles/shared';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const authenticate = vi.fn();
const requireRole = vi.fn();

vi.mock('../../middleware/auth', () => ({
  authenticate,
  requireRole,
}));

const {
  POS_SYNC_APP_TOKEN_HEADER,
  authenticatePosSyncRequest,
} = await import('../../middleware/posSyncAuth');

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('authenticatePosSyncRequest', () => {
  const originalAppToken = process.env.JINGLES_POS_SYNC_APP_TOKEN;
  const originalLegacyAppToken = process.env.POS_SYNC_APP_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JINGLES_POS_SYNC_APP_TOKEN = '';
    process.env.POS_SYNC_APP_TOKEN = '';
    authenticate.mockImplementation((_req, _res, next) => next());
    requireRole.mockImplementation(() => (_req: unknown, _res: unknown, next: () => void) => next());
  });

  afterAll(() => {
    process.env.JINGLES_POS_SYNC_APP_TOKEN = originalAppToken;
    process.env.POS_SYNC_APP_TOKEN = originalLegacyAppToken;
  });

  it('accepts the configured POS app token without falling back to user auth', async () => {
    process.env.JINGLES_POS_SYNC_APP_TOKEN = 'shared-pos-token';

    const req = {
      headers: {
        [POS_SYNC_APP_TOKEN_HEADER]: 'shared-pos-token',
      },
    } as any;
    const res = createResponse();
    const next = vi.fn();

    await authenticatePosSyncRequest(req, res as any, next);

    expect(req.user).toEqual({
      id: 'pos-app-sync',
      email: 'pos-sync@internal.jingles',
      role: UserRole.Admin,
    });
    expect(authenticate).not.toHaveBeenCalled();
    expect(requireRole).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to normal user auth when no app token is supplied', async () => {
    const req = {
      headers: {
        authorization: 'Bearer inventory-user-token',
      },
      user: undefined,
    } as any;
    const res = createResponse();
    const next = vi.fn();

    await authenticatePosSyncRequest(req, res as any, next);

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(requireRole).toHaveBeenCalledWith(UserRole.Admin, UserRole.Manager, UserRole.Staff);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
