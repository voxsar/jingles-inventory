import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const VALID_TYPES = ['dropdown', 'text', 'numeric', 'boolean', 'color'];

// ── Attributes CRUD ──────────────────────────────────────────────────────────

router.get('/', async (_req, res: Response): Promise<void> => {
  const attributes = await prisma.attribute.findMany({
    where: { isActive: true },
    include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: attributes });
});

router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('name').notEmpty().trim(),
    body('type').notEmpty().isIn(VALID_TYPES),
    body('sortOrder').optional({ nullable: true }).isInt({ min: 0 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, type, sortOrder } = req.body as { name: string; type: string; sortOrder?: number };
    const existing = await prisma.attribute.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: 'An attribute with this name already exists' });
      return;
    }
    const attribute = await prisma.attribute.create({
      data: { name, type, sortOrder: sortOrder ?? 0 },
      include: { values: true },
    });
    res.status(201).json({ success: true, data: attribute });
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
    const existing = await prisma.attribute.findUnique({ where: { id: req.params!.id } });
    if (!existing) {
      res.status(404).json({ error: 'Attribute not found' });
      return;
    }
    const { name, type, sortOrder, isActive } = req.body as {
      name?: string;
      type?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    if (type && !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: 'Invalid attribute type' });
      return;
    }
    const attribute = await prisma.attribute.update({
      where: { id: req.params!.id },
      data: { name, type, sortOrder, isActive },
      include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    res.json({ success: true, data: attribute });
  }
);

router.delete(
  '/:id',
  requireRole('Admin'),
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const existing = await prisma.attribute.findUnique({ where: { id: req.params!.id } });
    if (!existing) {
      res.status(404).json({ error: 'Attribute not found' });
      return;
    }
    // Check if attribute is in use by any SKU attribute
    const inUse = await prisma.sKUAttribute.count({ where: { attributeId: req.params!.id } });
    if (inUse > 0) {
      res.status(409).json({ error: 'Cannot delete attribute that is assigned to products' });
      return;
    }
    await prisma.attribute.delete({ where: { id: req.params!.id } });
    res.json({ success: true, message: 'Attribute deleted' });
  }
);

// ── Attribute Values ─────────────────────────────────────────────────────────

router.get('/:id/values', [param('id').isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const attribute = await prisma.attribute.findUnique({ where: { id: req.params!.id } });
  if (!attribute) {
    res.status(404).json({ error: 'Attribute not found' });
    return;
  }
  const values = await prisma.attributeValue.findMany({
    where: { attributeId: req.params!.id, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
  });
  res.json({ success: true, data: values });
});

router.post(
  '/:id/values',
  requireRole('Admin', 'Manager'),
  [
    param('id').isUUID(),
    body('displayName').notEmpty().trim(),
    body('representedValue').notEmpty().trim(),
    body('sortOrder').optional({ nullable: true }).isInt({ min: 0 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const attribute = await prisma.attribute.findUnique({ where: { id: req.params!.id } });
    if (!attribute) {
      res.status(404).json({ error: 'Attribute not found' });
      return;
    }
    const { displayName, representedValue, sortOrder } = req.body as {
      displayName: string;
      representedValue: string;
      sortOrder?: number;
    };
    const existing = await prisma.attributeValue.findUnique({
      where: { attributeId_representedValue: { attributeId: req.params!.id, representedValue } },
    });
    if (existing) {
      res.status(409).json({ error: 'This represented value already exists for this attribute' });
      return;
    }
    const attrValue = await prisma.attributeValue.create({
      data: { attributeId: req.params!.id, displayName, representedValue, sortOrder: sortOrder ?? 0 },
    });
    res.status(201).json({ success: true, data: attrValue });
  }
);

router.put(
  '/:id/values/:valueId',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), param('valueId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const existing = await prisma.attributeValue.findFirst({
      where: { id: req.params!.valueId, attributeId: req.params!.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Attribute value not found' });
      return;
    }
    const { displayName, representedValue, sortOrder, isActive } = req.body as {
      displayName?: string;
      representedValue?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    const attrValue = await prisma.attributeValue.update({
      where: { id: req.params!.valueId },
      data: { displayName, representedValue, sortOrder, isActive },
    });
    res.json({ success: true, data: attrValue });
  }
);

router.delete(
  '/:id/values/:valueId',
  requireRole('Admin'),
  [param('id').isUUID(), param('valueId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const existing = await prisma.attributeValue.findFirst({
      where: { id: req.params!.valueId, attributeId: req.params!.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Attribute value not found' });
      return;
    }
    // Check if this value is used in any variant
    const inUse = await prisma.sKUVariantValue.count({ where: { attributeValueId: req.params!.valueId } });
    if (inUse > 0) {
      res.status(409).json({ error: 'Cannot delete attribute value that is used by existing variants' });
      return;
    }
    await prisma.attributeValue.delete({ where: { id: req.params!.valueId } });
    res.json({ success: true, message: 'Attribute value deleted' });
  }
);

export default router;
