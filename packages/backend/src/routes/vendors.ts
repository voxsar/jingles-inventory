import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getPagination, paginatedPayload } from '../utils/pagination';
import { searchVendorIdsFts } from '../utils/localSearch';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, isActive, search, hasWebsite } = req.query as { type?: string; isActive?: string; search?: string; hasWebsite?: string };
  const pagination = getPagination(req.query);

  // In local replica (Electron) mode use FTS5 for fast vendor name/contact search.
  const ftsVendorIds = search ? await searchVendorIdsFts(search) : null;

  const where: Prisma.VendorWhereInput = {
    ...(type ? { type } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : { isActive: true }),
    ...(hasWebsite === 'true'
      ? { website: { not: null } }
      : hasWebsite === 'false'
        ? { website: null }
        : {}),
    ...(search
      ? ftsVendorIds !== null
        ? { id: { in: ftsVendorIds } }
        : {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { contactEmail: { contains: search, mode: 'insensitive' } },
              { contactPhone: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
              { website: { contains: search, mode: 'insensitive' } },
              { taxId: { contains: search, mode: 'insensitive' } },
              { paymentTerms: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
            ],
          }
      : {}),
  };

  if (pagination.isPaginated) {
    const [items, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { name: 'asc' },
      }),
      prisma.vendor.count({ where }),
    ]);
    res.json({ success: true, data: paginatedPayload(items, total, pagination.page, pagination.pageSize) });
    return;
  }

  const vendors = await prisma.vendor.findMany({
    where,
    orderBy: { name: 'asc' },
  });
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
    const { name, contactEmail, contactPhone, address, type, website, taxId, paymentTerms, notes } = req.body as {
      name: string;
      contactEmail: string;
      contactPhone?: string;
      address?: string;
      type?: string;
      website?: string;
      taxId?: string;
      paymentTerms?: string;
      notes?: string;
    };
    const vendor = await prisma.vendor.create({
      data: {
        name,
        contactEmail,
        contactPhone,
        address,
        type: type ?? 'Vendor',
        website,
        taxId,
        paymentTerms,
        notes,
      },
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
    const { name, contactEmail, contactPhone, address, isActive, type, website, taxId, paymentTerms, notes } = req.body as {
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      isActive?: boolean;
      type?: string;
      website?: string;
      taxId?: string;
      paymentTerms?: string;
      notes?: string;
    };
    const vendor = await prisma.vendor.update({
      where: { id: req.params!.id },
      data: { name, contactEmail, contactPhone, address, isActive, type, website, taxId, paymentTerms, notes },
    });
    res.json(vendor);
  }
);

router.get(
  '/:id/products',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const skus = await prisma.sKU.findMany({
      where: { skuVendors: { some: { vendorId: req.params!.id } }, isActive: true },
    });
    res.json(skus);
  }
);

export default router;
