import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole, InventoryState, InventoryEventType } from '@jingles/shared';
import { performTransition } from '../modules/inventory/stateMachine';
import { recordEvent, getEvents } from '../modules/inventory/eventLedger';
import { convert } from '../modules/conversion/unitConverter';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

// GET /api/inventory
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { state, skuId, locationId, page = '1', pageSize = '50' } = req.query as Record<string, string>;
    const user = req.user!;
    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);

    const where: any = {};
    if (state) where.state = state;
    if (skuId) where.skuId = skuId;
    if (locationId) where.locationId = locationId;

    if (user.role === UserRole.Vendor) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser?.vendorId) where.sku = { vendorId: dbUser.vendorId };
    }

    const [items, total] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where,
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
        include: {
          sku: { include: { vendor: { select: { id: true, name: true } } } },
          location: true,
          user: { select: { email: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.inventoryRecord.count({ where }),
    ]);

    res.json({
      success: true,
      data: { items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum) },
    });
  } catch (error) {
    logger.error('Get inventory error', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory' });
  }
});

// GET /api/inventory/events
router.get('/events', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { parentEntityId, eventType, fromDate, toDate, page = '1', pageSize = '50' } = req.query as Record<string, string>;
    const user = req.user!;

    const filters: any = {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
    if (parentEntityId) filters.parentEntityId = parentEntityId;
    if (eventType) filters.eventType = eventType as InventoryEventType;
    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);

    if (user.role === UserRole.Staff) filters.userId = user.id;

    const result = await getEvents(filters);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Get events error', error);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

// POST /api/inventory
router.post(
  '/',
  requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { skuId, locationId, quantity, state, batchId, terminalId } = req.body as {
        skuId: string;
        locationId?: string;
        quantity: number;
        state?: string;
        batchId?: string;
        terminalId?: string;
      };
      const user = req.user!;

      if (!skuId || quantity === undefined) {
        res.status(400).json({ success: false, error: 'skuId and quantity are required' });
        return;
      }

      const record = await prisma.inventoryRecord.create({
        data: {
          skuId,
          locationId,
          quantity,
          state: (state as InventoryState) ?? InventoryState.Uninspected,
          batchId,
          terminalId,
          userId: user.id,
          version: 1,
        },
        include: { sku: true, location: true },
      });

      await recordEvent({
        eventType: InventoryEventType.MANUAL_ADJUSTMENT,
        parentEntityId: record.id,
        quantityDelta: quantity,
        beforeQuantity: 0,
        afterQuantity: quantity,
        userId: user.id,
        terminalId,
      });

      res.status(201).json({ success: true, data: record });
    } catch (error) {
      logger.error('Create inventory error', error);
      res.status(500).json({ success: false, error: 'Failed to create inventory record' });
    }
  }
);

// POST /api/inventory/box-open
router.post(
  '/box-open',
  requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { inventoryRecordId, quantityToOpen, targetLocationId } = req.body as {
        inventoryRecordId: string;
        quantityToOpen: number;
        targetLocationId?: string;
      };
      const user = req.user!;

      if (!inventoryRecordId || !quantityToOpen) {
        res.status(400).json({ success: false, error: 'inventoryRecordId and quantityToOpen are required' });
        return;
      }

      const boxRecord = await prisma.inventoryRecord.findUnique({
        where: { id: inventoryRecordId },
        include: { sku: true },
      });

      if (!boxRecord) {
        res.status(404).json({ success: false, error: 'Inventory record not found' });
        return;
      }
      if (boxRecord.state !== InventoryState.UnopenedBox && boxRecord.state !== InventoryState.ShelfReady) {
        res.status(400).json({ success: false, error: 'Record must be in UnopenedBox or ShelfReady state' });
        return;
      }
      if (boxRecord.quantity < quantityToOpen) {
        res.status(400).json({ success: false, error: 'Insufficient quantity' });
        return;
      }

      const conversionRules = boxRecord.sku.conversionRules as any[];
      let piecesPerBox = 12;
      try {
        piecesPerBox = convert(1, boxRecord.sku.unitOfMeasure, 'Piece', conversionRules);
      } catch {
        // use default
      }

      const totalPieces = quantityToOpen * piecesPerBox;

      const [updatedBox, pieceRecord] = await prisma.$transaction([
        prisma.inventoryRecord.update({
          where: { id: inventoryRecordId },
          data: {
            quantity: boxRecord.quantity - quantityToOpen,
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        }),
        prisma.inventoryRecord.create({
          data: {
            skuId: boxRecord.skuId,
            batchId: boxRecord.batchId,
            locationId: targetLocationId ?? boxRecord.locationId,
            quantity: totalPieces,
            state: InventoryState.Uninspected,
            userId: user.id,
            version: 1,
          },
        }),
      ]);

      await recordEvent({
        eventType: InventoryEventType.BOX_OPENED,
        parentEntityId: inventoryRecordId,
        quantityDelta: -quantityToOpen,
        beforeQuantity: boxRecord.quantity,
        afterQuantity: boxRecord.quantity - quantityToOpen,
        userId: user.id,
        metadata: { boxesOpened: quantityToOpen, piecesCreated: totalPieces, newRecordId: pieceRecord.id },
      });

      res.json({ success: true, data: { boxRecord: updatedBox, pieceRecord, piecesCreated: totalPieces } });
    } catch (error) {
      logger.error('Box open error', error);
      res.status(500).json({ success: false, error: 'Failed to open box' });
    }
  }
);

// POST /api/inventory/:id/transition
router.post('/:id/transition', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { toState, reason } = req.body as { toState: string; reason?: string };
    const user = req.user!;

    if (!toState) {
      res.status(400).json({ success: false, error: 'toState is required' });
      return;
    }

    const result = await performTransition(id, toState as InventoryState, user.id, user.role as UserRole, reason);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, data: result.record, requiresOverride: result.requiresOverride });
  } catch (error) {
    logger.error('Transition error', error);
    res.status(500).json({ success: false, error: 'Failed to perform state transition' });
  }
});

export default router;
