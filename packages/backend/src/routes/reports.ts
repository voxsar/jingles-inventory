import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '@jingles/shared';
import { getInventoryValuation, getFloorPerformance, getSalesSummary } from '../modules/analytics/analyticsService';
import prisma from '../prisma/client';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

router.get('/inventory-valuation', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    let vendorId: string | undefined;
    if (user.role === UserRole.Vendor) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      vendorId = dbUser?.vendorId ?? undefined;
    } else {
      vendorId = req.query.vendorId as string | undefined;
    }
    const data = await getInventoryValuation(vendorId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Inventory valuation error', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

router.get(
  '/floor-performance',
  requireRole(UserRole.Admin, UserRole.Manager),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = await getFloorPerformance();
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Floor performance error', error);
      res.status(500).json({ success: false, error: 'Failed to generate report' });
    }
  }
);

router.get(
  '/sales-summary',
  requireRole(UserRole.Admin, UserRole.Manager),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { fromDate, toDate } = req.query as Record<string, string>;
      const data = await getSalesSummary(
        fromDate ? new Date(fromDate) : undefined,
        toDate ? new Date(toDate) : undefined
      );
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Sales summary error', error);
      res.status(500).json({ success: false, error: 'Failed to generate report' });
    }
  }
);

export default router;
