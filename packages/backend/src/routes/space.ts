import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { calculateShelfUsage, getStackingSuggestions } from '../modules/space/spaceEngine';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

router.get('/calculate', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shelfId } = req.query as { shelfId?: string };
    if (!shelfId) {
      res.status(400).json({ success: false, error: 'shelfId parameter required' });
      return;
    }

    const data = await calculateShelfUsage(shelfId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Space calculate error', error);
    res.status(500).json({ success: false, error: 'Failed to calculate space' });
  }
});

router.get('/stacking-suggestions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { skuId, floorId } = req.query as { skuId?: string; floorId?: string };
    if (!skuId || !floorId) {
      res.status(400).json({ success: false, error: 'skuId and floorId are required' });
      return;
    }

    const data = await getStackingSuggestions(skuId, floorId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Stacking suggestions error', error);
    res.status(500).json({ success: false, error: 'Failed to get stacking suggestions' });
  }
});

export default router;
