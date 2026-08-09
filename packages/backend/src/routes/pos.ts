import { Request, Response, Router } from 'express';
import { authenticatePosSyncRequest } from '../middleware/posSyncAuth';
import {
  ensurePosCloudSchema,
  getPosCatalogSnapshot,
  listLegacyPosRecords,
  posSyncConfirm,
  posSyncHandshake,
  posSyncPlayback,
} from '../services/posCloud';
import { validateVoucher } from '../services/voucherService';
import { isLocalReplicaMode } from '../utils/runtimePaths';
import { getPosLanVectorClock, queuePosLanPlayback } from '../services/posLanBridge';

const router = Router();

function readVectorClock(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, number>;
}

router.use(async (_req, res, next) => {
  if (isLocalReplicaMode()) {
    next();
    return;
  }
  try {
    await ensurePosCloudSchema();
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'POS cloud sync service is unavailable' });
  }
});

router.use(authenticatePosSyncRequest);

router.get('/catalog/snapshot', async (_req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'The LAN hub catalog is still converging; use the cloud fallback.' });
    }
    return res.json(await getPosCatalogSnapshot());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load the POS catalog snapshot' });
  }
});

router.get('/legacy-records', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'Legacy POS records are available from the cloud host.' });
    }
    return res.json(await listLegacyPosRecords({
      sourceTable: typeof req.query.sourceTable === 'string' ? req.query.sourceTable : undefined,
      page: typeof req.query.page === 'string' ? Number(req.query.page) : undefined,
      pageSize: typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : undefined,
    }));
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? 'Failed to load legacy POS records' });
  }
});

router.post('/vouchers/validate', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'Voucher validation requires the cloud host.' });
    }
    const result = await validateVoucher(req.body);
    return res.status(result.isValid ? 200 : 422).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Voucher validation failed' });
  }
});

router.post('/sync/handshake', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.json({
        serverVectorClock: await getPosLanVectorClock(),
        pendingRemoteCount: 0,
        conflictCount: 0,
      });
    }
    return res.json(await posSyncHandshake(readVectorClock(req.body?.vectorClock)));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'POS sync handshake failed' });
  }
});

router.post('/sync/playback', async (req: Request, res: Response) => {
  try {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    const terminalId = typeof req.body?.terminalId === 'string' ? req.body.terminalId.trim() : '';
    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    if (!deviceId || !terminalId) {
      return res.status(400).json({ error: 'deviceId and terminalId are required' });
    }

    if (isLocalReplicaMode()) {
      return res.json(await queuePosLanPlayback({
        deviceId,
        terminalId,
        vectorClock: readVectorClock(req.body?.vectorClock),
        events,
      }));
    }

    return res.json(
      await posSyncPlayback({
        deviceId,
        terminalId,
        vectorClock: readVectorClock(req.body?.vectorClock),
        events,
      }),
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'POS sync playback failed' });
  }
});

router.post('/sync/confirm', async (req: Request, res: Response) => {
  try {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    const terminalId = typeof req.body?.terminalId === 'string' ? req.body.terminalId.trim() : '';

    if (!deviceId || !terminalId) {
      return res.status(400).json({ error: 'deviceId and terminalId are required' });
    }


    if (isLocalReplicaMode()) {
      return res.json({ serverVectorClock: await getPosLanVectorClock() });
    }

    return res.json({
      serverVectorClock: await posSyncConfirm({
        deviceId,
        terminalId,
        vectorClock: readVectorClock(req.body?.vectorClock),
      }),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'POS sync confirmation failed' });
  }
});

export default router;
