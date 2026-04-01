import { Router, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import * as batchService from '../modules/batch/batchService';
import * as pricingService from '../modules/pricing/pricingService';
import { UserRole } from '@jingles/shared';

const router = Router();

router.use(authenticate);

// List batches
router.get(
	'/',
	[
		query('skuId').optional().isUUID(),
		query('variantId').optional().isUUID(),
		query('isActive').optional().isBoolean(),
		query('page').optional().isInt({ min: 1 }).toInt(),
		query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const result = await batchService.listBatches({
				skuId: req.query.skuId as string,
				variantId: req.query.variantId as string,
				isActive:
					req.query.isActive === undefined
						? undefined
						: req.query.isActive === 'true',
				page: req.query.page ? parseInt(req.query.page as string) : undefined,
				pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
			});
			res.json({ success: true, data: result });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Get single batch
router.get(
	'/:id',
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const batch = await batchService.getBatch(req.params.id);
			res.json({ success: true, data: batch });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

// Get batch by batch number
router.get(
	'/by-number/:batchNumber',
	[param('batchNumber').notEmpty()],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const batch = await batchService.getBatchByNumber(req.params.batchNumber);
			res.json({ success: true, data: batch });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

// Create batch
router.post(
	'/',
	requireRole('Admin', 'Manager'),
	[
		body('skuId').isUUID(),
		body('variantId').optional({ nullable: true }).isUUID(),
		body('costPrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('sellingPrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('wholesalePrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('bulkPrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('currency').optional().isString(),
		body('marginType').optional({ nullable: true }).isIn(['fixed', 'percentage']),
		body('marginValue').optional({ nullable: true }).isFloat(),
		body('expiryDate').optional({ nullable: true }).isISO8601().toDate(),
		body('manufacturingDate').optional({ nullable: true }).isISO8601().toDate(),
		body('notes').optional({ nullable: true }).isString(),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const batch = await batchService.createBatch(req.body);
			res.status(201).json({ success: true, data: batch });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Update batch
router.put(
	'/:id',
	requireRole('Admin', 'Manager'),
	[
		param('id').isUUID(),
		body('costPrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('sellingPrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('wholesalePrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('bulkPrice').optional({ nullable: true }).isFloat({ min: 0 }),
		body('currency').optional().isString(),
		body('marginType').optional({ nullable: true }).isIn(['fixed', 'percentage']),
		body('marginValue').optional({ nullable: true }).isFloat(),
		body('expiryDate').optional({ nullable: true }).isISO8601().toDate(),
		body('manufacturingDate').optional({ nullable: true }).isISO8601().toDate(),
		body('notes').optional({ nullable: true }).isString(),
		body('isActive').optional().isBoolean(),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const batch = await batchService.updateBatch(req.params.id, req.body);
			res.json({ success: true, data: batch });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Apply margin to calculate selling price
router.post(
	'/:id/apply-margin',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const batch = await batchService.applyMargin(req.params.id);
			res.json({ success: true, data: batch });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Bulk operations
router.post(
	'/bulk/update-pricing',
	requireRole('Admin', 'Manager'),
	[
		body('batchIds').isArray({ min: 1 }),
		body('batchIds.*').isUUID(),
		body('operation').isIn(['set', 'increase_fixed', 'increase_percentage']),
		body('priceField').isIn(['costPrice', 'sellingPrice', 'wholesalePrice', 'bulkPrice']),
		body('value').isFloat(),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const result = await batchService.bulkUpdateBatchPricing(req.body);
			res.json({ success: true, data: result });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

router.post(
	'/bulk/apply-margin',
	requireRole('Admin', 'Manager'),
	[
		body('batchIds').isArray({ min: 1 }),
		body('batchIds.*').isUUID(),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const result = await batchService.bulkApplyMargin(req.body.batchIds);
			res.json({ success: true, data: result });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Get pricing for a product
router.get(
	'/pricing/get',
	[
		query('skuId').isUUID(),
		query('variantId').optional().isUUID(),
		query('batchId').optional().isUUID(),
		query('quantity').optional().isInt({ min: 1 }).toInt(),
		query('priceType').optional().isIn(['cost', 'selling', 'wholesale', 'bulk']),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const price = await pricingService.getPrice({
				skuId: req.query.skuId as string,
				variantId: req.query.variantId as string,
				batchId: req.query.batchId as string,
				quantity: req.query.quantity ? parseInt(req.query.quantity as string) : undefined,
				priceType: req.query.priceType as any,
			});
			res.json({ success: true, data: price });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

// Get pricing summary for a batch
router.get(
	'/pricing/summary/:batchId',
	[param('batchId').isUUID()],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const summary = await pricingService.getBatchPricingSummary(req.params.batchId);
			res.json({ success: true, data: summary });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

// Get average prices for SKU/Variant
router.get(
	'/pricing/average',
	[
		query('skuId').isUUID(),
		query('variantId').optional().isUUID(),
	],
	async (req: AuthRequest, res: Response) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const averages = await pricingService.getAveragePrices(
				req.query.skuId as string,
				req.query.variantId as string
			);
			res.json({ success: true, data: averages });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

export default router;
