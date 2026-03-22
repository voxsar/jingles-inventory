import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/racks?floorId=<uuid>
router.get(
  '/',
  [query('floorId').optional().isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const where: Record<string, unknown> = { isActive: true };
    if (req.query?.floorId) where.floorId = req.query.floorId as string;
    const racks = await prisma.rack.findMany({
      where,
      include: {
        floor: { include: { branch: { select: { id: true, name: true } } } },
        shelves: {
          where: { isActive: true },
          include: { boxes: { where: { isActive: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(racks);
  }
);

// GET /api/racks/:id
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const rack = await prisma.rack.findUnique({
      where: { id: req.params!.id },
      include: {
        floor: { include: { branch: { select: { id: true, name: true } } } },
        shelves: {
          where: { isActive: true },
          include: { boxes: { where: { isActive: true }, include: { barcodes: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!rack) {
      res.status(404).json({ error: 'Rack not found' });
      return;
    }
    res.json(rack);
  }
);

// POST /api/racks
router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('floorId').isUUID(),
    body('name').notEmpty(),
    body('code').notEmpty(),
    body('widthCm').optional().isFloat({ gt: 0 }),
    body('heightCm').optional().isFloat({ gt: 0 }),
    body('depthCm').optional().isFloat({ gt: 0 }),
    body('notes').optional().isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { floorId, name, code, widthCm, heightCm, depthCm, notes } = req.body;
    const rack = await prisma.rack.create({
      data: {
        floorId,
        name,
        code,
        widthCm: widthCm ?? null,
        heightCm: heightCm ?? null,
        depthCm: depthCm ?? null,
        notes: notes ?? null,
      },
    });
    res.status(201).json(rack);
  }
);

// PUT /api/racks/:id  – update metadata AND / OR 3-D position
router.put(
  '/:id',
  requireRole('Admin', 'Manager'),
  [
    param('id').isUUID(),
    body('name').optional().notEmpty(),
    body('code').optional().notEmpty(),
    body('isActive').optional().isBoolean(),
    body('notes').optional().isString(),
    body('widthCm').optional().isFloat({ gt: 0 }),
    body('heightCm').optional().isFloat({ gt: 0 }),
    body('depthCm').optional().isFloat({ gt: 0 }),
    // 3-D position / rotation
    body('posX').optional().isFloat(),
    body('posZ').optional().isFloat(),
    body('rotY').optional().isFloat(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, code, isActive, notes, widthCm, heightCm, depthCm, posX, posZ, rotY } = req.body;
    const rack = await prisma.rack.update({
      where: { id: req.params!.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(isActive !== undefined && { isActive }),
        ...(notes !== undefined && { notes }),
        ...(widthCm !== undefined && { widthCm }),
        ...(heightCm !== undefined && { heightCm }),
        ...(depthCm !== undefined && { depthCm }),
        ...(posX !== undefined && { posX }),
        ...(posZ !== undefined && { posZ }),
        ...(rotY !== undefined && { rotY }),
      },
    });
    res.json(rack);
  }
);

// DELETE /api/racks/:id  – soft delete
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
    const rack = await prisma.rack.update({
      where: { id: req.params!.id },
      data: { isActive: false },
    });
    res.json({ success: true, data: rack });
  }
);

export default router;
