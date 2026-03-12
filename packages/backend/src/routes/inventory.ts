import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { skuId, locationId, state } = req.query as {
    skuId?: string;
    locationId?: string;
    state?: string;
  };
  const records = await prisma.inventoryRecord.findMany({
    where: {
      ...(skuId ? { skuId } : {}),
      ...(locationId ? { locationId } : {}),
      ...(state ? { state } : {}),
    },
    include: { sku: true, location: true },
  });
  res.json(records);
});

router.post(
  '/adjust',
  requireRole('Admin', 'Manager', 'Staff'),
  [
    body('skuId').isUUID(),
    body('quantity').isInt({ min: 0 }),
    body('state').notEmpty(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { skuId, batchId, locationId, quantity, state, terminalId } = req.body as {
      skuId: string;
      batchId?: string;
      locationId?: string;
      quantity: number;
      state: string;
      terminalId?: string;
    };

    const record = await prisma.inventoryRecord.create({
      data: {
        skuId,
        batchId,
        locationId,
        quantity,
        state,
        terminalId,
        userId: req.user!.id,
      },
    });
    res.status(201).json(record);
  }
);

export default router;
