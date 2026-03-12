import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';
import logger from '../utils/logger';

interface SyncOperation {
  operation: string;
  payload: Record<string, unknown>;
}

const router = Router();

router.use(authenticate);

router.post('/push', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId, operations } = req.body as { clientId: string; operations: SyncOperation[] };

    if (!clientId || !Array.isArray(operations)) {
      res.status(400).json({ success: false, error: 'clientId and operations array are required' });
      return;
    }

    const results = [];

    for (const op of operations) {
      const entry = await prisma.syncQueue.create({
        data: {
          clientId,
          operation: op.operation,
          payload: op.payload,
          status: 'Pending',
        },
      });
      results.push(entry);
    }

    const processed = [];
    for (const entry of results) {
      try {
        let conflictFlag = false;
        let conflictNotes: string | undefined;

        if (entry.operation === 'UPSERT_INVENTORY') {
          const payload = entry.payload as { id?: string; version?: number; quantity?: number; state?: string };
          const existing = payload.id
            ? await prisma.inventoryRecord.findUnique({ where: { id: payload.id } })
            : null;

          if (existing && existing.version > (payload.version ?? 0)) {
            conflictFlag = true;
            conflictNotes = `Server version ${existing.version} is newer than client version ${payload.version}`;
          } else if (existing && payload.id) {
            await prisma.inventoryRecord.update({
              where: { id: payload.id },
              data: { quantity: payload.quantity, state: payload.state, version: { increment: 1 } },
            });
          }
        }

        await prisma.syncQueue.update({
          where: { id: entry.id },
          data: {
            status: conflictFlag ? 'Conflict' : 'Processed',
            processedAt: new Date(),
            conflictFlag,
            conflictNotes,
          },
        });

        processed.push({ id: entry.id, status: conflictFlag ? 'Conflict' : 'Processed', conflictNotes });
      } catch (err: any) {
        await prisma.syncQueue.update({
          where: { id: entry.id },
          data: { status: 'Failed' },
        });
        processed.push({ id: entry.id, status: 'Failed', error: err.message });
      }
    }

    res.json({ success: true, data: { processed } });
  } catch (error) {
    logger.error('Sync push error', error);
    res.status(500).json({ success: false, error: 'Sync push failed' });
  }
});

router.get('/pull', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId, since } = req.query as { clientId?: string; since?: string };

    if (!clientId) {
      res.status(400).json({ success: false, error: 'clientId is required' });
      return;
    }

    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [inventoryRecords, inventoryEvents, grns] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where: { updatedAt: { gte: sinceDate } },
        include: { sku: true },
        take: 500,
      }),
      prisma.inventoryEvent.findMany({
        where: { timestamp: { gte: sinceDate } },
        take: 500,
        orderBy: { timestamp: 'asc' },
      }),
      prisma.gRN.findMany({
        where: { updatedAt: { gte: sinceDate } },
        include: { lines: true },
        take: 100,
      }),
    ]);

    const conflicts = await prisma.syncQueue.findMany({
      where: { clientId, conflictFlag: true, status: 'Conflict' },
    });

    res.json({
      success: true,
      data: { inventoryRecords, inventoryEvents, grns, conflicts, since: sinceDate },
    });
  } catch (error) {
    logger.error('Sync pull error', error);
    res.status(500).json({ success: false, error: 'Sync pull failed' });
  }
});

export default router;
