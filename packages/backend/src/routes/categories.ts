import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Helper to build nested category tree
function buildTree(categories: any[]): any[] {
  const map: Record<string, any> = {};
  const roots: any[] = [];
  categories.forEach(c => { map[c.id] = { ...c, children: [] }; });
  categories.forEach(c => {
    if (c.parentId && map[c.parentId]) {
      map[c.parentId].children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

router.get('/', async (_req, res: Response): Promise<void> => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: categories });
});

router.get('/tree', async (_req, res: Response): Promise<void> => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: buildTree(categories) });
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
    const category = await prisma.category.findUnique({
      where: { id: req.params!.id },
      include: { children: true, parent: true },
    });
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json({ success: true, data: category });
  }
);

router.post(
  '/',
  requireRole('Admin', 'Manager'),
  [
    body('name').notEmpty().trim(),
    body('slug').notEmpty().trim(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, slug, description, parentId, sortOrder } = req.body as {
      name: string;
      slug: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
    };
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      res.status(409).json({ error: 'A category with this slug already exists' });
      return;
    }
    const category = await prisma.category.create({
      data: { name, slug, description, parentId, sortOrder: sortOrder ?? 0 },
    });
    res.status(201).json({ success: true, data: category });
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
    const { name, slug, description, parentId, sortOrder, isActive } = req.body as {
      name?: string;
      slug?: string;
      description?: string;
      parentId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    };
    const category = await prisma.category.update({
      where: { id: req.params!.id },
      data: { name, slug, description, parentId, sortOrder, isActive },
    });
    res.json({ success: true, data: category });
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
    const childCount = await prisma.category.count({ where: { parentId: req.params!.id } });
    if (childCount > 0) {
      res.status(400).json({ error: 'Cannot delete a category that has sub-categories' });
      return;
    }
    await prisma.category.delete({ where: { id: req.params!.id } });
    res.json({ success: true, message: 'Category deleted' });
  }
);

export default router;
