import { Request, Response, Router } from 'express';
import {
  ensurePosCloudSchema,
  getPosCatalogSnapshot,
  posSyncConfirm,
  posSyncHandshake,
  posSyncPlayback,
} from '../services/posCloud';

const router = Router();

function readVectorClock(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, number>;
}

router.use(async (_req, res, next) => {
  try {
    await ensurePosCloudSchema();
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'POS cloud sync service is unavailable' });
  }
});

router.get('/catalog/snapshot', async (_req: Request, res: Response) => {
  try {
    return res.json(await getPosCatalogSnapshot());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load the POS catalog snapshot' });
  }
});

router.post('/sync/handshake', async (req: Request, res: Response) => {
  try {
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
