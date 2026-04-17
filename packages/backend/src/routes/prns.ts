import { Router, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '@jingles/shared';
import { createPRN, submitPRN, markPRNPickedUp } from '../modules/prn/prnService';
import prisma from '../prisma/client';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { status, search, supplierId, page = '1', pageSize = '50' } = req.query as Record<string, string>;
		const user = req.user!;
		const pageNum = parseInt(page);
		const pageSizeNum = parseInt(pageSize);

		const where: Prisma.PRNWhereInput = {};
		if (status) where.status = status;
		if (supplierId) where.supplierId = supplierId;
		if (search) {
			where.OR = [
				{ returnReason: { contains: search, mode: 'insensitive' } },
				{ supplier: { name: { contains: search, mode: 'insensitive' } } },
				{ notes: { contains: search, mode: 'insensitive' } },
			];
		}
		if (user.role === UserRole.Vendor) {
			const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
			if (dbUser?.vendorId) where.supplierId = dbUser.vendorId;
		}

		const [items, total] = await Promise.all([
			prisma.pRN.findMany({
				where,
				skip: (pageNum - 1) * pageSizeNum,
				take: pageSizeNum,
				include: {
					supplier: { select: { id: true, name: true } },
					floor: { include: { branch: { select: { id: true, name: true } } } },
					shelf: { select: { id: true, name: true, code: true } },
					creator: { select: { id: true, email: true } },
					lines: { include: { sku: { select: { id: true, skuCode: true, name: true } }, variant: { include: { attributeValues: { include: { attribute: true, attributeValue: true } } } } } },
				},
				orderBy: { createdAt: 'desc' },
			}),
			prisma.pRN.count({ where }),
		]);

		res.json({
			success: true,
			data: { items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum) },
		});
	} catch (error) {
		logger.error('Get PRNs error', error);
		res.status(500).json({ success: false, error: 'Failed to fetch PRNs' });
	}
});

router.post(
	'/',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const user = req.user!;
			const data: any = { ...req.body, createdBy: user.id };

			// Parse date strings to Date objects for Prisma
			if (data.expectedPickupDate && typeof data.expectedPickupDate === 'string') {
				const dateStr = data.expectedPickupDate.includes('T')
					? data.expectedPickupDate
					: data.expectedPickupDate + 'T00:00:00.000Z';
				data.expectedPickupDate = new Date(dateStr);
			}

			const prn = await createPRN(data);
			res.status(201).json({ success: true, data: prn });
		} catch (error: any) {
			logger.error('Create PRN error', error);
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

router.get(
	'/:id',
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const prn = await prisma.pRN.findUnique({
				where: { id: req.params!.id },
				include: {
					supplier: true,
					floor: { include: { branch: { select: { id: true, name: true } } } },
					shelf: { select: { id: true, name: true, code: true } },
					creator: { select: { id: true, email: true } },
					inspectionRecord: {
						include: {
							inspector: { select: { id: true, email: true } },
							grnLine: {
								include: {
									sku: true,
									grn: { select: { id: true, invoiceReference: true } },
								},
							},
						},
					},
					lines: {
						include: {
							sku: true,
							variant: {
								include: {
									attributeValues: {
										include: { attribute: true, attributeValue: true },
									},
								},
							},
						},
					},
				},
			});

			if (!prn) {
				res.status(404).json({ success: false, error: 'PRN not found' });
				return;
			}
			res.json({ success: true, data: prn });
		} catch (error) {
			logger.error('Get PRN error', error);
			res.status(500).json({ success: false, error: 'Failed to fetch PRN' });
		}
	}
);

router.put(
	'/:id',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const prn = await prisma.pRN.findUnique({ where: { id: req.params!.id } });
			if (!prn) {
				res.status(404).json({ success: false, error: 'PRN not found' });
				return;
			}
			if (prn.status !== 'Draft') {
				res.status(400).json({ success: false, error: 'Only Draft PRNs can be edited' });
				return;
			}
			const { supplierId, returnReason, expectedPickupDate, notes, floorId, shelfId } = req.body;
			const updateData: any = {};
			if (supplierId !== undefined) updateData.supplierId = supplierId;
			if (returnReason !== undefined) updateData.returnReason = returnReason;
			if (notes !== undefined) updateData.notes = notes;
			if (floorId !== undefined) {
				const newFloorId = floorId || null;
				updateData.floorId = newFloorId;
				updateData.shelfId = null;
			}
			if (shelfId !== undefined) updateData.shelfId = shelfId || null;
			if (expectedPickupDate) {
				const parsed = new Date(expectedPickupDate);
				if (isNaN(parsed.getTime())) {
					res.status(400).json({ success: false, error: 'Invalid expectedPickupDate format' });
					return;
				}
				updateData.expectedPickupDate = parsed;
			}
			const updated = await prisma.pRN.update({ where: { id: req.params!.id }, data: updateData });
			res.json({ success: true, data: updated });
		} catch (error: any) {
			logger.error('Update PRN error', error);
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

router.put(
	'/:id/submit',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const user = req.user!;
			const result = await submitPRN(
				req.params!.id,
				user.id,
				req.body.pickupDate ? new Date(req.body.pickupDate) : undefined
			);
			res.json({ success: true, data: result });
		} catch (error: any) {
			logger.error('Submit PRN error', error);
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

router.put(
	'/:id/pickup',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Staff),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const user = req.user!;
			const prn = await markPRNPickedUp(req.params!.id, user.id);
			res.json({ success: true, data: prn });
		} catch (error: any) {
			logger.error('Mark PRN picked up error', error);
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

export default router;
