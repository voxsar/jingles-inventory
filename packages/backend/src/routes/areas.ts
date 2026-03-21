import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', [query('locationId').optional().isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const where: Record<string, unknown> = { isActive: true };
  if (req.query?.locationId) where.locationId = req.query.locationId as string;
  const areas = await prisma.area.findMany({
    where,
    include: { location: true, shelves: { where: { isActive: true } }, boxes: { where: { isActive: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(areas);
});

router.get('/:id', [param('id').isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const area = await prisma.area.findUnique({
    where: { id: req.params!.id },
    include: {
      location: true,
      shelves: { where: { isActive: true }, include: { boxes: { where: { isActive: true }, include: { barcodes: true } } } },
      boxes: { where: { isActive: true }, include: { barcodes: true } },
    },
  });
  if (!area) {
    res.status(404).json({ error: 'Area not found' });
    return;
  }
  res.json(area);
});

router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [body('locationId').isUUID(), body('name').notEmpty(), body('code').notEmpty()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { locationId, name, code, description } = req.body;
    const area = await prisma.area.create({
      data: { locationId, name, code, description },
    });
    res.status(201).json(area);
  }
);

router.put(
  '/:id',
  requireRole('Admin', 'Manager'),
  [
    param('id').isUUID(),
    body('name').optional().notEmpty(),
    body('code').optional().notEmpty(),
    body('description').optional().isString(),
    body('isActive').optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, code, description, isActive } = req.body;
    const area = await prisma.area.update({
      where: { id: req.params!.id },
      data: { name, code, description, isActive },
    });
    res.json(area);
  }
);

export default router;
