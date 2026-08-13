import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { processScan } from '../modules/barcode/barcodeProcessor';
import { assertVariantBelongsToSku } from '../modules/catalog/variantReferences';
import prisma from '../prisma/client';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

const printRoles = requireRole('Admin', 'Manager', 'Staff');

const defaultTemplate = {
  name: 'Standard A4 3 x 8',
  description: 'Default barcode label sheet',
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginTopMm: 8,
  marginRightMm: 8,
  marginBottomMm: 8,
  marginLeftMm: 8,
  columns: 3,
  rows: 8,
  labelWidthMm: 62,
  labelHeightMm: 34,
  gapXMm: 2,
  gapYMm: 2,
  paddingTopMm: 2,
  paddingRightMm: 2,
  paddingBottomMm: 2,
  paddingLeftMm: 2,
  barcodeHeightMm: 14,
  barcodeFormat: 'CODE128',
  showProductName: true,
  showVariantName: true,
  showPrice: true,
  showSkuCode: false,
  showBarcodeNumber: true,
  isDefault: true,
};

function cleanBarcodePart(value: string | null | undefined, fallback: string) {
  const cleaned = (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return cleaned || fallback;
}

async function nextUniqueBarcode(db: any, seed: string) {
  let candidate = seed;
  let sequence = 2;
  while (await db.productBarcode.findUnique({ where: { barcode: candidate }, select: { id: true } })) {
    candidate = `${seed}-${sequence}`;
    sequence += 1;
  }
  return candidate;
}

async function ensureBarcodeForScope(
  db: any,
  skuId: string,
  variantId?: string | null,
  forceNew = false,
) {
  const sku = await db.sKU.findUnique({
    where: { id: skuId },
    include: {
      barcodes: {
        where: { variantId: variantId ?? null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!sku) throw new Error('SKU not found');

  let variant: any = null;
  if (variantId) {
    variant = await db.sKUVariant.findUnique({
      where: { id: variantId },
      select: { id: true, skuId: true, variantCode: true, name: true },
    });
    if (!variant || variant.skuId !== skuId) throw new Error('Variant does not belong to this SKU');
  }

  const existing = sku.barcodes?.[0];
  if (existing && !forceNew) return existing;

  let seed: string;
  if (variant) {
    const mainBarcode = await db.productBarcode.findFirst({
      where: { skuId, variantId: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    const productSeed = mainBarcode?.barcode ?? cleanBarcodePart(sku.skuCode, `SKU-${sku.id.slice(0, 8)}`);
    const variantPart = cleanBarcodePart(variant.variantCode || variant.name, `V-${variant.id.slice(0, 6)}`);
    seed = `${productSeed}-${variantPart}`;
  } else {
    seed = cleanBarcodePart(sku.skuCode, `SKU-${sku.id.slice(0, 8)}`);
  }

  const barcode = await nextUniqueBarcode(db, seed);
  const shouldBeDefault = !existing;
  if (shouldBeDefault) {
    await db.productBarcode.updateMany({
      where: { skuId, variantId: variantId ?? null, isDefault: true },
      data: { isDefault: false },
    });
  }

  return db.productBarcode.create({
    data: {
      skuId,
      variantId: variantId ?? null,
      barcode,
      barcodeType: 'CODE128',
      isDefault: shouldBeDefault,
      label: variant ? 'Generated variant barcode' : 'Generated product barcode',
    },
    include: {
      sku: { select: { id: true, skuCode: true, name: true, sellingPrice: true, currency: true } },
      variant: { select: { id: true, variantCode: true, name: true } },
    },
  });
}

function numberFromBody(value: unknown, fallback: number, min = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function boolFromBody(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTemplatePayload(input: any) {
  return {
    name: String(input.name ?? '').trim(),
    description: input.description ? String(input.description).trim() : null,
    pageWidthMm: numberFromBody(input.pageWidthMm, defaultTemplate.pageWidthMm, 20),
    pageHeightMm: numberFromBody(input.pageHeightMm, defaultTemplate.pageHeightMm, 20),
    marginTopMm: numberFromBody(input.marginTopMm, defaultTemplate.marginTopMm),
    marginRightMm: numberFromBody(input.marginRightMm, defaultTemplate.marginRightMm),
    marginBottomMm: numberFromBody(input.marginBottomMm, defaultTemplate.marginBottomMm),
    marginLeftMm: numberFromBody(input.marginLeftMm, defaultTemplate.marginLeftMm),
    columns: Math.max(1, Math.min(12, Math.round(numberFromBody(input.columns, defaultTemplate.columns, 1)))),
    rows: Math.max(1, Math.min(40, Math.round(numberFromBody(input.rows, defaultTemplate.rows, 1)))),
    labelWidthMm: numberFromBody(input.labelWidthMm, defaultTemplate.labelWidthMm, 5),
    labelHeightMm: numberFromBody(input.labelHeightMm, defaultTemplate.labelHeightMm, 5),
    gapXMm: numberFromBody(input.gapXMm, defaultTemplate.gapXMm),
    gapYMm: numberFromBody(input.gapYMm, defaultTemplate.gapYMm),
    paddingTopMm: numberFromBody(input.paddingTopMm, defaultTemplate.paddingTopMm),
    paddingRightMm: numberFromBody(input.paddingRightMm, defaultTemplate.paddingRightMm),
    paddingBottomMm: numberFromBody(input.paddingBottomMm, defaultTemplate.paddingBottomMm),
    paddingLeftMm: numberFromBody(input.paddingLeftMm, defaultTemplate.paddingLeftMm),
    barcodeHeightMm: numberFromBody(input.barcodeHeightMm, defaultTemplate.barcodeHeightMm, 4),
    barcodeFormat: String(input.barcodeFormat ?? 'CODE128').trim() || 'CODE128',
    showProductName: boolFromBody(input.showProductName, true),
    showVariantName: boolFromBody(input.showVariantName, true),
    showPrice: boolFromBody(input.showPrice, true),
    showSkuCode: boolFromBody(input.showSkuCode, false),
    showBarcodeNumber: boolFromBody(input.showBarcodeNumber, true),
    isDefault: boolFromBody(input.isDefault, false),
  };
}

function printJobInclude() {
  return {
    template: true,
    grn: { select: { id: true, invoiceReference: true, status: true } },
    creator: { select: { id: true, email: true } },
    items: {
      include: {
        sku: { select: { id: true, skuCode: true, name: true } },
        variant: { select: { id: true, variantCode: true, name: true } },
        barcode: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  } as const;
}

async function createPrintJob(
  input: {
    templateId?: string | null;
    sourceType?: string;
    grnId?: string | null;
    createdById?: string | null;
    items: Array<{
      skuId: string;
      variantId?: string | null;
      barcodeId?: string | null;
      copies: number;
      price?: number | null;
    }>;
  },
) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('At least one barcode print item is required');
  }

  const prepared = [];
  for (const [index, item] of input.items.entries()) {
    if (!item.skuId) throw new Error(`Print line ${index + 1} is missing a product`);
    const copies = Math.max(1, Math.round(Number(item.copies) || 1));
    await assertVariantBelongsToSku(prisma, item.skuId, item.variantId || null, `Print line ${index + 1}`);

    let barcode = item.barcodeId
      ? await prisma.productBarcode.findUnique({ where: { id: item.barcodeId } })
      : null;
    if (barcode && (barcode.skuId !== item.skuId || (barcode.variantId ?? null) !== (item.variantId ?? null))) {
      throw new Error(`Print line ${index + 1} references a barcode from another product`);
    }
    if (!barcode) {
      barcode = await ensureBarcodeForScope(prisma, item.skuId, item.variantId || null);
    }
    if (!barcode) throw new Error(`Print line ${index + 1} barcode was not found`);

    const sku = await prisma.sKU.findUnique({
      where: { id: item.skuId },
      select: { id: true, skuCode: true, name: true, sellingPrice: true, currency: true },
    });
    if (!sku) throw new Error(`Print line ${index + 1} product was not found`);
    const variant = item.variantId
      ? await prisma.sKUVariant.findUnique({ where: { id: item.variantId }, select: { id: true, variantCode: true, name: true } })
      : null;

    prepared.push({
      skuId: sku.id,
      variantId: variant?.id ?? null,
      barcodeId: barcode.id,
      barcodeSnapshot: barcode.barcode,
      productNameSnapshot: sku.name,
      variantNameSnapshot: variant?.name ?? variant?.variantCode ?? null,
      skuCodeSnapshot: sku.skuCode,
      priceSnapshot: item.price ?? sku.sellingPrice ?? null,
      copies,
    });
  }

  const totalCopies = prepared.reduce((sum, item) => sum + item.copies, 0);
  const job = await prisma.barcodePrintJob.create({
    data: {
      templateId: input.templateId || null,
      sourceType: input.sourceType ?? 'MANUAL',
      grnId: input.grnId || null,
      createdById: input.createdById || null,
      totalCopies,
      items: { create: prepared },
    } as any,
    include: printJobInclude(),
  } as any);

  return job;
}

router.post('/scan', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { barcode, terminalId } = req.body as { barcode: string; terminalId?: string };
    const user = req.user!;

    if (!barcode) {
      res.status(400).json({ success: false, error: 'barcode is required' });
      return;
    }

    const result = await processScan(barcode, user.id, terminalId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Barcode scan error', error);
    res.status(500).json({ success: false, error: error.message ?? 'Barcode scan failed' });
  }
});

router.get('/templates', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = await prisma.barcodePrintTemplate.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    } as any);
    res.json({ success: true, data: templates.length > 0 ? templates : [defaultTemplate] });
  } catch (error: any) {
    logger.error('List barcode print templates error', error);
    res.status(500).json({ success: false, error: error.message ?? 'Failed to fetch barcode print templates' });
  }
});

router.post(
  '/templates',
  printRoles,
  [body('name').notEmpty()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const payload = normalizeTemplatePayload(req.body);
      if (!payload.name) throw new Error('Template name is required');
      const template = await prisma.$transaction(async (tx) => {
        if (payload.isDefault) {
          await tx.barcodePrintTemplate.updateMany({ data: { isDefault: false } } as any);
        }
        return tx.barcodePrintTemplate.create({
          data: { ...payload, createdById: req.user?.id ?? null } as any,
        } as any);
      });
      res.status(201).json({ success: true, data: template });
    } catch (error: any) {
      logger.error('Create barcode print template error', error);
      res.status(400).json({ success: false, error: error.message ?? 'Failed to create barcode print template' });
    }
  }
);

router.put(
  '/templates/:id',
  printRoles,
  [param('id').isUUID(), body('name').notEmpty()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const payload = normalizeTemplatePayload(req.body);
      const template = await prisma.$transaction(async (tx) => {
        if (payload.isDefault) {
          await tx.barcodePrintTemplate.updateMany({
            where: { id: { not: req.params!.id } },
            data: { isDefault: false },
          } as any);
        }
        return tx.barcodePrintTemplate.update({
          where: { id: req.params!.id },
          data: payload as any,
        } as any);
      });
      res.json({ success: true, data: template });
    } catch (error: any) {
      logger.error('Update barcode print template error', error);
      res.status(400).json({ success: false, error: error.message ?? 'Failed to update barcode print template' });
    }
  }
);

router.post(
  '/generate',
  printRoles,
  [
    body('skuId').isUUID(),
    body('variantId').optional({ nullable: true, checkFalsy: true }).isUUID(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const barcode = await ensureBarcodeForScope(
        prisma,
        req.body.skuId,
        req.body.variantId || null,
        Boolean(req.body.forceNew),
      );
      res.status(201).json({ success: true, data: barcode });
    } catch (error: any) {
      logger.error('Generate barcode error', error);
      res.status(400).json({ success: false, error: error.message ?? 'Failed to generate barcode' });
    }
  }
);

router.post(
  '/link',
  printRoles,
  [
    body('skuId').isUUID(),
    body('variantId').optional({ nullable: true, checkFalsy: true }).isUUID(),
    body('barcode').notEmpty(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const barcodeValue = String(req.body.barcode).trim();
      await assertVariantBelongsToSku(prisma, req.body.skuId, req.body.variantId || null, 'Linked barcode');
      const existing = await prisma.productBarcode.findUnique({
        where: { barcode: barcodeValue },
        include: { sku: { select: { id: true, skuCode: true, name: true } }, variant: { select: { id: true, name: true, variantCode: true } } },
      });
      if (existing) {
        res.status(409).json({ success: false, error: `Barcode is already linked to ${existing.sku.name}`, data: existing });
        return;
      }
      const isDefault = Boolean(req.body.isDefault);
      if (isDefault) {
        await prisma.productBarcode.updateMany({
          where: { skuId: req.body.skuId, variantId: req.body.variantId || null },
          data: { isDefault: false },
        });
      }
      const linked = await prisma.productBarcode.create({
        data: {
          skuId: req.body.skuId,
          variantId: req.body.variantId || null,
          barcode: barcodeValue,
          barcodeType: req.body.barcodeType || 'CODE128',
          isDefault,
          label: req.body.label || 'Linked barcode',
        },
        include: { sku: { select: { id: true, skuCode: true, name: true } }, variant: { select: { id: true, name: true, variantCode: true } } },
      });
      res.status(201).json({ success: true, data: linked });
    } catch (error: any) {
      logger.error('Link barcode error', error);
      res.status(400).json({ success: false, error: error.message ?? 'Failed to link barcode' });
    }
  }
);

router.get('/prints', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      grnId,
      search,
      sourceType,
      status,
      fromDate,
      toDate,
      page = '1',
      pageSize = '30',
    } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const take = Math.max(1, Math.min(100, parseInt(pageSize) || 30));
    const where: any = {};
    if (grnId) where.grnId = grnId;
    if (sourceType) where.sourceType = sourceType;
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    if (search?.trim()) {
      const query = search.trim();
      where.OR = [
        { id: { contains: query, mode: 'insensitive' } },
        { sourceType: { contains: query, mode: 'insensitive' } },
        { status: { contains: query, mode: 'insensitive' } },
        { template: { name: { contains: query, mode: 'insensitive' } } },
        { grn: { invoiceReference: { contains: query, mode: 'insensitive' } } },
        { items: { some: { productNameSnapshot: { contains: query, mode: 'insensitive' } } } },
        { items: { some: { variantNameSnapshot: { contains: query, mode: 'insensitive' } } } },
        { items: { some: { skuCodeSnapshot: { contains: query, mode: 'insensitive' } } } },
        { items: { some: { barcodeSnapshot: { contains: query, mode: 'insensitive' } } } },
        { items: { some: { sku: { name: { contains: query, mode: 'insensitive' } } } } },
        { items: { some: { sku: { skuCode: { contains: query, mode: 'insensitive' } } } } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.barcodePrintJob.findMany({
        where,
        include: printJobInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * take,
        take,
      } as any),
      prisma.barcodePrintJob.count({ where } as any),
    ]);
    res.json({ success: true, data: { items, total, page: pageNum, pageSize: take, totalPages: Math.ceil(total / take) } });
  } catch (error: any) {
    logger.error('List barcode print jobs error', error);
    res.status(500).json({ success: false, error: error.message ?? 'Failed to fetch barcode print jobs' });
  }
});

router.get(
  '/prints/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const job: any = await prisma.barcodePrintJob.findUnique({
        where: { id: req.params!.id },
        include: printJobInclude(),
      } as any);
      if (!job) {
        res.status(404).json({ success: false, error: 'Barcode print job not found' });
        return;
      }
      res.json({ success: true, data: job });
    } catch (error: any) {
      logger.error('Get barcode print job error', error);
      res.status(500).json({ success: false, error: error.message ?? 'Failed to fetch barcode print job' });
    }
  }
);

router.post('/prints', printRoles, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await createPrintJob({
      templateId: req.body.templateId || null,
      sourceType: req.body.sourceType || 'MANUAL',
      grnId: req.body.grnId || null,
      createdById: req.user?.id ?? null,
      items: req.body.items ?? [],
    });
    res.status(201).json({ success: true, data: job });
  } catch (error: any) {
    logger.error('Create barcode print job error', error);
    res.status(400).json({ success: false, error: error.message ?? 'Failed to create barcode print job' });
  }
});

router.post(
  '/prints/from-grn/:grnId',
  printRoles,
  [param('grnId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const grn = await prisma.gRN.findUnique({
        where: { id: req.params!.grnId },
        include: {
          lines: {
            include: {
              sku: { select: { id: true, skuCode: true, name: true, sellingPrice: true } },
              variant: { select: { id: true, variantCode: true, name: true } },
              batch: { select: { id: true, sellingPrice: true } },
            },
          },
        },
      });
      if (!grn) {
        res.status(404).json({ success: false, error: 'GRN not found' });
        return;
      }
      const items = grn.lines.map((line) => ({
        skuId: line.skuId,
        variantId: line.variantId ?? null,
        copies: Math.max(1, line.receivedQuantity || line.expectedQuantity || 1),
        price: line.sellingPrice ?? line.batch?.sellingPrice ?? line.sku.sellingPrice ?? null,
      }));
      const job = await createPrintJob({
        templateId: req.body.templateId || null,
        sourceType: 'GRN',
        grnId: grn.id,
        createdById: req.user?.id ?? null,
        items,
      });
      res.status(201).json({ success: true, data: job });
    } catch (error: any) {
      logger.error('Create GRN barcode print job error', error);
      res.status(400).json({ success: false, error: error.message ?? 'Failed to create GRN barcode print job' });
    }
  }
);

router.post(
  '/prints/:id/mark-printed',
  printRoles,
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const job: any = await prisma.barcodePrintJob.findUnique({
        where: { id: req.params!.id },
        include: { items: true },
      } as any);
      if (!job) {
        res.status(404).json({ success: false, error: 'Barcode print job not found' });
        return;
      }
      const totalCopies = job.items.reduce((sum: number, item: any) => sum + item.copies, 0);
      const updated = await prisma.$transaction(async (tx) => {
        for (const item of job.items) {
          await tx.barcodePrintJobItem.update({
            where: { id: item.id },
            data: { printedCount: { increment: item.copies } },
          } as any);
        }
        const updatedJob = await tx.barcodePrintJob.update({
          where: { id: job.id },
          data: {
            status: 'PRINTED',
            printedAt: new Date(),
            printedCount: { increment: totalCopies },
            printRunCount: { increment: 1 },
          } as any,
          include: printJobInclude(),
        } as any);
        if (job.templateId) {
          await tx.barcodePrintTemplate.update({
            where: { id: job.templateId },
            data: { printCount: { increment: totalCopies } },
          } as any);
        }
        return updatedJob;
      });
      res.json({ success: true, data: updated });
    } catch (error: any) {
      logger.error('Mark barcode print job printed error', error);
      res.status(400).json({ success: false, error: error.message ?? 'Failed to mark barcode print job printed' });
    }
  }
);

export default router;
