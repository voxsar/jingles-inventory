import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { vendorId, categoryId, isActive, search, page = '1', pageSize = '20' } = req.query as {
    vendorId?: string;
    categoryId?: string;
    isActive?: string;
    search?: string;
    page?: string;
    pageSize?: string;
  };

  const skip = (parseInt(page) - 1) * parseInt(pageSize);

  const where: Prisma.SKUWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { skuCode: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.sKU.findMany({
      where,
      skip,
      take: parseInt(pageSize),
      include: {
        vendor: true,
        category: true,
        images: { where: { isPrimary: true }, take: 1 },
        barcodes: { where: { isDefault: true }, take: 1 },
        tags: { include: { tag: true } },
        _count: { select: { variants: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.sKU.count({ where }),
  ]);

  res.json({ success: true, data: { items, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
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
      include: {
        vendor: true,
        category: { include: { parent: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        barcodes: { orderBy: { isDefault: 'desc' } },
        tags: { include: { tag: true } },
        skuAttributes: {
          include: {
            attribute: { include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } },
            selectedValues: { include: { attributeValue: true } },
          },
        },
        variants: {
          include: {
            attributeValues: {
              include: { attribute: true, attributeValue: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!sku) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }
    res.json({ success: true, data: sku });
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
      categoryId,
      vendorId,
      unitOfMeasure,
      unitOfMeasureId,
      conversionRules,
      dimensions,
      isFragile,
      maxStackHeight,
      batchPricing,
      lowStockThreshold,
    } = req.body as {
      skuCode: string;
      name: string;
      description?: string;
      categoryId?: string;
      vendorId: string;
      unitOfMeasure: string;
      unitOfMeasureId?: string;
      conversionRules?: object;
      dimensions?: object;
      isFragile?: boolean;
      maxStackHeight?: number;
      batchPricing?: object;
      lowStockThreshold?: number;
    };

    const sku = await prisma.sKU.create({
      data: {
        skuCode,
        name,
        description,
        categoryId,
        vendorId,
        unitOfMeasure,
        unitOfMeasureId,
        conversionRules,
        dimensions,
        isFragile: isFragile ?? false,
        maxStackHeight,
        batchPricing,
        lowStockThreshold,
      },
    });
    res.status(201).json({ success: true, data: sku });
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
    res.json({ success: true, data: sku });
  }
);

// --- Barcodes ---
router.get(
  '/:id/barcodes',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const barcodes = await prisma.productBarcode.findMany({
      where: { skuId: req.params!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, data: barcodes });
  }
);

router.post(
  '/:id/barcodes',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), body('barcode').notEmpty()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { barcode, barcodeType, isDefault, label } = req.body as {
      barcode: string;
      barcodeType?: string;
      isDefault?: boolean;
      label?: string;
    };
    if (isDefault) {
      await prisma.productBarcode.updateMany({
        where: { skuId: req.params!.id },
        data: { isDefault: false },
      });
    }
    const bc = await prisma.productBarcode.create({
      data: {
        skuId: req.params!.id,
        barcode,
        barcodeType: barcodeType ?? 'EAN13',
        isDefault: isDefault ?? false,
        label,
      },
    });
    res.status(201).json({ success: true, data: bc });
  }
);

router.delete(
  '/:id/barcodes/:bcId',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), param('bcId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    await prisma.productBarcode.delete({ where: { id: req.params!.bcId } });
    res.json({ success: true, message: 'Barcode deleted' });
  }
);

// --- Images ---
router.get(
  '/:id/images',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const images = await prisma.productImage.findMany({
      where: { skuId: req.params!.id },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });
    res.json({ success: true, data: images });
  }
);

router.post(
  '/:id/images',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), body('url').notEmpty().isURL()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { url, altText, isPrimary, sortOrder } = req.body as {
      url: string;
      altText?: string;
      isPrimary?: boolean;
      sortOrder?: number;
    };
    if (isPrimary) {
      await prisma.productImage.updateMany({
        where: { skuId: req.params!.id },
        data: { isPrimary: false },
      });
    }
    const image = await prisma.productImage.create({
      data: {
        skuId: req.params!.id,
        url,
        altText,
        isPrimary: isPrimary ?? false,
        sortOrder: sortOrder ?? 0,
      },
    });
    res.status(201).json({ success: true, data: image });
  }
);

router.delete(
  '/:id/images/:imgId',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), param('imgId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    await prisma.productImage.delete({ where: { id: req.params!.imgId } });
    res.json({ success: true, message: 'Image deleted' });
  }
);

// --- Tags ---
router.get('/tags/all', async (_req, res: Response): Promise<void> => {
  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
  res.json({ success: true, data: tags });
});

// Create a new global tag
router.post(
  '/tags/create',
  requireRole('Admin', 'Manager'),
  [body('name').notEmpty().trim()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const tag = await prisma.tag.upsert({
        where: { name: req.body.name.trim() },
        create: { name: req.body.name.trim(), color: req.body.color },
        update: {},
      });
      res.status(201).json({ success: true, data: tag });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

router.post(
  '/:id/tags',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), body('tagId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    await prisma.sKUTag.upsert({
      where: { skuId_tagId: { skuId: req.params!.id, tagId: req.body.tagId } },
      create: { skuId: req.params!.id, tagId: req.body.tagId },
      update: {},
    });
    res.json({ success: true, message: 'Tag added' });
  }
);

router.delete(
  '/:id/tags/:tagId',
  requireRole('Admin', 'Manager'),
  [param('id').isUUID(), param('tagId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    await prisma.sKUTag.delete({
      where: { skuId_tagId: { skuId: req.params!.id, tagId: req.params!.tagId } },
    });
    res.json({ success: true, message: 'Tag removed' });
  }
);

export default router;

