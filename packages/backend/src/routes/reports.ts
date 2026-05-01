import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '@jingles/shared';
import { getInventoryValuation, getFloorPerformance, getSalesSummary } from '../modules/analytics/analyticsService';
import {
  getGRNReport,
  getPRNReport,
	getStockAdjustmentReport,
	getStockBalanceReport,
	getStockMovementReport,
	getTOGReport,
	getGenericReport,
} from '../modules/reports/reportService';
import prisma from '../prisma/client';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

const buildCatalogFilters = (query: Record<string, string>) => {
  const {
    fromDate,
    toDate,
    supplierId,
    branchId,
    floorId,
    skuId,
    status,
    eventType,
    groupBy,
    search,
    daysToExpiry,
    page,
    pageSize,
  } = query;

  const filters: any = {
    supplierId: supplierId || undefined,
    branchId: branchId || undefined,
    floorId: floorId || undefined,
    skuId: skuId || undefined,
    status: status || undefined,
    eventType: eventType || undefined,
    groupBy: groupBy || undefined,
    search: search || undefined,
    daysToExpiry: daysToExpiry ? parseInt(daysToExpiry, 10) : undefined,
    page: page ? parseInt(page, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
  };

  if (fromDate) filters.fromDate = new Date(fromDate);
  if (toDate) filters.toDate = new Date(toDate);

  return filters;
};

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

// GRN Report - Good Received Note Report
router.get('/grn', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromDate, toDate, supplierId, status, branchId, page, pageSize } = req.query as Record<string, string>;
    const user = req.user!;

    const filters: any = {
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    };

    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);
    if (supplierId) filters.supplierId = supplierId;
    if (status) filters.status = status;
    if (branchId) filters.branchId = branchId;

    // Vendor users can only see their own GRNs
    if (user.role === UserRole.Vendor) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser?.vendorId) filters.supplierId = dbUser.vendorId;
    }

    const data = await getGRNReport(filters);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('GRN report error', error);
    res.status(500).json({ success: false, error: 'Failed to generate GRN report' });
  }
});

// PRN Report - Purchase Return Note Report
router.get('/prn', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromDate, toDate, supplierId, status, branchId, page, pageSize } = req.query as Record<string, string>;
    const user = req.user!;

    const filters: any = {
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    };

    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);
    if (supplierId) filters.supplierId = supplierId;
    if (status) filters.status = status;
    if (branchId) filters.branchId = branchId;

    // Vendor users can only see their own PRNs
    if (user.role === UserRole.Vendor) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser?.vendorId) filters.supplierId = dbUser.vendorId;
    }

    const data = await getPRNReport(filters);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('PRN report error', error);
    res.status(500).json({ success: false, error: 'Failed to generate PRN report' });
  }
});

// Stock Adjustment Report
router.get(
  '/stock-adjustment',
  requireRole(UserRole.Admin, UserRole.Manager),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { fromDate, toDate, userId, page, pageSize } = req.query as Record<string, string>;

      const filters: any = {
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
      };

      if (fromDate) filters.fromDate = new Date(fromDate);
      if (toDate) filters.toDate = new Date(toDate);
      if (userId) filters.userId = userId;

      const data = await getStockAdjustmentReport(filters);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Stock adjustment report error', error);
      res.status(500).json({ success: false, error: 'Failed to generate stock adjustment report' });
    }
  }
);

// Stock Balance Report
router.get('/stock-balance', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { skuId, branchId, floorId, state, page, pageSize } = req.query as Record<string, string>;
    const user = req.user!;

    const filters: any = {
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    };

    if (skuId) filters.skuId = skuId;
    if (branchId) filters.branchId = branchId;
    if (floorId) filters.floorId = floorId;
    if (state) filters.state = state;

    // Vendor users can only see their own SKUs
    // This filtering is handled in the reportService itself via SKU relations

    const data = await getStockBalanceReport(filters);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Stock balance report error', error);
    res.status(500).json({ success: false, error: 'Failed to generate stock balance report' });
  }
});

// Stock Movement Report
router.get('/stock-movement', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromDate, toDate, skuId, branchId, eventType, page, pageSize } = req.query as Record<string, string>;

    const filters: any = {
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    };

    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);
    if (skuId) filters.skuId = skuId;
    if (branchId) filters.branchId = branchId;
    if (eventType) filters.eventType = eventType;

    const data = await getStockMovementReport(filters);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Stock movement report error', error);
    res.status(500).json({ success: false, error: 'Failed to generate stock movement report' });
  }
});

// Transfer of Good Note (TOG) Report
router.get('/tog', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromDate, toDate, fromBranchId, toBranchId, status, page, pageSize } = req.query as Record<string, string>;

    const filters: any = {
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    };

    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);
    if (fromBranchId) filters.fromBranchId = fromBranchId;
    if (toBranchId) filters.toBranchId = toBranchId;
    if (status) filters.status = status;

    const data = await getTOGReport(filters);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('TOG report error', error);
    res.status(500).json({ success: false, error: 'Failed to generate TOG report' });
  }
});

// Extended report catalog endpoint. This feeds the comprehensive reports workbench
// for inventory, stock, management, and sales reports that are derivable from the
// current inventory schema.
router.get('/catalog/:reportId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filters = buildCatalogFilters(req.query as Record<string, string>);
    const data = await getGenericReport(req.params.reportId, filters);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Extended report catalog error', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Compatibility route for integrations that call /api/reports/<report-id>
// directly instead of going through /api/reports/catalog/<report-id>.
router.get('/:reportId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filters = buildCatalogFilters(req.query as Record<string, string>);
    const data = await getGenericReport(req.params.reportId, filters);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Extended report slug error', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

export default router;
