import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getPagination, paginatedPayload } from '../utils/pagination';

const router = Router();

router.use(authenticate);

router.get('/', [query('branchId').optional().isUUID()], async (req: AuthRequest, res: Response): Promise<void> => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.status(400).json({ errors: errors.array() });
		return;
	}
	const where: Prisma.FloorWhereInput = { isActive: true };
	if (req.query?.branchId) where.branchId = req.query.branchId as string;
	const pagination = getPagination(req.query);
	if (pagination.isPaginated) {
		const [items, total] = await Promise.all([
			prisma.floor.findMany({
				where,
				skip: pagination.skip,
				take: pagination.take,
				include: {
					branch: { select: { id: true, name: true, code: true } },
					_count: { select: { inventoryRecords: true, shelves: true } },
				},
				orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
			}),
			prisma.floor.count({ where }),
		]);
		res.json({ success: true, data: paginatedPayload(items, total, pagination.page, pagination.pageSize) });
		return;
	}

	const floors = await prisma.floor.findMany({
		where,
		include: {
			branch: { select: { id: true, name: true, code: true } },
			_count: { select: { inventoryRecords: true, shelves: true } },
		},
		orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
	});
	res.json(floors);
});

router.get(
	'/:id',
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const floor = await prisma.floor.findUnique({
			where: { id: req.params!.id },
			include: {
				branch: { select: { id: true, name: true, code: true } },
				shelves: {
					where: { isActive: true },
					include: { _count: { select: { boxes: true } } },
				},
				_count: { select: { inventoryRecords: true, shelves: true } },
			},
		});
		if (!floor) {
			res.status(404).json({ error: 'Floor not found' });
			return;
		}
		res.json(floor);
	}
);

router.post(
	'/',
	requireRole('Admin', 'Manager'),
	[
		body('branchId').isUUID(),
		body('name').notEmpty(),
		body('code').notEmpty(),
		body('floorNumber').isInt({ min: 1 }),
		body('length').optional({ nullable: true }).isFloat({ min: 0 }),
		body('width').optional({ nullable: true }).isFloat({ min: 0 }),
		body('notes').optional().isString(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { branchId, name, code, floorNumber, length, width, notes } = req.body as {
			branchId: string;
			name: string;
			code: string;
			floorNumber: number;
			length?: number;
			width?: number;
			notes?: string;
		};
		const floor = await prisma.floor.create({
			data: { branchId, name, code, floorNumber, length, width, notes },
			include: { branch: { select: { id: true, name: true, code: true } } },
		});
		res.status(201).json(floor);
	}
);

router.put(
	'/:id',
	requireRole('Admin', 'Manager'),
	[
		param('id').isUUID(),
		body('name').optional().notEmpty(),
		body('code').optional().notEmpty(),
		body('floorNumber').optional().isInt({ min: 1 }),
		body('length').optional({ nullable: true }).isFloat({ min: 0 }),
		body('width').optional({ nullable: true }).isFloat({ min: 0 }),
		body('notes').optional().isString(),
		body('isActive').optional().isBoolean(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { name, code, floorNumber, length, width, notes, isActive } = req.body;
		const floor = await prisma.floor.update({
			where: { id: req.params!.id },
			data: { name, code, floorNumber, length, width, notes, isActive },
			include: { branch: { select: { id: true, name: true, code: true } } },
		});
		res.json(floor);
	}
);

router.delete(
	'/:id',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const floor = await prisma.floor.findUnique({ where: { id: req.params!.id } });
		if (!floor) {
			res.status(404).json({ error: 'Floor not found' });
			return;
		}
		await prisma.inventoryRecord.updateMany({
			where: { floorId: req.params!.id },
			data: { floorId: null },
		});
		const updated = await prisma.floor.update({
			where: { id: req.params!.id },
			data: { isActive: false },
		});
		res.json({ success: true, data: updated });
	}
);

export default router;
