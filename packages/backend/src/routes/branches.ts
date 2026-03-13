import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const branches = await prisma.branch.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { locations: true } } },
  });
  res.json({ success: true, data: branches });
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
    const branch = await prisma.branch.findUnique({
      where: { id: req.params!.id },
      include: { locations: true },
    });
    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }
    res.json({ success: true, data: branch });
  }
);

router.post(
  '/',
  requireRole('Admin'),
  [
    body('name').notEmpty().trim(),
    body('code').notEmpty().trim(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, code, address, phone, email, isDefault } = req.body as {
      name: string;
      code: string;
      address?: string;
      phone?: string;
      email?: string;
      isDefault?: boolean;
    };
    if (isDefault) {
      await prisma.branch.updateMany({ data: { isDefault: false } });
    }
    const branch = await prisma.branch.create({
      data: { name, code, address, phone, email, isDefault: isDefault ?? false },
    });
    res.status(201).json({ success: true, data: branch });
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
    const { name, code, address, phone, email, isActive, isDefault } = req.body as {
      name?: string;
      code?: string;
      address?: string;
      phone?: string;
      email?: string;
      isActive?: boolean;
      isDefault?: boolean;
    };
    if (isDefault) {
      await prisma.branch.updateMany({ where: { id: { not: req.params!.id } }, data: { isDefault: false } });
    }
    const branch = await prisma.branch.update({
      where: { id: req.params!.id },
      data: { name, code, address, phone, email, isActive, isDefault },
    });
    res.json({ success: true, data: branch });
  }
);

export default router;
