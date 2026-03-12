import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, supplierId } = req.query as { status?: string; supplierId?: string };
  const grns = await prisma.gRN.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
    },
    include: { supplier: true, creator: true, lines: { include: { sku: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(grns);
});

router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const grn = await prisma.gRN.findUnique({
      where: { id: req.params!.id },
      include: {
        supplier: true,
        creator: true,
        lines: { include: { sku: true, inspectionRecords: true } },
      },
    });
    if (!grn) {
      res.status(404).json({ error: 'GRN not found' });
      return;
    }
    res.json(grn);
  }
);

router.post(
  '/',
  requireRole('Admin', 'Manager', 'Staff'),
  [body('supplierId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const {
      supplierId,
      invoiceReference,
      supplierInvoiceDate,
      expectedDeliveryDate,
      notes,
      lines,
    } = req.body as {
      supplierId: string;
      invoiceReference?: string;
      supplierInvoiceDate?: string;
      expectedDeliveryDate?: string;
      notes?: string;
      lines?: Array<{ skuId: string; expectedQuantity: number; batchReference?: string; notes?: string }>;
    };

    const grn = await prisma.gRN.create({
      data: {
        supplierId,
        invoiceReference,
        supplierInvoiceDate: supplierInvoiceDate ? new Date(supplierInvoiceDate) : undefined,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
        notes,
        createdBy: req.user!.id,
        lines: lines
          ? {
              create: lines.map((l) => ({
                skuId: l.skuId,
                expectedQuantity: l.expectedQuantity,
                batchReference: l.batchReference,
                notes: l.notes,
              })),
            }
          : undefined,
      },
      include: { lines: true },
    });
    res.status(201).json(grn);
  }
);

router.put(
  '/:id/status',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), body('status').notEmpty()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { status } = req.body as { status: string };
    const grn = await prisma.gRN.update({
      where: { id: req.params!.id },
      data: { status },
    });
    res.json(grn);
  }
);

export default router;
