import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getPagination, paginatedPayload } from '../utils/pagination';

const router = Router();

router.use(authenticate);

async function validateBoxLocation(input: {
  id?: string;
  shelfId?: string | null;
  floorId?: string | null;
  parentBoxId?: string | null;
  width?: number;
  height?: number;
  length?: number;
  posX?: number | null;
  posY?: number | null;
  posZ?: number | null;
  rotationAngle?: number | null;
}) {
  if (!input.shelfId && !input.floorId) return 'Either shelfId or floorId must be provided';
  const shelf = input.shelfId ? await prisma.shelf.findUnique({ where: { id: input.shelfId }, include: { floor: true } }) : null;
  const floor = shelf?.floor ?? (input.floorId ? await prisma.floor.findUnique({ where: { id: input.floorId } }) : null);
  if (input.shelfId && !shelf) return 'Shelf not found';
  if (!floor) return 'Floor not found';
  if (shelf && input.floorId && shelf.floorId !== input.floorId) return 'Shelf and floor must belong to the same location';
  if (input.parentBoxId) {
    if (input.parentBoxId === input.id) return 'A box cannot be its own parent';
    const parent = await prisma.storageBox.findUnique({ where: { id: input.parentBoxId } });
    if (!parent || !parent.isActive) return 'Parent box not found';
    if (input.shelfId
      ? parent.shelfId !== input.shelfId
      : parent.shelfId != null || parent.floorId !== input.floorId
    ) return 'Parent box must be in the same location';
    if (input.id && parent.parentBoxId === input.id) return 'Box stacking cannot contain a cycle';
  }
  if (input.posX != null || input.posZ != null) {
    const radians = ((input.rotationAngle ?? 0) * Math.PI) / 180;
    const widthM = (input.width ?? 40) / 100;
    const depthM = (input.length ?? 40) / 100;
    const halfX = Math.abs(Math.cos(radians)) * widthM / 2 + Math.abs(Math.sin(radians)) * depthM / 2;
    const halfZ = Math.abs(Math.sin(radians)) * widthM / 2 + Math.abs(Math.cos(radians)) * depthM / 2;
    const areaWidth = shelf ? shelf.width / 100 : floor.length ?? null;
    const areaDepth = shelf ? shelf.length / 100 : floor.width ?? null;
    if (areaWidth && Math.abs(input.posX ?? 0) + halfX > areaWidth / 2) return 'Box would extend beyond its parent width';
    if (areaDepth && Math.abs(input.posZ ?? 0) + halfZ > areaDepth / 2) return 'Box would extend beyond its parent depth';
  }
  if (input.posY != null && input.posY < (input.height ?? 40) / 200) return 'Box position would place it below the supporting surface';
  return null;
}

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
    if (req.query?.rackId) where.shelf = { rackId: req.query.rackId as string };
    const pagination = getPagination(req.query);
    if (pagination.isPaginated) {
      const [items, total] = await Promise.all([
        prisma.storageBox.findMany({
          where,
          skip: pagination.skip,
          take: pagination.take,
          include: { barcodes: true, shelf: true, floor: true },
          orderBy: [{ stackOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.storageBox.count({ where }),
      ]);
      res.json({ success: true, data: paginatedPayload(items, total, pagination.page, pagination.pageSize) });
      return;
    }

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
    body('posX').optional({ nullable: true }).isFloat(),
    body('posY').optional({ nullable: true }).isFloat(),
    body('posZ').optional({ nullable: true }).isFloat(),
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

    const placementError = await validateBoxLocation({ shelfId, floorId, parentBoxId, width, height, length, posX, posY, posZ, rotationAngle });
    if (placementError) {
	      res.status(400).json({ error: placementError });
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
    body('posX').optional({ nullable: true }).isFloat(),
    body('posY').optional({ nullable: true }).isFloat(),
    body('posZ').optional({ nullable: true }).isFloat(),
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
    const existing = await prisma.storageBox.findUnique({ where: { id: req.params!.id } });
    if (!existing) {
      res.status(404).json({ error: 'Box not found' });
      return;
    }
    const placementError = await validateBoxLocation({
      id: existing.id,
      shelfId: shelfId !== undefined ? shelfId : existing.shelfId,
      floorId: floorId !== undefined ? floorId : existing.floorId,
      parentBoxId: parentBoxId !== undefined ? parentBoxId : existing.parentBoxId,
      width: width ?? existing.width,
      height: height ?? existing.height,
      length: length ?? existing.length,
      posX: posX !== undefined ? posX : existing.posX,
      posY: posY !== undefined ? posY : existing.posY,
      posZ: posZ !== undefined ? posZ : existing.posZ,
      rotationAngle: rotationAngle ?? existing.rotationAngle,
    });
    if (placementError) {
      res.status(400).json({ error: placementError });
      return;
    }
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

router.delete(
  '/:id',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const boxId = req.params!.id;
    const box = await prisma.storageBox.findUnique({ where: { id: boxId } });
    if (!box) {
      res.status(404).json({ error: 'Box not found' });
      return;
    }
    await prisma.$transaction([
      prisma.inventoryRecord.updateMany({ where: { boxId }, data: { boxId: null } }),
      prisma.storageBox.updateMany({ where: { parentBoxId: boxId }, data: { parentBoxId: null, stackOrder: 0 } }),
      prisma.storageBox.update({ where: { id: boxId }, data: { isActive: false } }),
    ]);
    res.json({ success: true });
  }
);

export default router;
