import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  [query('shelfId').optional().isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const where: Record<string, unknown> = { isActive: true };
    if (req.query?.shelfId) where.shelfId = req.query.shelfId as string;
    const boxes = await prisma.storageBox.findMany({
      where,
      include: { barcodes: true, shelf: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(boxes);
  }
);

router.get('/:id', [param('id').isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const box = await prisma.storageBox.findUnique({
    where: { id: req.params!.id },
    include: { barcodes: true, shelf: true },
  });
  if (!box) {
    res.status(404).json({ error: 'Box not found' });
    return;
  }
  res.json(box);
});

router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('shelfId').isUUID(),
    body('name').notEmpty(),
    body('code').notEmpty(),
    body('height').isFloat({ gt: 0 }),
    body('width').isFloat({ gt: 0 }),
    body('length').isFloat({ gt: 0 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { shelfId, name, code, height, width, length } = req.body;
    const box = await prisma.storageBox.create({
      data: { shelfId, name, code, height, width, length },
      include: { barcodes: true },
    });
    res.status(201).json(box);
  }
);

router.put(
  '/:id',
  requireRole('Admin', 'Manager'),
  [
    param('id').isUUID(),
    body('name').optional().notEmpty(),
    body('code').optional().notEmpty(),
    body('isActive').optional().isBoolean(),
    body('shelfId').optional().isUUID(),
    body('height').optional().isFloat({ gt: 0 }),
    body('width').optional().isFloat({ gt: 0 }),
    body('length').optional().isFloat({ gt: 0 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, code, height, width, length, shelfId, isActive } = req.body;
    const box = await prisma.storageBox.update({
      where: { id: req.params!.id },
      data: { name, code, height, width, length, shelfId, isActive },
      include: { barcodes: true },
    });
    res.json(box);
  }
);

// Barcode management for boxes
router.get(
  '/:id/barcodes',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const barcodes = await prisma.boxBarcode.findMany({ where: { boxId: req.params!.id } });
    res.json(barcodes);
  }
);

router.post(
  '/:id/barcodes',
  requireRole('Admin', 'Manager'),
  [
    param('id').isUUID(),
    body('barcode').notEmpty(),
    body('barcodeType').optional().isString(),
    body('isDefault').optional().isBoolean(),
    body('label').optional().isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { barcode, barcodeType, isDefault, label } = req.body;
    const boxBarcode = await prisma.boxBarcode.create({
      data: {
        boxId: req.params!.id,
        barcode,
        barcodeType: barcodeType ?? 'EAN13',
        isDefault: isDefault ?? false,
        label,
      },
    });
    res.status(201).json(boxBarcode);
  }
);

router.delete(
  '/:id/barcodes/:barcodeId',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), param('barcodeId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    await prisma.boxBarcode.delete({ where: { id: req.params!.barcodeId } });
    res.status(204).send();
  }
);

export default router;
