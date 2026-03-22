import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.use(authenticate);

// Helper: cartesian product of arrays
type ComboItem = { attributeId: string; attributeValueId: string; valueLabel: string };

function cartesian(arrays: ComboItem[][]): ComboItem[][] {
  return arrays.reduce<ComboItem[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]]
  );
}

// GET /api/skus/:skuId/variants - List all variants for a product
router.get('/', [param('skuId').isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const { skuId } = req.params as { skuId: string };

  const sku = await prisma.sKU.findUnique({ where: { id: skuId } });
  if (!sku) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const variants = await prisma.sKUVariant.findMany({
    where: { skuId },
    include: {
      attributeValues: {
        include: {
          attribute: true,
          attributeValue: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ success: true, data: variants });
});

// POST /api/skus/:skuId/variants/generate - Generate variants from cartesian product
router.post(
  '/generate',
  requireRole('Admin', 'Manager'),
  [param('skuId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { skuId } = req.params as { skuId: string };

    // attributeSelections: Array<{ attributeId: string; valueIds: string[] }>
    const { attributeSelections } = req.body as {
      attributeSelections: { attributeId: string; valueIds: string[] }[];
    };

    if (!Array.isArray(attributeSelections) || attributeSelections.length === 0) {
      res.status(400).json({ error: 'attributeSelections must be a non-empty array' });
      return;
    }

    const sku = await prisma.sKU.findUnique({ where: { id: skuId } });
    if (!sku) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Validate all attributes and values exist
    for (const sel of attributeSelections) {
      if (!sel.attributeId || !Array.isArray(sel.valueIds) || sel.valueIds.length === 0) {
        res.status(400).json({ error: 'Each selection must have attributeId and non-empty valueIds' });
        return;
      }
      const attr = await prisma.attribute.findUnique({ where: { id: sel.attributeId } });
      if (!attr) {
        res.status(400).json({ error: `Attribute ${sel.attributeId} not found` });
        return;
      }
      const valCount = await prisma.attributeValue.count({
        where: { id: { in: sel.valueIds }, attributeId: sel.attributeId },
      });
      if (valCount !== sel.valueIds.length) {
        res.status(400).json({ error: `Some attribute values for ${attr.name} are invalid` });
        return;
      }
    }

    // Build attribute value objects for cartesian product
    const attributeValueGroups = await Promise.all(
      attributeSelections.map(async (sel) => {
        const vals = await prisma.attributeValue.findMany({
          where: { id: { in: sel.valueIds }, attributeId: sel.attributeId },
          orderBy: { sortOrder: 'asc' },
        });
        return vals.map((v: { id: string; value: string }) => ({ attributeId: sel.attributeId, attributeValueId: v.id, valueLabel: v.value }));
      })
    );

    // Upsert SKUAttribute assignments for the product
    for (const sel of attributeSelections) {
      const skuAttr = await prisma.sKUAttribute.upsert({
        where: { skuId_attributeId: { skuId, attributeId: sel.attributeId } },
        update: {},
        create: { skuId, attributeId: sel.attributeId },
      });
      // Update selected values: delete old, insert new
      await prisma.sKUAttributeValue.deleteMany({ where: { skuAttributeId: skuAttr.id } });
      const attrValues = await prisma.attributeValue.findMany({
        where: { id: { in: sel.valueIds } },
      });
      await prisma.sKUAttributeValue.createMany({
        data: attrValues.map((av: { id: string }) => ({ skuAttributeId: skuAttr.id, attributeValueId: av.id })),
        skipDuplicates: true,
      });
    }

    // Build combos from cartesian product
    const combos = cartesian(attributeValueGroups);
    const created: string[] = [];
    const skipped: string[] = [];

    for (const combo of combos) {
      // Build a unique key for this combination
      const comboKey = combo.map((c) => `${c.attributeId}:${c.attributeValueId}`).sort().join('|');
      const variantCode = `${sku.skuCode}-${combo.map((c) => c.valueLabel).join('-')}`;
      const variantName = combo.map((c) => c.valueLabel).join(' / ');

      // Check if a variant with this combo already exists
      const existingVariants = await prisma.sKUVariant.findMany({
        where: { skuId },
        include: { attributeValues: true },
      });

      const alreadyExists = existingVariants.some((v: { attributeValues: Array<{ attributeId: string; attributeValueId: string }> }) => {
        const vKey = v.attributeValues
          .map((av: { attributeId: string; attributeValueId: string }) => `${av.attributeId}:${av.attributeValueId}`)
          .sort()
          .join('|');
        return vKey === comboKey;
      });

      if (alreadyExists) {
        skipped.push(variantName);
        continue;
      }

      // Ensure unique variant code
      let finalCode = variantCode;
      let codeExists = await prisma.sKUVariant.findUnique({ where: { variantCode: finalCode } });
      let suffix = 1;
      while (codeExists) {
        finalCode = `${variantCode}-${suffix++}`;
        codeExists = await prisma.sKUVariant.findUnique({ where: { variantCode: finalCode } });
      }

      await prisma.sKUVariant.create({
        data: {
          skuId,
          variantCode: finalCode,
          name: variantName,
          attributeValues: {
            create: combo.map((c) => ({
              attributeId: c.attributeId,
              attributeValueId: c.attributeValueId,
            })),
          },
        },
      });
      created.push(variantName);
    }

    const variants = await prisma.sKUVariant.findMany({
      where: { skuId },
      include: {
        attributeValues: {
          include: { attribute: true, attributeValue: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.status(201).json({
      success: true,
      data: variants,
      meta: { created: created.length, skipped: skipped.length },
    });
  }
);

// DELETE /api/skus/:skuId/variants/:variantId - Remove a specific variant
router.delete(
  '/:variantId',
  requireRole('Admin', 'Manager'),
  [param('skuId').isUUID(), param('variantId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { skuId, variantId } = req.params as { skuId: string; variantId: string };

    const variant = await prisma.sKUVariant.findFirst({ where: { id: variantId, skuId } });
    if (!variant) {
      res.status(404).json({ error: 'Variant not found' });
      return;
    }

    // Check if variant has inventory records
    const inventoryCount = await prisma.inventoryRecord.count({ where: { variantId } });
    if (inventoryCount > 0) {
      res.status(409).json({ error: 'Cannot delete variant that has inventory records' });
      return;
    }

    await prisma.sKUVariant.delete({ where: { id: variantId } });
    res.json({ success: true, message: 'Variant deleted' });
  }
);

// PUT /api/skus/:skuId/variants/:variantId - Update variant (name, isActive)
router.put(
  '/:variantId',
  requireRole('Admin', 'Manager'),
  [param('skuId').isUUID(), param('variantId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { skuId, variantId } = req.params as { skuId: string; variantId: string };

    const variant = await prisma.sKUVariant.findFirst({ where: { id: variantId, skuId } });
    if (!variant) {
      res.status(404).json({ error: 'Variant not found' });
      return;
    }

    const { name, isActive, variantCode } = req.body as {
      name?: string;
      isActive?: boolean;
      variantCode?: string;
    };

    const updated = await prisma.sKUVariant.update({
      where: { id: variantId },
      data: { name, isActive, variantCode },
      include: {
        attributeValues: {
          include: { attribute: true, attributeValue: true },
        },
      },
    });
    res.json({ success: true, data: updated });
  }
);

// PUT /api/skus/:skuId/variants/bulk - Bulk enable/disable variants
router.put(
  '/',
  requireRole('Admin', 'Manager'),
  [
    param('skuId').isUUID(),
    body('variantIds').isArray({ min: 1 }),
    body('isActive').isBoolean(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { skuId } = req.params as { skuId: string };
    const { variantIds, isActive } = req.body as { variantIds: string[]; isActive: boolean };

    await prisma.sKUVariant.updateMany({
      where: { id: { in: variantIds }, skuId },
      data: { isActive },
    });

    const variants = await prisma.sKUVariant.findMany({
      where: { skuId },
      include: {
        attributeValues: {
          include: { attribute: true, attributeValue: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: variants });
  }
);

export default router;
