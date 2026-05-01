import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const lineInclude = {
  sku: { select: { id: true, skuCode: true, name: true } },
  variant: { select: { id: true, variantCode: true, name: true } },
  batch: { select: { id: true, batchNumber: true, costPrice: true, sellingPrice: true } },
};

router.get(
  '/',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const {
      status,
      fromBranchId,
      toBranchId,
      fromFloorId,
      toFloorId,
      search,
      requestedFrom,
      requestedTo,
      page = '1',
      pageSize = '20',
    } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const where: Prisma.StockTransferWhereInput = {};
    if (status) where.status = status;
    if (fromBranchId) where.fromBranchId = fromBranchId;
    if (toBranchId) where.toBranchId = toBranchId;
    if (fromFloorId) where.fromFloorId = fromFloorId;
    if (toFloorId) where.toFloorId = toFloorId;
    if (search) {
      where.OR = [
        { referenceNumber: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { fromBranch: { name: { contains: search, mode: 'insensitive' } } },
        { toBranch: { name: { contains: search, mode: 'insensitive' } } },
        { requester: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (requestedFrom || requestedTo) {
      where.requestedAt = {};
      if (requestedFrom) where.requestedAt.gte = new Date(requestedFrom);
      if (requestedTo) {
        const end = new Date(requestedTo);
        end.setHours(23, 59, 59, 999);
        where.requestedAt.lte = end;
      }
    }

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
          lines: { include: lineInclude },
        },
      }),
      prisma.stockTransfer.count({ where }),
    ]);

    res.json({
      success: true,
      data: { items, total, page: parseInt(page), pageSize: parseInt(pageSize), totalPages: Math.ceil(total / parseInt(pageSize)) },
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
        lines: { include: lineInclude },
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
    body('lines.*.variantId').optional({ nullable: true }).if(body('lines.*.variantId').notEmpty()).isUUID(),
    body('lines.*.batchId').optional({ nullable: true }).if(body('lines.*.batchId').notEmpty()).isUUID(),
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
      lines: { skuId: string; variantId?: string; batchId?: string; requestedQty: number; notes?: string }[];
    };

    // Cross-field validation: ensure variant belongs to SKU, batch belongs to SKU/variant
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.variantId) {
        const variant = await prisma.sKUVariant.findFirst({ where: { id: l.variantId, skuId: l.skuId } });
        if (!variant) {
          res.status(400).json({ error: `Line ${i + 1}: variant does not belong to the specified SKU` });
          return;
        }
      }
      if (l.batchId) {
        const batch = await prisma.batch.findFirst({
          where: {
            id: l.batchId,
            skuId: l.skuId,
            ...(l.variantId ? { variantId: l.variantId } : {}),
          },
        });
        if (!batch) {
          res.status(400).json({ error: `Line ${i + 1}: batch does not match the specified SKU/variant` });
          return;
        }
      }
    }

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
            variantId: l.variantId || undefined,
            batchId: l.batchId || undefined,
            requestedQty: l.requestedQty,
            notes: l.notes,
          })),
        },
      },
      include: { lines: { include: lineInclude } },
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
