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

// ── Status Options ────────────────────────────────────────

const VALID_ENTITY_TYPES = ['inventory', 'product', 'location', 'branch', 'supplier', 'grn', 'stock_transfer', 'damage_classification', 'vendor_type'];

router.get('/statuses', async (req: AuthRequest, res: Response): Promise<void> => {
  const { entityType } = req.query as { entityType?: string };
  const where: any = { isActive: true };
  if (entityType) where.entityType = entityType;
  const statuses = await prisma.statusOption.findMany({
    where,
    orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
  });
  res.json({ success: true, data: statuses });
});

router.post(
  '/statuses',
  requireRole('Admin'),
  [
    body('entityType').notEmpty().isIn(VALID_ENTITY_TYPES),
    body('value').notEmpty().trim(),
    body('label').notEmpty().trim(),
    body('color').optional({ nullable: true }).isString(),
    body('sortOrder').optional({ nullable: true }).isInt({ min: 0 }),
    body('isDefault').optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { entityType, value, label, color, sortOrder, isDefault } = req.body as {
      entityType: string;
      value: string;
      label: string;
      color?: string;
      sortOrder?: number;
      isDefault?: boolean;
    };
    const existing = await prisma.statusOption.findUnique({ where: { entityType_value: { entityType, value } } });
    if (existing) {
      res.status(409).json({ error: 'A status with this value already exists for this entity type' });
      return;
    }
    const status = await prisma.statusOption.create({
      data: { entityType, value, label, color, sortOrder: sortOrder ?? 0, isDefault: isDefault ?? false },
    });
    res.status(201).json({ success: true, data: status });
  }
);

router.put(
  '/statuses/:id',
  requireRole('Admin'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const existing = await prisma.statusOption.findUnique({ where: { id: req.params!.id } });
    if (!existing) {
      res.status(404).json({ error: 'Status option not found' });
      return;
    }
    const { label, color, sortOrder, isDefault, isActive } = req.body as {
      label?: string;
      color?: string;
      sortOrder?: number;
      isDefault?: boolean;
      isActive?: boolean;
    };
    const status = await prisma.statusOption.update({
      where: { id: req.params!.id },
      data: { label, color, sortOrder, isDefault, isActive },
    });
    res.json({ success: true, data: status });
  }
);

router.delete(
  '/statuses/:id',
  requireRole('Admin'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const existing = await prisma.statusOption.findUnique({ where: { id: req.params!.id } });
    if (!existing) {
      res.status(404).json({ error: 'Status option not found' });
      return;
    }
    await prisma.statusOption.delete({ where: { id: req.params!.id } });
    res.json({ success: true, message: 'Status option deleted' });
  }
);

export default router;
