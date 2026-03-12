import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const vendors = await prisma.vendor.findMany({ where: { isActive: true } });
  res.json(vendors);
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
    const vendor = await prisma.vendor.findUnique({ where: { id: req.params!.id } });
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    res.json(vendor);
  }
);

router.post(
  '/',
  requireRole('Admin'),
  [
    body('name').notEmpty(),
    body('contactEmail').isEmail(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, contactEmail, contactPhone, address } = req.body as {
      name: string;
      contactEmail: string;
      contactPhone?: string;
      address?: string;
    };
    const vendor = await prisma.vendor.create({
      data: { name, contactEmail, contactPhone, address },
    });
    res.status(201).json(vendor);
  }
);

router.put(
  '/:id',
  requireRole('Admin'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, contactEmail, contactPhone, address, isActive } = req.body as {
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      isActive?: boolean;
    };
    const vendor = await prisma.vendor.update({
      where: { id: req.params!.id },
      data: { name, contactEmail, contactPhone, address, isActive },
    });
    res.json(vendor);
  }
);

export default router;
