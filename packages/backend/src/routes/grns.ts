import { Router, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '@jingles/shared';
import { createGRN, submitGRN, submitInspection } from '../modules/grn/grnService';
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

		const where: any = {};
		if (status) where.status = status;
		if (supplierId) where.supplierId = supplierId;
		if (search) {
			where.OR = [
				{ invoiceReference: { contains: search, mode: 'insensitive' } },
				{ supplier: { name: { contains: search, mode: 'insensitive' } } },
				{ notes: { contains: search, mode: 'insensitive' } },
			];
		}
		if (user.role === UserRole.Vendor) {
			const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
			if (dbUser?.vendorId) where.supplierId = dbUser.vendorId;
		}

		const [items, total] = await Promise.all([
			prisma.gRN.findMany({
				where,
				skip: (pageNum - 1) * pageSizeNum,
				take: pageSizeNum,
				include: {
					supplier: { select: { id: true, name: true } },
					floor: true,
					creator: { select: { id: true, email: true } },
					lines: { include: { sku: { select: { id: true, skuCode: true, name: true } } } },
				},
				orderBy: { createdAt: 'desc' },
			}),
			prisma.gRN.count({ where }),
		]);

		res.json({
			success: true,
			data: { items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum) },
		});
	} catch (error) {
		logger.error('Get GRNs error', error);
		res.status(500).json({ success: false, error: 'Failed to fetch GRNs' });
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
			if (data.expectedDeliveryDate && typeof data.expectedDeliveryDate === 'string') {
				// Append time if not present to create valid ISO-8601 DateTime
				const dateStr = data.expectedDeliveryDate.includes('T')
					? data.expectedDeliveryDate
					: data.expectedDeliveryDate + 'T00:00:00.000Z';
				data.expectedDeliveryDate = new Date(dateStr);
			}
			if (data.supplierInvoiceDate && typeof data.supplierInvoiceDate === 'string') {
				const dateStr = data.supplierInvoiceDate.includes('T')
					? data.supplierInvoiceDate
					: data.supplierInvoiceDate + 'T00:00:00.000Z';
				data.supplierInvoiceDate = new Date(dateStr);
			}

			const grn = await createGRN(data);
			res.status(201).json({ success: true, data: grn });
		} catch (error: any) {
			logger.error('Create GRN error', error);
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
			const grn = await prisma.gRN.findUnique({
				where: { id: req.params!.id },
				include: {
					supplier: true,
					floor: true,
					creator: { select: { id: true, email: true } },
					lines: {
						include: {
							sku: true,
							inspectionRecords: {
								include: { inspector: { select: { id: true, email: true } } },
							},
						},
					},
				},
			});

			if (!grn) {
				res.status(404).json({ success: false, error: 'GRN not found' });
				return;
			}
			res.json({ success: true, data: grn });
		} catch (error) {
			logger.error('Get GRN error', error);
			res.status(500).json({ success: false, error: 'Failed to fetch GRN' });
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
			const grn = await prisma.gRN.findUnique({ where: { id: req.params!.id } });
			if (!grn) {
				res.status(404).json({ success: false, error: 'GRN not found' });
				return;
			}
			if (grn.status !== 'Draft') {
				res.status(400).json({ success: false, error: 'Only Draft GRNs can be edited' });
				return;
			}
			const { supplierId, invoiceReference, expectedDeliveryDate, notes, floorId } = req.body;
			const updateData: any = {};
			if (supplierId !== undefined) updateData.supplierId = supplierId;
			if (invoiceReference !== undefined) updateData.invoiceReference = invoiceReference;
			if (notes !== undefined) updateData.notes = notes;
			if (floorId !== undefined) updateData.floorId = floorId || null;
			if (expectedDeliveryDate) {
				// Parse the date string safely; if no time component, treat as UTC midnight
				const parsed = new Date(expectedDeliveryDate);
				if (isNaN(parsed.getTime())) {
					res.status(400).json({ success: false, error: 'Invalid expectedDeliveryDate format' });
					return;
				}
				updateData.expectedDeliveryDate = parsed;
			}
			const updated = await prisma.gRN.update({ where: { id: req.params!.id }, data: updateData });
			res.json({ success: true, data: updated });
		} catch (error: any) {
			logger.error('Update GRN error', error);
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
			const result = await submitGRN(
				req.params!.id,
				user.id,
				req.body.deliveryDate ? new Date(req.body.deliveryDate) : undefined
			);
			res.json({ success: true, data: result });
		} catch (error: any) {
			logger.error('Submit GRN error', error);
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

router.post(
	'/:id/inspect',
	requireRole(UserRole.Admin, UserRole.Manager, UserRole.Inspector),
	async (req: AuthRequest, res: Response): Promise<void> => {
		try {
			const user = req.user!;
			const inspection = await submitInspection({ ...req.body, inspectorUserId: user.id });
			res.status(201).json({ success: true, data: inspection });
		} catch (error: any) {
			logger.error('Inspection error', error);
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

export default router;
