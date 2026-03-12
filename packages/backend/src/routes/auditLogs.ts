import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireRole('Admin'));

router.get(
  '/',
  [
    query('entityType').optional().isString(),
    query('entityId').optional().isUUID(),
    query('userId').optional().isUUID(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { entityType, entityId, userId } = req.query as {
      entityType?: string;
      entityId?: string;
      userId?: string;
    };
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(userId ? { userId } : {}),
      },
      include: { user: true },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
    res.json(logs);
  }
);

export default router;
