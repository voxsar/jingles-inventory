import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  [
    query('shelfId').optional().isUUID(),
    query('floorId').optional().isUUID(),
    query('rackId').optional().isUUID(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const where: Record<string, unknown> = { isActive: true };
    if (req.query?.shelfId) where.shelfId = req.query.shelfId as string;
    if (req.query?.floorId) where.floorId = req.query.floorId as string;
    const boxes = await prisma.storageBox.findMany({
      where,
      include: { barcodes: true, shelf: true, floor: true },
      orderBy: [{ stackOrder: 'asc' }, { createdAt: 'asc' }],
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
    include: {
      barcodes: true,
      shelf: true,
      floor: true,
      stackedBoxes: { where: { isActive: true }, orderBy: { stackOrder: 'asc' } },
    },
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
    // Either shelfId OR floorId is required
    body('shelfId').optional({ nullable: true }).if(body('shelfId').notEmpty()).isUUID(),
    body('floorId').optional({ nullable: true }).if(body('floorId').notEmpty()).isUUID(),
    body('name').notEmpty(),
    body('code').notEmpty(),
    body('height').isFloat({ gt: 0 }),
    body('width').isFloat({ gt: 0 }),
    body('length').isFloat({ gt: 0 }),
    body('posX').optional().isFloat(),
    body('posY').optional().isFloat(),
    body('posZ').optional().isFloat(),
    body('rotationAngle').optional().isFloat(),
    body('stackOrder').optional().isInt({ min: 0 }),
    body('parentBoxId').optional({ nullable: true }).if(body('parentBoxId').notEmpty()).isUUID(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const {
      shelfId, floorId, name, code, height, width, length,
      posX, posY, posZ, rotationAngle, stackOrder, parentBoxId,
    } = req.body;

    if (!shelfId && !floorId) {
      res.status(400).json({ error: 'Either shelfId or floorId must be provided' });
      return;
    }

    const box = await prisma.storageBox.create({
      data: {
        shelfId: shelfId ?? null,
        floorId: floorId ?? null,
        name,
        code,
        height,
        width,
        length,
        posX: posX ?? null,
        posY: posY ?? null,
        posZ: posZ ?? null,
        rotationAngle: rotationAngle ?? 0,
        stackOrder: stackOrder ?? 0,
        parentBoxId: parentBoxId ?? null,
      },
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
    body('shelfId').optional({ nullable: true }).if(body('shelfId').notEmpty()).isUUID(),
    body('floorId').optional({ nullable: true }).if(body('floorId').notEmpty()).isUUID(),
    body('height').optional().isFloat({ gt: 0 }),
    body('width').optional().isFloat({ gt: 0 }),
    body('length').optional().isFloat({ gt: 0 }),
    body('posX').optional().isFloat(),
    body('posY').optional().isFloat(),
    body('posZ').optional().isFloat(),
    body('rotationAngle').optional().isFloat(),
    body('stackOrder').optional().isInt({ min: 0 }),
    body('parentBoxId').optional({ nullable: true }).if(body('parentBoxId').notEmpty()).isUUID(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const {
      name, code, height, width, length, shelfId, floorId, isActive,
      posX, posY, posZ, rotationAngle, stackOrder, parentBoxId,
    } = req.body;
    const box = await prisma.storageBox.update({
      where: { id: req.params!.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(height !== undefined && { height }),
        ...(width !== undefined && { width }),
        ...(length !== undefined && { length }),
        ...(shelfId !== undefined && { shelfId }),
        ...(floorId !== undefined && { floorId }),
        ...(isActive !== undefined && { isActive }),
        ...(posX !== undefined && { posX }),
        ...(posY !== undefined && { posY }),
        ...(posZ !== undefined && { posZ }),
        ...(rotationAngle !== undefined && { rotationAngle }),
        ...(stackOrder !== undefined && { stackOrder }),
        ...(parentBoxId !== undefined && { parentBoxId }),
      },
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
