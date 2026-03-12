import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { processScan } from '../modules/barcode/barcodeProcessor';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

router.post('/scan', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { barcode, terminalId } = req.body as { barcode: string; terminalId?: string };
    const user = req.user!;

    if (!barcode) {
      res.status(400).json({ success: false, error: 'barcode is required' });
      return;
    }

    const result = await processScan(barcode, user.id, terminalId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Barcode scan error', error);
    res.status(500).json({ success: false, error: error.message ?? 'Barcode scan failed' });
  }
});

export default router;
