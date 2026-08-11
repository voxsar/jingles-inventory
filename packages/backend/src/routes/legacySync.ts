import express, { Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { LegacySyncChunk } from '@jingles/shared';
import { AuthRequest } from '../middleware/auth';
import { authenticateLegacySyncRequest } from '../middleware/legacySyncAuth';
import {
	applyChunk,
	completeRun,
	getRun,
	getStatus,
	listLinks,
	openRun,
} from '../modules/legacySync/legacySyncService';
import { listLegacyPosRecords } from '../services/posCloud';

const router = Router();

// Sync chunks pushed by the desktop app can carry a few hundred product rows;
// the global JSON parser's default limit is too small, so this router parses
// its own bodies (it is mounted before the global parser).
router.use(express.json({ limit: '100mb' }));
router.use(authenticateLegacySyncRequest);

router.get('/status', async (_req: AuthRequest, res: Response) => {
	try {
		res.json({ success: true, data: await getStatus() });
	} catch (err: any) {
		res.status(500).json({ success: false, error: err.message ?? 'Failed to load legacy sync status' });
	}
});

router.get(
	'/pos-records',
	[
		query('sourceTable').optional().isString().isLength({ max: 120 }),
		query('page').optional().isInt({ min: 1 }),
		query('pageSize').optional().isInt({ min: 1, max: 500 }),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const data = await listLegacyPosRecords({
				sourceTable: req.query.sourceTable as string | undefined,
				page: req.query.page ? Number(req.query.page) : undefined,
				pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
			});
			res.json({ success: true, data });
		} catch (err: any) {
			res.status(500).json({ success: false, error: err.message ?? 'Failed to list legacy POS records' });
		}
	},
);

router.get(
	'/links',
	[
		query('sourceType').optional().isString(),
		query('q').optional().isString(),
		query('page').optional().isInt({ min: 1 }),
		query('pageSize').optional().isInt({ min: 1, max: 200 }),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const data = await listLinks({
				sourceType: req.query.sourceType as string | undefined,
				q: req.query.q as string | undefined,
				page: req.query.page ? Number(req.query.page) : undefined,
				pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
			});
			res.json({ success: true, data });
		} catch (err: any) {
			res.status(500).json({ success: false, error: err.message ?? 'Failed to list legacy links' });
		}
	},
);

router.post(
	'/runs',
	[body('agentId').optional().isString().isLength({ max: 120 })],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const run = await openRun(req.body.agentId);
			res.status(201).json({ success: true, data: run });
		} catch (err: any) {
			res.status(500).json({ success: false, error: err.message ?? 'Failed to open legacy sync run' });
		}
	},
);

router.post(
	'/runs/:runId/chunks',
	[param('runId').isUUID()],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const run = await getRun(req.params.runId);
			if (!run) {
				res.status(404).json({ success: false, error: 'Sync run not found' });
				return;
			}
			if (run.status !== 'Running') {
				res.status(409).json({ success: false, error: `Sync run is ${run.status}; open a new run.` });
				return;
			}

			const chunk = (req.body ?? {}) as LegacySyncChunk;
			const result = await applyChunk(run.id, chunk);
			res.json({ success: true, data: result });
		} catch (err: any) {
			res.status(500).json({ success: false, error: err.message ?? 'Failed to apply legacy sync chunk' });
		}
	},
);

router.post(
	'/runs/:runId/complete',
	[
		param('runId').isUUID(),
		body('status').optional().isIn(['Completed', 'CompletedWithWarnings', 'Failed']),
		body('errorMessage').optional().isString().isLength({ max: 4000 }),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const run = await getRun(req.params.runId);
			if (!run) {
				res.status(404).json({ success: false, error: 'Sync run not found' });
				return;
			}

			const completed = await completeRun(run.id, {
				status: req.body.status,
				stats: req.body.stats,
				errorMessage: req.body.errorMessage,
			});
			res.json({ success: true, data: completed });
		} catch (err: any) {
			res.status(500).json({ success: false, error: err.message ?? 'Failed to complete legacy sync run' });
		}
	},
);

export default router;
