/**
 * Voucher Routes
 * 
 * API endpoints for gift voucher management:
 * - Create voucher products (SKUs)
 * - Generate voucher codes (single or bulk)
 * - Validate vouchers
 * - Redeem vouchers
 * - Manage voucher restrictions
 * - Track redemption history
 */

import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import {
	createVoucherCode,
	createVoucherBatch,
	validateVoucher,
	redeemVoucher,
	getVoucherBalance,
	getVoucherRedemptionHistory,
	cancelVoucher,
	extendVoucherExpiry,
} from '../services/voucherService';

const router = Router();

router.use(authenticate);

// ── Voucher Code Management ────────────────────────────────────

/**
 * POST /api/vouchers/codes
 * Create a single voucher code
 */
router.post(
	'/codes',
	requireRole('Admin', 'Manager'),
	[
		body('skuId').isUUID(),
		body('variantId').optional().isUUID(),
		body('value').isFloat({ min: 0.01 }),
		body('currency').optional().isString(),
		body('expiresAt').optional().isISO8601(),
		body('customerId').optional().isString(),
		body('orderId').optional().isString(),
		body('purchaseReference').optional().isString(),
		body('notes').optional().isString(),
		body('prefix').optional().isString(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const voucherCode = await createVoucherCode({
				skuId: req.body.skuId,
				variantId: req.body.variantId,
				value: req.body.value,
				currency: req.body.currency,
				expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
				customerId: req.body.customerId,
				orderId: req.body.orderId,
				purchaseReference: req.body.purchaseReference,
				notes: req.body.notes,
				createdBy: req.user!.id,
				prefix: req.body.prefix,
			});

			res.status(201).json({
				success: true,
				data: voucherCode,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * POST /api/vouchers/batches
 * Create a bulk batch of voucher codes
 */
router.post(
	'/batches',
	requireRole('Admin', 'Manager'),
	[
		body('skuId').isUUID(),
		body('variantId').optional().isUUID(),
		body('batchName').isString().notEmpty(),
		body('prefix').optional().isString(),
		body('quantity').isInt({ min: 1, max: 10000 }),
		body('defaultValue').isFloat({ min: 0.01 }),
		body('expiryDays').optional().isInt({ min: 1 }),
		body('defaultExpiresAt').optional().isISO8601(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const batch = await createVoucherBatch({
				skuId: req.body.skuId,
				variantId: req.body.variantId,
				batchName: req.body.batchName,
				prefix: req.body.prefix,
				quantity: req.body.quantity,
				defaultValue: req.body.defaultValue,
				expiryDays: req.body.expiryDays,
				defaultExpiresAt: req.body.defaultExpiresAt
					? new Date(req.body.defaultExpiresAt)
					: null,
				createdBy: req.user!.id,
			});

			res.status(201).json({
				success: true,
				data: batch,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * GET /api/vouchers/codes
 * List voucher codes with filters
 */
router.get(
	'/codes',
	requireRole('Admin', 'Manager', 'Staff'),
	[
		query('skuId').optional().isUUID(),
		query('variantId').optional().isUUID(),
		query('batchId').optional().isUUID(),
		query('status').optional().isString(),
		query('page').optional().isInt({ min: 1 }),
		query('pageSize').optional().isInt({ min: 1, max: 100 }),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const page = parseInt(req.query.page as string) || 1;
			const pageSize = parseInt(req.query.pageSize as string) || 50;
			const skip = (page - 1) * pageSize;

			const where: any = {};
			if (req.query.skuId) where.skuId = req.query.skuId;
			if (req.query.variantId) where.variantId = req.query.variantId;
			if (req.query.batchId) where.voucherBatchId = req.query.batchId;
			if (req.query.status) where.status = req.query.status;

			const [codes, total] = await Promise.all([
				prisma.voucherCode.findMany({
					where,
					include: {
						sku: {
							select: {
								id: true,
								skuCode: true,
								name: true,
							},
						},
						variant: {
							select: {
								id: true,
								variantCode: true,
								name: true,
							},
						},
						voucherBatch: {
							select: {
								id: true,
								batchName: true,
							},
						},
					},
					skip,
					take: pageSize,
					orderBy: { createdAt: 'desc' },
				}),
				prisma.voucherCode.count({ where }),
			]);

			res.json({
				success: true,
				data: codes,
				pagination: {
					page,
					pageSize,
					total,
					totalPages: Math.ceil(total / pageSize),
				},
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * GET /api/vouchers/codes/:code
 * Get voucher code details
 */
router.get(
	'/codes/:code',
	[param('code').isString().notEmpty()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const voucherCode = await prisma.voucherCode.findUnique({
				where: { code: req.params.code },
				include: {
					sku: {
						select: {
							id: true,
							skuCode: true,
							name: true,
							voucherRestrictions: true,
						},
					},
					variant: {
						select: {
							id: true,
							variantCode: true,
							name: true,
						},
					},
					voucherBatch: {
						select: {
							id: true,
							batchName: true,
						},
					},
					redemptions: {
						include: {
							branch: {
								select: {
									id: true,
									name: true,
									code: true,
								},
							},
							redeemer: {
								select: {
									id: true,
									email: true,
								},
							},
						},
						orderBy: {
							redeemedAt: 'desc',
						},
					},
				},
			});

			if (!voucherCode) {
				res.status(404).json({ error: 'Voucher code not found' });
				return;
			}

			res.json({
				success: true,
				data: voucherCode,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * GET /api/vouchers/batches
 * List voucher batches
 */
router.get(
	'/batches',
	requireRole('Admin', 'Manager'),
	[
		query('skuId').optional().isUUID(),
		query('status').optional().isString(),
		query('page').optional().isInt({ min: 1 }),
		query('pageSize').optional().isInt({ min: 1, max: 100 }),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const page = parseInt(req.query.page as string) || 1;
			const pageSize = parseInt(req.query.pageSize as string) || 50;
			const skip = (page - 1) * pageSize;

			const where: any = {};
			if (req.query.skuId) where.skuId = req.query.skuId;
			if (req.query.status) where.status = req.query.status;

			const [batches, total] = await Promise.all([
				prisma.voucherBatch.findMany({
					where,
					include: {
						sku: {
							select: {
								id: true,
								skuCode: true,
								name: true,
							},
						},
						variant: {
							select: {
								id: true,
								variantCode: true,
								name: true,
							},
						},
						_count: {
							select: {
								voucherCodes: true,
							},
						},
					},
					skip,
					take: pageSize,
					orderBy: { createdAt: 'desc' },
				}),
				prisma.voucherBatch.count({ where }),
			]);

			res.json({
				success: true,
				data: batches,
				pagination: {
					page,
					pageSize,
					total,
					totalPages: Math.ceil(total / pageSize),
				},
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

// ── Voucher Validation & Redemption ────────────────────────────

/**
 * POST /api/vouchers/validate
 * Validate a voucher for redemption
 */
router.post(
	'/validate',
	[
		body('voucherCode').isString().notEmpty(),
		body('items').isArray(),
		body('items.*.skuId').isUUID(),
		body('items.*.variantId').optional().isUUID(),
		body('items.*.categoryId').optional().isUUID(),
		body('items.*.quantity').isInt({ min: 1 }),
		body('items.*.price').isFloat({ min: 0 }),
		body('totalAmount').isFloat({ min: 0 }),
		body('branchId').optional().isUUID(),
		body('hasOtherVouchers').optional().isBoolean(),
		body('hasDiscounts').optional().isBoolean(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const validationResult = await validateVoucher(req.body);

			res.json({
				success: true,
				data: validationResult,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * POST /api/vouchers/redeem
 * Redeem a voucher
 */
router.post(
	'/redeem',
	requireRole('Admin', 'Manager', 'Staff'),
	[
		body('voucherCode').isString().notEmpty(),
		body('redeemedAmount').isFloat({ min: 0.01 }),
		body('orderId').optional().isString(),
		body('invoiceNumber').optional().isString(),
		body('branchId').optional().isUUID(),
		body('appliedToItems').optional().isArray(),
		body('notes').optional().isString(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const result = await redeemVoucher({
				voucherCode: req.body.voucherCode,
				redeemedAmount: req.body.redeemedAmount,
				orderId: req.body.orderId,
				invoiceNumber: req.body.invoiceNumber,
				branchId: req.body.branchId,
				appliedToItems: req.body.appliedToItems,
				redeemedBy: req.user!.id,
				notes: req.body.notes,
			});

			res.json({
				success: true,
				data: result,
			});
		} catch (error: any) {
			res.status(400).json({ error: error.message });
		}
	}
);

/**
 * GET /api/vouchers/balance/:code
 * Get voucher balance
 */
router.get(
	'/balance/:code',
	[param('code').isString().notEmpty()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const balance = await getVoucherBalance(req.params.code);

			res.json({
				success: true,
				data: balance,
			});
		} catch (error: any) {
			res.status(404).json({ error: error.message });
		}
	}
);

/**
 * GET /api/vouchers/redemptions/:code
 * Get voucher redemption history
 */
router.get(
	'/redemptions/:code',
	requireRole('Admin', 'Manager', 'Staff'),
	[param('code').isString().notEmpty()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const history = await getVoucherRedemptionHistory(req.params.code);

			res.json({
				success: true,
				data: history,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

// ── Voucher Restrictions ────────────────────────────────────────

/**
 * POST /api/vouchers/restrictions
 * Create/update voucher restrictions for a SKU
 */
router.post(
	'/restrictions',
	requireRole('Admin', 'Manager'),
	[
		body('skuId').isUUID(),
		body('restrictionType').isString().notEmpty(),
		body('targetCategoryIds').optional().isArray(),
		body('targetSkuIds').optional().isArray(),
		body('targetVariantIds').optional().isArray(),
		body('cannotCombineWithDiscounts').optional().isBoolean(),
		body('cannotCombineWithOtherVouchers').optional().isBoolean(),
		body('minPurchaseAmount').optional().isFloat({ min: 0 }),
		body('maxDiscountAmount').optional().isFloat({ min: 0 }),
		body('priority').optional().isInt(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const restriction = await prisma.voucherRestriction.upsert({
				where: {
					skuId_restrictionType: {
						skuId: req.body.skuId,
						restrictionType: req.body.restrictionType,
					},
				},
				create: {
					skuId: req.body.skuId,
					restrictionType: req.body.restrictionType,
					targetCategoryIds: req.body.targetCategoryIds || [],
					targetSkuIds: req.body.targetSkuIds || [],
					targetVariantIds: req.body.targetVariantIds || [],
					cannotCombineWithDiscounts: req.body.cannotCombineWithDiscounts ?? true,
					cannotCombineWithOtherVouchers:
						req.body.cannotCombineWithOtherVouchers ?? true,
					minPurchaseAmount: req.body.minPurchaseAmount,
					maxDiscountAmount: req.body.maxDiscountAmount,
					priority: req.body.priority ?? 0,
				},
				update: {
					targetCategoryIds: req.body.targetCategoryIds || [],
					targetSkuIds: req.body.targetSkuIds || [],
					targetVariantIds: req.body.targetVariantIds || [],
					cannotCombineWithDiscounts: req.body.cannotCombineWithDiscounts ?? true,
					cannotCombineWithOtherVouchers:
						req.body.cannotCombineWithOtherVouchers ?? true,
					minPurchaseAmount: req.body.minPurchaseAmount,
					maxDiscountAmount: req.body.maxDiscountAmount,
					priority: req.body.priority ?? 0,
				},
			});

			res.json({
				success: true,
				data: restriction,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * GET /api/vouchers/restrictions/:skuId
 * Get all restrictions for a voucher SKU
 */
router.get(
	'/restrictions/:skuId',
	requireRole('Admin', 'Manager'),
	[param('skuId').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const restrictions = await prisma.voucherRestriction.findMany({
				where: { skuId: req.params.skuId },
				orderBy: { priority: 'desc' },
			});

			res.json({
				success: true,
				data: restrictions,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * DELETE /api/vouchers/restrictions/:id
 * Delete a voucher restriction
 */
router.delete(
	'/restrictions/:id',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			await prisma.voucherRestriction.delete({
				where: { id: req.params.id },
			});

			res.json({
				success: true,
				message: 'Restriction deleted successfully',
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

// ── Voucher Management ──────────────────────────────────────────

/**
 * PUT /api/vouchers/codes/:code/cancel
 * Cancel a voucher
 */
router.put(
	'/codes/:code/cancel',
	requireRole('Admin', 'Manager'),
	[param('code').isString().notEmpty(), body('reason').optional().isString()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const voucherCode = await cancelVoucher(
				req.params.code,
				req.body.reason
			);

			res.json({
				success: true,
				data: voucherCode,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

/**
 * PUT /api/vouchers/codes/:code/extend
 * Extend voucher expiry date
 */
router.put(
	'/codes/:code/extend',
	requireRole('Admin', 'Manager'),
	[
		param('code').isString().notEmpty(),
		body('newExpiryDate').isISO8601().notEmpty(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const voucherCode = await extendVoucherExpiry(
				req.params.code,
				new Date(req.body.newExpiryDate)
			);

			res.json({
				success: true,
				data: voucherCode,
			});
		} catch (error: any) {
			res.status(500).json({ error: error.message });
		}
	}
);

export default router;
