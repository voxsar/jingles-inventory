import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getDashboardStats, refreshDashboardStats } from '../modules/dashboard/dashboardService';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

// GET /api/dashboard/stats - Get cached dashboard statistics
router.get('/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
	try {
		const stats = await getDashboardStats();
		res.json({ success: true, data: stats });
	} catch (error) {
		logger.error('Get dashboard stats error', error);
		res.status(500).json({ success: false, error: 'Failed to get dashboard statistics' });
	}
});

// POST /api/dashboard/refresh - Force refresh of dashboard statistics (admin only)
router.post('/refresh', async (_req: AuthRequest, res: Response): Promise<void> => {
	try {
		await refreshDashboardStats();
		const stats = await getDashboardStats();
		res.json({ success: true, data: stats });
	} catch (error) {
		logger.error('Refresh dashboard stats error', error);
		res.status(500).json({ success: false, error: 'Failed to refresh dashboard statistics' });
	}
});

export default router;
