import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '@jingles/shared';
import { getPagination, paginatedPayload } from '../utils/pagination';

const router = Router();
const ACCESS_SCOPES = ['CASHIER', 'INVENTORY', 'BOTH', 'ADMIN'] as const;

function permissionRoleForAccess(accessScope: string, currentRole?: string) {
  if (currentRole === UserRole.Vendor || currentRole === UserRole.Inspector) return currentRole;
  return accessScope === 'ADMIN' ? UserRole.Admin : UserRole.Staff;
}

const validPin = (value: unknown) => {
  const pin = String(value ?? '');
  return /^\d{4,6}$/.test(pin) && pin !== pin.split('').reverse().join('');
};

const configuredPinUserIds = async () => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "users" WHERE "pin_hash" IS NOT NULL
  `;
  return new Set(rows.map((row) => row.id));
};

const publicUser = <T extends object>(user: T, pinUserIds: Set<string>) => {
  const id = 'id' in user ? String(user.id) : '';
  return { ...user, hasPin: pinUserIds.has(id) };
};

router.use(authenticate);
router.use(requireRole('Admin', 'Manager'));

// GET /api/users - List all users
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { role, accessScope, isActive, search } = req.query as {
    role?: string;
    accessScope?: string;
    isActive?: string;
    search?: string;
    vendorId?: string;
  };
  const pagination = getPagination(req.query);

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(accessScope ? { accessScope } : {}),
    ...(req.query.vendorId ? { vendorId: req.query.vendorId as string } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    ...(search
      ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { legacyCode: { contains: search, mode: 'insensitive' } },
        ],
      }
      : {}),
  };

  const select = {
    id: true,
    email: true,
    name: true,
    phone: true,
    role: true,
    accessScope: true,
    isSalesman: true,
    legacyCode: true,
    vendorId: true,
    createdAt: true,
    isActive: true,
    vendor: {
      select: {
        id: true,
        name: true,
      },
    },
  };

  if (pagination.isPaginated) {
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select,
      }),
      prisma.user.count({ where }),
    ]);
    const pinUserIds = await configuredPinUserIds();
    res.json({
      success: true,
      data: paginatedPayload(
        items.map((item) => publicUser(item, pinUserIds)),
        total,
        pagination.page,
        pagination.pageSize
      ),
    });
    return;
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select,
  });

  const pinUserIds = await configuredPinUserIds();
  res.json(users.map((user) => publicUser(user, pinUserIds)));
});

// GET /api/users/:id - Get a single user
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params!.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        accessScope: true,
        isSalesman: true,
        legacyCode: true,
        vendorId: true,
        createdAt: true,
        isActive: true,
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(publicUser(user, await configuredPinUserIds()));
  }
);

// POST /api/users - Create a new user
router.post(
  '/',
  requireRole('Admin'),
  [
    body('email').isEmail().normalizeEmail(),
    body('phone').optional({ nullable: true }).trim(),
    body('password').isLength({ min: 6 }),
    body('pin')
      .custom(validPin)
      .withMessage('PIN must contain 4 to 6 digits and cannot read the same backwards'),
    body('role').isIn(Object.values(UserRole)),
    body('accessScope').optional().isIn(ACCESS_SCOPES),
    body('isSalesman').optional().isBoolean(),
    body('name').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('legacyCode').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('vendorId')
      .optional({ nullable: true })
      .if(body('vendorId').notEmpty())
      .isUUID(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, name, phone, password, pin, role, accessScope = 'BOTH', isSalesman = true, legacyCode, vendorId } = req.body as {
      email: string;
      name?: string | null;
      phone?: string;
      password: string;
      pin: string;
      role: string;
      accessScope?: string;
      isSalesman?: boolean;
      legacyCode?: string | null;
      vendorId?: string;
    };

    // Check if user with this email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'User with this email already exists' });
      return;
    }

    if (legacyCode) {
      const existingLegacy = await prisma.user.findUnique({ where: { legacyCode } });
      if (existingLegacy) {
        res.status(400).json({ error: 'User with this legacy code already exists' });
        return;
      }
    }

    // Validate vendor role logic
    if (role === UserRole.Vendor && !vendorId) {
      res.status(400).json({ error: 'Vendor role requires a vendorId' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = await bcrypt.hash(pin, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        phone: phone || null,
        passwordHash,
        role: permissionRoleForAccess(accessScope, role),
        accessScope,
        isSalesman,
        legacyCode: legacyCode || null,
        vendorId: vendorId || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        accessScope: true,
        isSalesman: true,
        legacyCode: true,
        vendorId: true,
        createdAt: true,
        isActive: true,
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await prisma.$executeRaw`
      UPDATE "users" SET "pin_hash" = ${pinHash} WHERE "id" = ${user.id}
    `;
    res.status(201).json({ ...user, hasPin: true });
  }
);

// PUT /api/users/:id - Update a user
router.put(
  '/:id',
  requireRole('Admin'),
  [
    param('id').isUUID(),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional({ nullable: true }).trim(),
    body('role').optional().isIn(Object.values(UserRole)),
    body('accessScope').optional().isIn(ACCESS_SCOPES),
    body('isSalesman').optional().isBoolean(),
    body('name').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('legacyCode').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('vendorId')
      .optional({ nullable: true })
      .if(body('vendorId').notEmpty())
      .isUUID(),
    body('isActive').optional().isBoolean(),
    body('pin')
      .optional()
      .custom(validPin)
      .withMessage('PIN must contain 4 to 6 digits and cannot read the same backwards'),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, name, phone, role, accessScope, isSalesman, legacyCode, vendorId, isActive, pin } = req.body as {
      email?: string;
      name?: string | null;
      phone?: string | null;
      role?: string;
      accessScope?: string;
      isSalesman?: boolean;
      legacyCode?: string | null;
      vendorId?: string | null;
      isActive?: boolean;
      pin?: string;
    };

    // If updating email, check uniqueness
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== req.params!.id) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }
    }

    // If updating legacy code, check uniqueness
    if (legacyCode) {
      const existingLegacy = await prisma.user.findUnique({ where: { legacyCode } });
      if (existingLegacy && existingLegacy.id !== req.params!.id) {
        res.status(400).json({ error: 'User with this legacy code already exists' });
        return;
      }
    }

    // Validate vendor role logic
    if (role === UserRole.Vendor && vendorId === null) {
      res.status(400).json({ error: 'Vendor role requires a vendorId' });
      return;
    }

    if (pin) {
      const pinHash = await bcrypt.hash(pin, 10);
      await prisma.$executeRaw`
        UPDATE "users" SET "pin_hash" = ${pinHash} WHERE "id" = ${req.params!.id}
      `;
    }

    const user = await prisma.user.update({
      where: { id: req.params!.id },
      data: {
        email,
        name,
        phone,
        role: accessScope ? permissionRoleForAccess(accessScope, role) : role,
        accessScope,
        isSalesman,
        legacyCode,
        vendorId,
        isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        accessScope: true,
        isSalesman: true,
        legacyCode: true,
        vendorId: true,
        createdAt: true,
        isActive: true,
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json(publicUser(user, await configuredPinUserIds()));
  }
);

// PUT /api/users/:id/password - Update user password
router.put(
  '/:id/password',
  requireRole('Admin'),
  [
    param('id').isUUID(),
    body('password').isLength({ min: 6 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { password } = req.body as { password: string };

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: req.params!.id },
      data: { passwordHash },
    });

    res.json({ success: true, message: 'Password updated successfully' });
  }
);

// DELETE /api/users/:id - Delete a user (soft delete by setting isActive=false)
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

    // Don't allow deleting yourself
    if (req.params!.id === req.user?.id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Soft delete by setting isActive to false
    await prisma.user.update({
      where: { id: req.params!.id },
      data: { isActive: false },
    });

    res.json({ success: true });
  }
);

export default router;
