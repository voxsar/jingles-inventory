import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getPagination, paginatedPayload } from '../utils/pagination';
import { searchVendorIdsFts } from '../utils/localSearch';

const router = Router();

router.use(authenticate);

const COMPANY_NAME_STOP_WORDS = new Set([
  'and',
  'co',
  'company',
  'corp',
  'corporation',
  'distributors',
  'enterprises',
  'imports',
  'inc',
  'international',
  'limited',
  'llc',
  'ltd',
  'pvt',
  'private',
  'supplier',
  'suppliers',
  'traders',
  'trading',
  'vendor',
]);

const cleanText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeText = (value: string, stopWords?: Set<string>) =>
  normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !(stopWords?.has(token) ?? false));

const calculateTokenSimilarity = (leftTokens: string[], rightTokens: string[]) => {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = Array.from(left).filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};

const normalizeEmail = (value: string | null | undefined) => cleanText(value)?.toLowerCase() ?? '';

const normalizePhone = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
};

const normalizeDomain = (value: string | null | undefined) => {
  const text = cleanText(value);
  if (!text) return '';

  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return text
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
  }
};

const normalizeTaxId = (value: string | null | undefined) =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const compareVendorField = (field: string, left: unknown, right: unknown) => {
  switch (field) {
    case 'contactEmail':
      return normalizeEmail(left as string | null | undefined) === normalizeEmail(right as string | null | undefined);
    case 'contactPhone':
      return normalizePhone(left as string | null | undefined) === normalizePhone(right as string | null | undefined);
    case 'website':
      return normalizeDomain(left as string | null | undefined) === normalizeDomain(right as string | null | undefined);
    case 'taxId':
      return normalizeTaxId(left as string | null | undefined) === normalizeTaxId(right as string | null | undefined);
    case 'isActive':
      return Boolean(left) === Boolean(right);
    default:
      return normalizeText(String(left ?? '')) === normalizeText(String(right ?? ''));
  }
};

const pickPreferredText = (targetValue: string | null | undefined, sourceValue: string | null | undefined) =>
  cleanText(targetValue) ?? cleanText(sourceValue);

const mergeVendorType = (targetType: string | null | undefined, sourceType: string | null | undefined) => {
  const target = cleanText(targetType);
  const source = cleanText(sourceType);
  const normalized = new Set([normalizeText(target), normalizeText(source)].filter(Boolean));

  if (normalized.has('both')) return 'Both';
  if (normalized.has('vendor') && normalized.has('supplier')) return 'Both';
  return target ?? source ?? 'Vendor';
};

type MergeableVendorField =
  | 'contactEmail'
  | 'contactPhone'
  | 'address'
  | 'website'
  | 'taxId'
  | 'paymentTerms';

const buildMergedVendorNotes = (target: any, source: any) => {
  const targetNotes = cleanText(target.notes);
  const sourceNotes = cleanText(source.notes);
  const preferredNotes = pickPreferredText(targetNotes, sourceNotes);
  const extraDetails: string[] = [];

  const mergeableFields: Array<[MergeableVendorField, string]> = [
    ['contactEmail', 'Email'],
    ['contactPhone', 'Phone'],
    ['address', 'Address'],
    ['website', 'Website'],
    ['taxId', 'Tax ID'],
    ['paymentTerms', 'Payment Terms'],
  ];

  for (const [field, label] of mergeableFields) {
    const targetValue = cleanText(target[field] as string | null | undefined);
    const sourceValue = cleanText(source[field] as string | null | undefined);
    if (!sourceValue || !targetValue) continue;
    if (compareVendorField(field, targetValue, sourceValue)) continue;
    extraDetails.push(`${label}: ${sourceValue}`);
  }

  if (sourceNotes && targetNotes && !compareVendorField('notes', targetNotes, sourceNotes)) {
    extraDetails.unshift(`Source notes: ${sourceNotes}`);
  }

  const sections = [preferredNotes];
  if (extraDetails.length > 0) {
    sections.push(`Merged from ${source.name}: ${extraDetails.join(' | ')}`);
  }

  return sections.filter(Boolean).join('\n\n') || null;
};

const buildMergedVendorData = (target: any, source: any) => {
  const data = {
    contactEmail: pickPreferredText(target.contactEmail, source.contactEmail) ?? target.contactEmail,
    contactPhone: pickPreferredText(target.contactPhone, source.contactPhone),
    address: pickPreferredText(target.address, source.address),
    type: mergeVendorType(target.type, source.type),
    website: pickPreferredText(target.website, source.website),
    taxId: pickPreferredText(target.taxId, source.taxId),
    paymentTerms: pickPreferredText(target.paymentTerms, source.paymentTerms),
    notes: buildMergedVendorNotes(target, source),
    isActive: Boolean(target.isActive || source.isActive),
  };

  const updatedFields = Object.entries(data)
    .filter(([field, value]) => !compareVendorField(field, target[field], value))
    .map(([field]) => field);

  return { data, updatedFields };
};

type VendorDuplicateSignal = {
  key: string;
  label: string;
  value?: string;
};

const dedupeSignals = (signals: Array<VendorDuplicateSignal | null>) => {
  const seen = new Set<string>();
  return signals.filter((signal): signal is VendorDuplicateSignal => {
    if (!signal) return false;
    const fingerprint = `${signal.key}:${signal.value ?? ''}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
};

const buildVendorDuplicateCandidate = (target: any, candidate: any) => {
  const normalizedTargetName = normalizeText(target.name);
  const normalizedCandidateName = normalizeText(candidate.name);
  const nameSimilarity = calculateTokenSimilarity(
    tokenizeText(target.name, COMPANY_NAME_STOP_WORDS),
    tokenizeText(candidate.name, COMPANY_NAME_STOP_WORDS),
  );
  const addressSimilarity = calculateTokenSimilarity(
    tokenizeText(target.address ?? ''),
    tokenizeText(candidate.address ?? ''),
  );

  const sameName = normalizedTargetName.length > 0 && normalizedTargetName === normalizedCandidateName;
  const sameEmail = normalizeEmail(target.contactEmail) !== '' && normalizeEmail(target.contactEmail) === normalizeEmail(candidate.contactEmail);
  const samePhone = normalizePhone(target.contactPhone) !== '' && normalizePhone(target.contactPhone) === normalizePhone(candidate.contactPhone);
  const sameDomain = normalizeDomain(target.website) !== '' && normalizeDomain(target.website) === normalizeDomain(candidate.website);
  const sameTaxId = normalizeTaxId(target.taxId) !== '' && normalizeTaxId(target.taxId) === normalizeTaxId(candidate.taxId);
  const sameAddress = addressSimilarity >= 0.82;
  const sameType = normalizeText(target.type) !== '' && normalizeText(target.type) === normalizeText(candidate.type);

  let score = Math.round(nameSimilarity * 100);
  let reason = 'Similar supplier name';

  if (sameTaxId) {
    score = 100;
    reason = 'Matching tax ID';
  } else if (sameName && sameEmail) {
    score = 98;
    reason = 'Exact supplier name and email match';
  } else if (sameName && samePhone) {
    score = 96;
    reason = 'Exact supplier name and phone match';
  } else if (sameName && sameDomain) {
    score = 95;
    reason = 'Exact supplier name and website match';
  } else if (sameEmail) {
    score = Math.max(score, 92);
    reason = 'Matching contact email';
  } else if (samePhone && nameSimilarity >= 0.45) {
    score = Math.max(score, 88);
    reason = 'Similar supplier name and phone';
  } else if (sameDomain && nameSimilarity >= 0.5) {
    score = Math.max(score, 86);
    reason = 'Similar supplier name and website';
  } else if (sameName) {
    score = Math.max(score, 90);
    reason = 'Exact supplier name match';
  } else if (nameSimilarity >= 0.86) {
    score = Math.max(score, 82);
    reason = 'Very similar supplier name';
  } else if (nameSimilarity >= 0.72 && sameAddress) {
    score = Math.max(score, 80);
    reason = 'Similar supplier name and address';
  } else if (sameAddress && (samePhone || sameEmail || sameDomain)) {
    score = Math.max(score, 80);
    reason = 'Shared supplier contact details';
  }

  if (sameEmail) score += 4;
  if (samePhone) score += 4;
  if (sameDomain) score += 3;
  if (sameAddress) score += 2;
  if (sameType) score += 1;
  score = Math.min(score, 100);

  const matchedSignals = dedupeSignals([
    sameName ? { key: 'name', label: 'Name', value: 'Exact match' } : null,
    sameEmail ? { key: 'email', label: 'Email', value: candidate.contactEmail } : null,
    samePhone ? { key: 'phone', label: 'Phone', value: candidate.contactPhone ?? undefined } : null,
    sameDomain ? { key: 'website', label: 'Website', value: normalizeDomain(candidate.website) } : null,
    sameTaxId ? { key: 'taxId', label: 'Tax ID', value: candidate.taxId ?? undefined } : null,
    sameAddress ? { key: 'address', label: 'Address', value: 'Shared address' } : null,
  ]);

  return {
    vendor: candidate,
    score,
    reason,
    matchedSignals,
  };
};

const countVendorReferences = (vendor: any) => {
  const counts = vendor._count ?? {};
  return (
    (counts.skus ?? 0) * 6 +
    (counts.skuVendors ?? 0) * 5 +
    (counts.grns ?? 0) * 4 +
    (counts.prns ?? 0) * 4 +
    (counts.batches ?? 0) * 3 +
    (counts.users ?? 0) * 2
  );
};

const buildVendorDuplicateGroups = (vendors: any[], minScore: number) => {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  vendors.forEach((vendor) => parent.set(vendor.id, vendor.id));
  const relationships = new Map<string, any>();

  for (let i = 0; i < vendors.length; i++) {
    for (let j = i + 1; j < vendors.length; j++) {
      const left = vendors[i];
      const right = vendors[j];
      const candidate = buildVendorDuplicateCandidate(left, right);
      if (candidate.score < minScore) continue;
      union(left.id, right.id);
      relationships.set(`${left.id}:${right.id}`, candidate);
      relationships.set(`${right.id}:${left.id}`, buildVendorDuplicateCandidate(right, left));
    }
  }

  const grouped = new Map<string, any[]>();
  for (const vendor of vendors) {
    const root = find(vendor.id);
    grouped.set(root, [...(grouped.get(root) ?? []), vendor]);
  }

  return Array.from(grouped.values())
    .filter((group) => group.length > 1)
    .map((group) => {
      const target = [...group].sort((a, b) => {
        const aReferences = countVendorReferences(a);
        const bReferences = countVendorReferences(b);
        if (aReferences !== bReferences) return bReferences - aReferences;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })[0];

      const items = group
        .filter((vendor) => vendor.id !== target.id)
        .map((vendor) => relationships.get(`${target.id}:${vendor.id}`) ?? buildVendorDuplicateCandidate(target, vendor))
        .sort((a, b) => b.score - a.score);

      return {
        target,
        items,
        score: items[0]?.score ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score);
};

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

router.get('/duplicates', async (req: AuthRequest, res: Response): Promise<void> => {
  const { minScore = '74', limit = '600' } = req.query as { minScore?: string; limit?: string };
  const scoreThreshold = Math.max(1, Math.min(100, parseInt(minScore, 10) || 74));
  const take = Math.max(50, Math.min(2000, parseInt(limit, 10) || 600));

  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    take,
    include: {
      _count: {
        select: {
          users: true,
          skus: true,
          grns: true,
          prns: true,
          skuVendors: true,
          batches: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const groups = buildVendorDuplicateGroups(vendors, scoreThreshold);
  res.json({
    success: true,
    data: {
      items: groups,
      total: groups.length,
      limit: take,
      minScore: scoreThreshold,
    },
  });
});

router.post(
  '/:id/duplicates/:sourceId/merge',
  requireRole('Admin'),
  [param('id').isUUID(), param('sourceId').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { id: targetId, sourceId } = req.params as { id: string; sourceId: string };
    if (targetId === sourceId) {
      res.status(400).json({ error: 'Cannot merge a supplier into itself' });
      return;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const [target, source, sourcePrimarySkus, sourceSkuLinks] = await Promise.all([
          tx.vendor.findUnique({
            where: { id: targetId },
            include: {
              _count: {
                select: {
                  users: true,
                  skus: true,
                  grns: true,
                  prns: true,
                  skuVendors: true,
                  batches: true,
                },
              },
            },
          }),
          tx.vendor.findUnique({
            where: { id: sourceId },
            include: {
              _count: {
                select: {
                  users: true,
                  skus: true,
                  grns: true,
                  prns: true,
                  skuVendors: true,
                  batches: true,
                },
              },
            },
          }),
          tx.sKU.findMany({
            where: { vendorId: sourceId },
            select: { id: true },
          }),
          tx.sKUVendor.findMany({
            where: { vendorId: sourceId },
            select: { skuId: true },
          }),
        ]);

        if (!target || !source) throw new Error('Vendor not found');

        const skuIdsToEnsure = Array.from(new Set([
          ...sourcePrimarySkus.map((sku) => sku.id),
          ...sourceSkuLinks.map((link) => link.skuId),
        ]));

        if (skuIdsToEnsure.length > 0) {
          await tx.sKUVendor.createMany({
            data: skuIdsToEnsure.map((skuId) => ({ skuId, vendorId: targetId })),
            skipDuplicates: true,
          });
        }

        const mergedVendor = buildMergedVendorData(target, source);

        await tx.vendor.update({
          where: { id: targetId },
          data: mergedVendor.data,
        });

        await Promise.all([
          tx.user.updateMany({ where: { vendorId: sourceId }, data: { vendorId: targetId } }),
          tx.sKU.updateMany({ where: { vendorId: sourceId }, data: { vendorId: targetId } }),
          tx.gRN.updateMany({ where: { supplierId: sourceId }, data: { supplierId: targetId } }),
          tx.pRN.updateMany({ where: { supplierId: sourceId }, data: { supplierId: targetId } }),
          tx.batch.updateMany({ where: { vendorId: sourceId }, data: { vendorId: targetId } }),
        ]);

        await tx.sKUVendor.deleteMany({ where: { vendorId: sourceId } });
        await tx.vendor.delete({ where: { id: sourceId } });

        return {
          targetId,
          mergedVendorName: source.name,
          movedUsers: source._count.users,
          movedPrimaryProducts: source._count.skus,
          movedProductLinks: source._count.skuVendors,
          movedGrns: source._count.grns,
          movedPrns: source._count.prns,
          movedBatches: source._count.batches,
          updatedFields: mergedVendor.updatedFields,
          updatedFieldCount: mergedVendor.updatedFields.length,
        };
      });

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message ?? 'Failed to merge supplier' });
    }
  }
);

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
