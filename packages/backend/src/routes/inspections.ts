import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireRole('Admin', 'Manager', 'Inspector'),
  [
    body('grnLineId').isUUID(),
    body('approvedQuantity').isInt({ min: 0 }),
    body('rejectedQuantity').isInt({ min: 0 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { grnLineId, approvedQuantity, rejectedQuantity, damageClassification, remarks } =
      req.body as {
        grnLineId: string;
        approvedQuantity: number;
        rejectedQuantity: number;
        damageClassification?: string;
        remarks?: string;
      };

    const record = await prisma.inspectionRecord.create({
      data: {
        grnLineId,
        approvedQuantity,
        rejectedQuantity,
        damageClassification,
        remarks,
        inspectorUserId: req.user!.id,
      },
    });

    await prisma.gRNLine.update({
      where: { id: grnLineId },
      data: { receivedQuantity: { increment: approvedQuantity } },
    });

    res.status(201).json(record);
  }
);

export default router;
