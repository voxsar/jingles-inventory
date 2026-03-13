import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/units', async (_req, res: Response): Promise<void> => {
  const units = await prisma.unitOfMeasureModel.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: units });
});

router.post(
  '/units',
  requireRole('Admin'),
  [
    body('name').notEmpty().trim(),
    body('abbreviation').notEmpty().trim(),
    body('type').notEmpty(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, abbreviation, baseUnit, conversionFactor, type } = req.body as {
      name: string;
      abbreviation: string;
      baseUnit?: string;
      conversionFactor?: number;
      type: string;
    };
    const existing = await prisma.unitOfMeasureModel.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: 'A unit with this name already exists' });
      return;
    }
    const unit = await prisma.unitOfMeasureModel.create({
      data: { name, abbreviation, baseUnit, conversionFactor, type },
    });
    res.status(201).json({ success: true, data: unit });
  }
);

router.put(
  '/units/:id',
  requireRole('Admin'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const existing = await prisma.unitOfMeasureModel.findUnique({ where: { id: req.params!.id } });
    if (!existing) {
      res.status(404).json({ error: 'Unit not found' });
      return;
    }
    if (existing.isSystem) {
      res.status(403).json({ error: 'Cannot modify system units' });
      return;
    }
    const unit = await prisma.unitOfMeasureModel.update({
      where: { id: req.params!.id },
      data: req.body,
    });
    res.json({ success: true, data: unit });
  }
);

router.delete(
  '/units/:id',
  requireRole('Admin'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const existing = await prisma.unitOfMeasureModel.findUnique({ where: { id: req.params!.id } });
    if (!existing) {
      res.status(404).json({ error: 'Unit not found' });
      return;
    }
    if (existing.isSystem) {
      res.status(403).json({ error: 'Cannot delete system units' });
      return;
    }
    await prisma.unitOfMeasureModel.delete({ where: { id: req.params!.id } });
    res.json({ success: true, message: 'Unit deleted' });
  }
);

export default router;
