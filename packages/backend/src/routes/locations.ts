import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const locations = await prisma.location.findMany({ where: { isActive: true } });
  res.json(locations);
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
    const location = await prisma.location.findUnique({ where: { id: req.params!.id } });
    if (!location) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }
    res.json(location);
  }
);

router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('floor').notEmpty(),
    body('section').notEmpty(),
    body('shelf').notEmpty(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { floor, section, shelf, zone, capacityCubicCm, notes } = req.body as {
      floor: string;
      section: string;
      shelf: string;
      zone?: string;
      capacityCubicCm?: number;
      notes?: string;
    };
    const location = await prisma.location.create({
      data: { floor, section, shelf, zone, capacityCubicCm, notes },
    });
    res.status(201).json(location);
  }
);

router.put(
  '/:id',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const location = await prisma.location.update({
      where: { id: req.params!.id },
      data: req.body,
    });
    res.json(location);
  }
);

export default router;
