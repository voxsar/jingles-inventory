import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { status, fromBranchId, toBranchId, page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const where: Prisma.StockTransferWhereInput = {};
    if (status) where.status = status;
    if (fromBranchId) where.fromBranchId = fromBranchId;
    if (toBranchId) where.toBranchId = toBranchId;

    const [items, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { requestedAt: 'desc' },
        include: {
          fromBranch: true,
          toBranch: true,
          fromFloor: true,
          toFloor: true,
          requester: { select: { id: true, email: true } },
          lines: true,
        },
      }),
      prisma.stockTransfer.count({ where }),
    ]);

    res.json({
      success: true,
      data: { items, total, page: parseInt(page), pageSize: parseInt(pageSize) },
    });
  }
);

router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: req.params!.id },
      include: {
        fromBranch: true,
        toBranch: true,
        fromFloor: true,
        toFloor: true,
        requester: { select: { id: true, email: true } },
        approver: { select: { id: true, email: true } },
        lines: true,
      },
    });
    if (!transfer) {
      res.status(404).json({ error: 'Stock transfer not found' });
      return;
    }
    res.json({ success: true, data: transfer });
  }
);

router.post(
  '/',
  [
    body('lines').isArray({ min: 1 }),
    body('lines.*.skuId').isUUID(),
    body('lines.*.requestedQty').isInt({ min: 1 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { fromBranchId, toBranchId, fromFloorId, toFloorId, notes, lines } = req.body as {
      fromBranchId?: string;
      toBranchId?: string;
      fromFloorId?: string;
      toFloorId?: string;
      notes?: string;
      lines: { skuId: string; requestedQty: number; notes?: string }[];
    };

    const referenceNumber = `ST-${Date.now().toString(36).toUpperCase()}`;

    const transfer = await prisma.stockTransfer.create({
      data: {
        referenceNumber,
        fromBranchId,
        toBranchId,
        fromFloorId,
        toFloorId,
        notes,
        requestedBy: req.user!.id,
        lines: {
          create: lines.map(l => ({
            skuId: l.skuId,
            requestedQty: l.requestedQty,
            notes: l.notes,
          })),
        },
      },
      include: { lines: true },
    });
    res.status(201).json({ success: true, data: transfer });
  }
);

router.put(
  '/:id/approve',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params!.id } });
    if (!transfer) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (transfer.status !== 'Draft' && transfer.status !== 'Pending') {
      res.status(400).json({ error: 'Only Draft or Pending transfers can be approved' });
      return;
    }
    const updated = await prisma.stockTransfer.update({
      where: { id: req.params!.id },
      data: {
        status: 'Approved',
        approvedBy: req.user!.id,
        approvedAt: new Date(),
      },
    });
    res.json({ success: true, data: updated });
  }
);

router.put(
  '/:id/complete',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params!.id } });
    if (!transfer) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (transfer.status !== 'Approved' && transfer.status !== 'InTransit') {
      res.status(400).json({ error: 'Only Approved or InTransit transfers can be completed' });
      return;
    }
    const updated = await prisma.stockTransfer.update({
      where: { id: req.params!.id },
      data: { status: 'Completed', completedAt: new Date() },
    });
    res.json({ success: true, data: updated });
  }
);

router.put(
  '/:id/cancel',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params!.id } });
    if (!transfer) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (transfer.status === 'Completed') {
      res.status(400).json({ error: 'Cannot cancel a completed transfer' });
      return;
    }
    const updated = await prisma.stockTransfer.update({
      where: { id: req.params!.id },
      data: { status: 'Cancelled' },
    });
    res.json({ success: true, data: updated });
  }
);

export default router;
