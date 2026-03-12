import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { calculateFloorUsage, getStackingSuggestions } from '../modules/space/spaceEngine';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

router.get('/calculate', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { floor } = req.query as { floor?: string };
    if (!floor) {
      res.status(400).json({ success: false, error: 'floor parameter required' });
      return;
    }

    const data = await calculateFloorUsage(floor);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Space calculate error', error);
    res.status(500).json({ success: false, error: 'Failed to calculate space' });
  }
});

router.get('/stacking-suggestions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { skuId, locationId } = req.query as { skuId?: string; locationId?: string };
    if (!skuId || !locationId) {
      res.status(400).json({ success: false, error: 'skuId and locationId are required' });
      return;
    }

    const data = await getStackingSuggestions(skuId, locationId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Stacking suggestions error', error);
    res.status(500).json({ success: false, error: 'Failed to get stacking suggestions' });
  }
});

export default router;
