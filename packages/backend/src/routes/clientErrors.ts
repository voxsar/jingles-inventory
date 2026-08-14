import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';
import {
  appendClientErrorReport,
  sanitizeClientErrorReport,
  type ClientErrorReportInput,
} from '../services/clientErrorLog';

const router = Router();
const limiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

router.post('/', limiter, async (req: Request, res: Response) => {
  try {
    const entry = sanitizeClientErrorReport(
      (req.body ?? {}) as ClientErrorReportInput,
      req.ip || req.socket.remoteAddress || 'unknown',
    );
    logger.error(`[POSClientError:${entry.id}] ${entry.message}`, entry);
    await appendClientErrorReport(entry);
    return res.status(202).json({ accepted: true, reportId: entry.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'Client error message is required') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Failed to persist a POS client error report', error);
    return res.status(500).json({ error: 'Failed to persist client error report' });
  }
});

export default router;
