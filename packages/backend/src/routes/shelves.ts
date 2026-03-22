import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', [query('floorId').optional().isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const where: Record<string, unknown> = { isActive: true };
  if (req.query?.floorId) where.floorId = req.query.floorId as string;
  const shelves = await prisma.shelf.findMany({
    where,
    include: { floor: { include: { branch: { select: { id: true, name: true } } } }, boxes: { where: { isActive: true }, include: { barcodes: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(shelves);
});

router.get('/:id', [param('id').isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const shelf = await prisma.shelf.findUnique({
    where: { id: req.params!.id },
    include: {
      floor: { include: { branch: { select: { id: true, name: true } } } },
      boxes: { where: { isActive: true }, include: { barcodes: true } },
    },
  });
  if (!shelf) {
    res.status(404).json({ error: 'Shelf not found' });
    return;
  }
  res.json(shelf);
});

router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('floorId').isUUID(),
    body('name').notEmpty(),
    body('code').notEmpty(),
    body('height').isFloat({ gt: 0 }),
    body('width').isFloat({ gt: 0 }),
    body('length').isFloat({ gt: 0 }),
    body('hasFreezer').optional().isBoolean(),
    body('hasLock').optional().isBoolean(),
    body('notes').optional().isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { floorId, name, code, height, width, length, hasFreezer, hasLock, notes } = req.body;
    const shelf = await prisma.shelf.create({
      data: {
        floorId,
        name,
        code,
        height,
        width,
        length,
        hasFreezer: hasFreezer ?? false,
        hasLock: hasLock ?? false,
        notes,
      },
    });
    res.status(201).json(shelf);
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
    body('height').optional().isFloat({ gt: 0 }),
    body('width').optional().isFloat({ gt: 0 }),
    body('length').optional().isFloat({ gt: 0 }),
    body('hasFreezer').optional().isBoolean(),
    body('hasLock').optional().isBoolean(),
    body('notes').optional().isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, code, height, width, length, hasFreezer, hasLock, notes, isActive } = req.body;
    const shelf = await prisma.shelf.update({
      where: { id: req.params!.id },
      data: { name, code, height, width, length, hasFreezer, hasLock, notes, isActive },
    });
    res.json(shelf);
  }
);

export default router;
