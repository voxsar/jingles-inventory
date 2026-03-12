import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { vendorId, category, isActive } = req.query as {
    vendorId?: string;
    category?: string;
    isActive?: string;
  };

  const skus = await prisma.sKU.findMany({
    where: {
      ...(vendorId ? { vendorId } : {}),
      ...(category ? { category } : {}),
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    },
    include: { vendor: true },
  });
  res.json(skus);
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
    const sku = await prisma.sKU.findUnique({
      where: { id: req.params!.id },
      include: { vendor: true },
    });
    if (!sku) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }
    res.json(sku);
  }
);

router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('skuCode').notEmpty(),
    body('name').notEmpty(),
    body('vendorId').isUUID(),
    body('unitOfMeasure').notEmpty(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const {
      skuCode,
      name,
      description,
      category,
      vendorId,
      unitOfMeasure,
      conversionRules,
      dimensions,
      isFragile,
      maxStackHeight,
    } = req.body as {
      skuCode: string;
      name: string;
      description?: string;
      category?: string;
      vendorId: string;
      unitOfMeasure: string;
      conversionRules?: object;
      dimensions?: object;
      isFragile?: boolean;
      maxStackHeight?: number;
    };

    const sku = await prisma.sKU.create({
      data: {
        skuCode,
        name,
        description,
        category,
        vendorId,
        unitOfMeasure,
        conversionRules,
        dimensions,
        isFragile: isFragile ?? false,
        maxStackHeight,
      },
    });
    res.status(201).json(sku);
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
    const sku = await prisma.sKU.update({
      where: { id: req.params!.id },
      data: req.body,
    });
    res.json(sku);
  }
);

export default router;
