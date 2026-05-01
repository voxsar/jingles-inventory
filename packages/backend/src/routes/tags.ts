import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getPagination, paginatedPayload } from '../utils/pagination';

const router = Router();

router.use(authenticate);

// GET /api/tags - List all tags
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { search, hasColor, usage } = req.query as { search?: string; hasColor?: string; usage?: string };
  const pagination = getPagination(req.query);

  const where: Prisma.TagWhereInput = {
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    ...(hasColor === 'true'
      ? { color: { not: null } }
      : hasColor === 'false'
        ? { color: null }
        : {}),
    ...(usage === 'used'
      ? { skus: { some: {} } }
      : usage === 'unused'
        ? { skus: { none: {} } }
        : {}),
  };

  const include = {
    skus: {
      select: {
        sku: { select: { id: true, name: true, skuCode: true } },
      },
    },
  };

  const tags = pagination.isPaginated
    ? await prisma.tag.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { name: 'asc' },
        include,
      })
    : await prisma.tag.findMany({
        where,
        orderBy: { name: 'asc' },
        include,
      });

  const tagsWithCount = tags.map((tag) => ({
    ...tag,
    skuCount: tag.skus.length,
  }));

  if (pagination.isPaginated) {
    const total = await prisma.tag.count({ where });
    res.json({ success: true, data: paginatedPayload(tagsWithCount, total, pagination.page, pagination.pageSize) });
    return;
  }

  res.json(tagsWithCount);
});

// GET /api/tags/:id - Get a single tag
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const tag = await prisma.tag.findUnique({
      where: { id: req.params!.id },
      include: {
        skus: {
          select: {
            sku: { select: { id: true, name: true, skuCode: true } },
          },
        },
      },
    });

    if (!tag) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }

    res.json(tag);
  }
);

// POST /api/tags - Create a new tag
router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('name').notEmpty().isString(),
    body('color').optional({ nullable: true }).isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, color } = req.body as {
      name: string;
      color?: string;
    };

    // Check if tag with this name already exists
    const existing = await prisma.tag.findUnique({ where: { name } });
    if (existing) {
      res.status(400).json({ error: 'Tag with this name already exists' });
      return;
    }

    const tag = await prisma.tag.create({
      data: { name, color },
    });

    res.status(201).json(tag);
  }
);

// PUT /api/tags/:id - Update a tag
router.put(
  '/:id',
  requireRole('Admin', 'Manager'),
  [
    param('id').isUUID(),
    body('name').optional().isString(),
    body('color').optional({ nullable: true }).isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, color } = req.body as {
      name?: string;
      color?: string;
    };

    // If updating name, check uniqueness
    if (name) {
      const existing = await prisma.tag.findUnique({ where: { name } });
      if (existing && existing.id !== req.params!.id) {
        res.status(400).json({ error: 'Tag with this name already exists' });
        return;
      }
    }

    const tag = await prisma.tag.update({
      where: { id: req.params!.id },
      data: { name, color },
    });

    res.json(tag);
  }
);

// DELETE /api/tags/:id - Delete a tag
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

    // Delete will cascade to SKUTag join table automatically
    await prisma.tag.delete({
      where: { id: req.params!.id },
    });

    res.json({ success: true });
  }
);

export default router;
