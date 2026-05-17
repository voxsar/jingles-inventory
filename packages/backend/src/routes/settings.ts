import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { testTypesenseConnection } from '../modules/typesense/client';
import { startSyncJob } from '../modules/typesense/syncService';
import { getJob, getAllJobs } from '../modules/typesense/jobTracker';
import logger from '../utils/logger';
import { getPagination, paginatedPayload } from '../utils/pagination';

const router = Router();

router.use(authenticate);

router.get('/units', async (req: AuthRequest, res: Response): Promise<void> => {
	const { search } = req.query as { search?: string };
	const pagination = getPagination(req.query);
	const where: Prisma.UnitOfMeasureWhereInput | undefined = search
		? {
			OR: [
				{ name: { contains: search, mode: 'insensitive' } },
				{ abbreviation: { contains: search, mode: 'insensitive' } },
				{ type: { contains: search, mode: 'insensitive' } },
				{ baseUnit: { contains: search, mode: 'insensitive' } },
			],
		}
		: undefined;
	if (pagination.isPaginated) {
		const [items, total] = await Promise.all([
			prisma.unitOfMeasure.findMany({
				where,
				skip: pagination.skip,
				take: pagination.take,
				orderBy: [{ type: 'asc' }, { name: 'asc' }],
			}),
			prisma.unitOfMeasure.count({ where }),
		]);
		res.json({ success: true, data: paginatedPayload(items, total, pagination.page, pagination.pageSize) });
		return;
	}

	const units = await prisma.unitOfMeasure.findMany({
		where,
		orderBy: [{ type: 'asc' }, { name: 'asc' }],
	});
	res.json({ success: true, data: units });
});

router.post(
	'/units',
	requireRole('Admin'),
	[
		body('name').notEmpty().trim(),
		body('abbreviation').notEmpty().trim(),
		body('type').notEmpty(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { name, abbreviation, baseUnit, conversionFactor, type } = req.body as {
			name: string;
			abbreviation: string;
			baseUnit?: string;
			conversionFactor?: number;
			type: string;
		};
		const existing = await prisma.unitOfMeasure.findUnique({ where: { name } });
		if (existing) {
			res.status(409).json({ error: 'A unit with this name already exists' });
			return;
		}
		const unit = await prisma.unitOfMeasure.create({
			data: { name, abbreviation, baseUnit, conversionFactor, type },
		});
		res.status(201).json({ success: true, data: unit });
	}
);

router.put(
	'/units/:id',
	requireRole('Admin'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const existing = await prisma.unitOfMeasure.findUnique({ where: { id: req.params!.id } });
		if (!existing) {
			res.status(404).json({ error: 'Unit not found' });
			return;
		}
		if (existing.isSystem) {
			res.status(403).json({ error: 'Cannot modify system units' });
			return;
		}
		const unit = await prisma.unitOfMeasure.update({
			where: { id: req.params!.id },
			data: req.body,
		});
		res.json({ success: true, data: unit });
	}
);

router.delete(
	'/units/:id',
	requireRole('Admin'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const existing = await prisma.unitOfMeasure.findUnique({ where: { id: req.params!.id } });
		if (!existing) {
			res.status(404).json({ error: 'Unit not found' });
			return;
		}
		if (existing.isSystem) {
			res.status(403).json({ error: 'Cannot delete system units' });
			return;
		}
		await prisma.unitOfMeasure.delete({ where: { id: req.params!.id } });
		res.json({ success: true, message: 'Unit deleted' });
	}
);

// ── Status Options ────────────────────────────────────────

const VALID_ENTITY_TYPES = ['inventory', 'product', 'location', 'branch', 'supplier', 'grn', 'stock_transfer', 'damage_classification', 'vendor_type'];

router.get('/statuses', async (req: AuthRequest, res: Response): Promise<void> => {
	const { entityType } = req.query as { entityType?: string };
	const pagination = getPagination(req.query);
	const where: Prisma.StatusOptionWhereInput = { isActive: true };
	if (entityType) where.entityType = entityType;
	if (pagination.isPaginated) {
		const [items, total] = await Promise.all([
			prisma.statusOption.findMany({
				where,
				skip: pagination.skip,
				take: pagination.take,
				orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
			}),
			prisma.statusOption.count({ where }),
		]);
		res.json({ success: true, data: paginatedPayload(items, total, pagination.page, pagination.pageSize) });
		return;
	}

	const statuses = await prisma.statusOption.findMany({
		where,
		orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
	});
	res.json({ success: true, data: statuses });
});

router.post(
	'/statuses',
	requireRole('Admin'),
	[
		body('entityType').notEmpty().isIn(VALID_ENTITY_TYPES),
		body('value').notEmpty().trim(),
		body('label').notEmpty().trim(),
		body('color').optional({ nullable: true }).isString(),
		body('sortOrder').optional({ nullable: true }).isInt({ min: 0 }),
		body('isDefault').optional().isBoolean(),
		body('specialKey').optional({ nullable: true }).trim(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { entityType, value, label, color, sortOrder, isDefault, specialKey } = req.body as {
			entityType: string;
			value: string;
			label: string;
			color?: string;
			sortOrder?: number;
			isDefault?: boolean;
			specialKey?: string;
		};
		const existing = await prisma.statusOption.findUnique({ where: { entityType_value: { entityType, value } } });
		if (existing) {
			res.status(409).json({ error: 'A status with this value already exists for this entity type' });
			return;
		}
		if (specialKey) {
			const existingKey = await prisma.statusOption.findUnique({ where: { specialKey } });
			if (existingKey) {
				res.status(409).json({ error: 'A status with this special key already exists' });
				return;
			}
		}
		const status = await prisma.statusOption.create({
			data: { entityType, value, label, color, sortOrder: sortOrder ?? 0, isDefault: isDefault ?? false, specialKey: specialKey || null },
		});
		res.status(201).json({ success: true, data: status });
	}
);

router.put(
	'/statuses/:id',
	requireRole('Admin'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const existing = await prisma.statusOption.findUnique({ where: { id: req.params!.id } });
		if (!existing) {
			res.status(404).json({ error: 'Status option not found' });
			return;
		}
		const { label, color, sortOrder, isDefault, isActive, specialKey } = req.body as {
			label?: string;
			color?: string;
			sortOrder?: number;
			isDefault?: boolean;
			isActive?: boolean;
			specialKey?: string | null;
		};
		// Check if specialKey is being changed and if it conflicts
		if (specialKey !== undefined && specialKey !== existing.specialKey && specialKey !== null) {
			const existingKey = await prisma.statusOption.findUnique({ where: { specialKey } });
			if (existingKey) {
				res.status(409).json({ error: 'A status with this special key already exists' });
				return;
			}
		}
		const status = await prisma.statusOption.update({
			where: { id: req.params!.id },
			data: { label, color, sortOrder, isDefault, isActive, specialKey: specialKey === undefined ? undefined : specialKey },
		});
		res.json({ success: true, data: status });
	}
);

router.delete(
	'/statuses/:id',
	requireRole('Admin'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const existing = await prisma.statusOption.findUnique({ where: { id: req.params!.id } });
		if (!existing) {
			res.status(404).json({ error: 'Status option not found' });
			return;
		}
		await prisma.statusOption.delete({ where: { id: req.params!.id } });
		res.json({ success: true, message: 'Status option deleted' });
	}
);

// ── Typesense Sync ────────────────────────────────────────

router.get('/typesense/test', requireRole('Admin'), async (_req, res: Response): Promise<void> => {
	try {
		const result = await testTypesenseConnection();
		if (result.success) {
			res.json({ success: true, message: 'Typesense connection successful' });
		} else {
			res.status(500).json({ success: false, error: result.error });
		}
	} catch (error: any) {
		logger.error('Typesense test error', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

router.post('/typesense/sync', requireRole('Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { entity, recreate } = req.body as { entity?: string; recreate?: boolean };

		// Start async job and return immediately
		const jobId = startSyncJob(entity, recreate);

		res.json({ 
			success: true, 
			data: { jobId },
			message: 'Sync job started. Use the status endpoint to check progress.' 
		});
	} catch (error: any) {
		logger.error('Typesense sync error', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/typesense/jobs', requireRole('Admin'), async (_req, res: Response): Promise<void> => {
	try {
		const jobs = getAllJobs();
		res.json({ success: true, data: jobs });
	} catch (error: any) {
		logger.error('Get typesense jobs error', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/typesense/jobs/:jobId', requireRole('Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const job = getJob(req.params!.jobId);
		if (!job) {
			res.status(404).json({ success: false, error: 'Job not found' });
			return;
		}
		res.json({ success: true, data: job });
	} catch (error: any) {
		logger.error('Get typesense job error', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

export default router;
