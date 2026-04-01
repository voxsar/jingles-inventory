import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as overlayService from '../modules/pricing/overlayService';
import * as pricingService from '../modules/pricing/pricingService';
import { UserRole, PricingOverlayType, PricingOverlayStatus } from '@jingles/shared';

const router = Router();

// List overlays
router.get(
	'/',
	authenticate(),
	validate([
		query('status').optional().isIn(Object.values(PricingOverlayStatus)),
		query('type').optional().isIn(Object.values(PricingOverlayType)),
		query('page').optional().isInt({ min: 1 }).toInt(),
		query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
	]),
	async (req, res) => {
		try {
			const result = await overlayService.listOverlays({
				status: req.query.status as string,
				type: req.query.type as string,
				page: req.query.page ? parseInt(req.query.page as string) : undefined,
				pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
			});
			res.json({ success: true, data: result });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Get single overlay
router.get(
	'/:id',
	authenticate(),
	validate([param('id').isUUID()]),
	async (req, res) => {
		try {
			const overlay = await overlayService.getOverlay(req.params.id);
			res.json({ success: true, data: overlay });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

// Create overlay
router.post(
	'/',
	authenticate(),
	requireRole([UserRole.Admin, UserRole.Manager]),
	validate([
		body('name').notEmpty().isString(),
		body('description').optional({ nullable: true }).isString(),
		body('type').isIn(Object.values(PricingOverlayType)),
		body('value').isFloat(),
		body('appliesTo').isObject(),
		body('appliesTo.skuIds').optional().isArray(),
		body('appliesTo.variantIds').optional().isArray(),
		body('appliesTo.batchIds').optional().isArray(),
		body('appliesTo.categoryIds').optional().isArray(),
		body('conditions').optional({ nullable: true }).isObject(),
		body('priority').optional().isInt(),
		body('stackable').optional().isBoolean(),
		body('status').optional().isIn(Object.values(PricingOverlayStatus)),
		body('validFrom').optional({ nullable: true }).isISO8601().toDate(),
		body('validTo').optional({ nullable: true }).isISO8601().toDate(),
	]),
	async (req, res) => {
		try {
			const userId = (req as any).user?.id;
			const overlay = await overlayService.createOverlay({
				...req.body,
				createdBy: userId,
			});
			res.status(201).json({ success: true, data: overlay });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Update overlay
router.put(
	'/:id',
	authenticate(),
	requireRole([UserRole.Admin, UserRole.Manager]),
	validate([
		param('id').isUUID(),
		body('name').optional().isString(),
		body('description').optional({ nullable: true }).isString(),
		body('type').optional().isIn(Object.values(PricingOverlayType)),
		body('value').optional().isFloat(),
		body('appliesTo').optional().isObject(),
		body('conditions').optional({ nullable: true }).isObject(),
		body('priority').optional().isInt(),
		body('stackable').optional().isBoolean(),
		body('status').optional().isIn(Object.values(PricingOverlayStatus)),
		body('validFrom').optional({ nullable: true }).isISO8601().toDate(),
		body('validTo').optional({ nullable: true }).isISO8601().toDate(),
	]),
	async (req, res) => {
		try {
			const overlay = await overlayService.updateOverlay(req.params.id, req.body);
			res.json({ success: true, data: overlay });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Delete overlay (soft delete)
router.delete(
	'/:id',
	authenticate(),
	requireRole([UserRole.Admin, UserRole.Manager]),
	validate([param('id').isUUID()]),
	async (req, res) => {
		try {
			const overlay = await overlayService.deleteOverlay(req.params.id);
			res.json({ success: true, data: overlay });
		} catch (error: any) {
			res.status(400).json({ success: false, error: error.message });
		}
	}
);

// Get conflicts for an overlay
router.get(
	'/:id/conflicts',
	authenticate(),
	validate([param('id').isUUID()]),
	async (req, res) => {
		try {
			const conflicts = await overlayService.detectOverlayConflicts(req.params.id);
			res.json({ success: true, data: conflicts });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

// Resolve price with overlays (new endpoint for layered pricing)
router.post(
	'/resolve-price',
	authenticate(),
	validate([
		body('skuId').isUUID(),
		body('variantId').optional({ nullable: true }).isUUID(),
		body('batchId').optional({ nullable: true }).isUUID(),
		body('quantity').optional().isInt({ min: 1 }),
		body('priceType').optional().isIn(['cost', 'selling', 'wholesale', 'bulk']),
		body('customerGroup').optional().isString(),
		body('customerType').optional().isString(),
		body('branchId').optional().isUUID(),
	]),
	async (req, res) => {
		try {
			const resolvedPrice = await pricingService.getPriceWithOverlays({
				skuId: req.body.skuId,
				variantId: req.body.variantId,
				batchId: req.body.batchId,
				quantity: req.body.quantity,
				customerGroup: req.body.customerGroup,
				customerType: req.body.customerType,
				branchId: req.body.branchId,
				priceType: req.body.priceType,
				date: req.body.date ? new Date(req.body.date) : undefined,
			});
			res.json({ success: true, data: resolvedPrice });
		} catch (error: any) {
			res.status(404).json({ success: false, error: error.message });
		}
	}
);

export default router;
