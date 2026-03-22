import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, isActive, search } = req.query as { type?: string; isActive?: string; search?: string };

  const where: Prisma.VendorWhereInput = {
    ...(type ? { type } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { contactEmail: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

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
      where: { vendorId: req.params!.id, isActive: true },
    });
    res.json(skus);
  }
);

export default router;

