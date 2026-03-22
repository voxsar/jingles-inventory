import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', [query('areaId').optional().isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const where: Record<string, unknown> = { isActive: true };
  if (req.query?.areaId) where.areaId = req.query.areaId as string;
  const shelves = await prisma.shelf.findMany({
    where,
    include: { area: true, boxes: { where: { isActive: true }, include: { barcodes: true } } },
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
    include: { area: true, boxes: { where: { isActive: true }, include: { barcodes: true } } },
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
    body('areaId').isUUID(),
    body('name').notEmpty(),
    body('code').notEmpty(),
    body('height').isFloat({ gt: 0 }),
    body('width').isFloat({ gt: 0 }),
    body('length').isFloat({ gt: 0 }),
    body('rotationAngle').optional().isFloat({ min: 0, max: 360 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { areaId, name, code, height, width, length, rotationAngle } = req.body;
    const shelf = await prisma.shelf.create({
      data: { areaId, name, code, height, width, length, rotationAngle: rotationAngle ?? 0 },
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
    body('rotationAngle').optional().isFloat({ min: 0, max: 360 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, code, height, width, length, rotationAngle, isActive } = req.body;
    const shelf = await prisma.shelf.update({
      where: { id: req.params!.id },
      data: { name, code, height, width, length, rotationAngle, isActive },
    });
    res.json(shelf);
  }
);

export default router;
