import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
	const { vendorId, categoryId, isActive, search, page = '1', pageSize = '20' } = req.query as {
		vendorId?: string;
		categoryId?: string;
		isActive?: string;
		search?: string;
		page?: string;
		pageSize?: string;
	};

	const skip = (parseInt(page) - 1) * parseInt(pageSize);

	const where: Prisma.SKUWhereInput = {
		...(vendorId ? { skuVendors: { some: { vendorId } } } : {}),
		...(categoryId ? { categoryId } : {}),
		...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
		...(search
			? {
				OR: [
					{ name: { contains: search, mode: 'insensitive' } },
					{ skuCode: { contains: search, mode: 'insensitive' } },
					{ description: { contains: search, mode: 'insensitive' } },
				],
			}
			: {}),
	};

	const [items, total] = await Promise.all([
		prisma.sKU.findMany({
			where,
			skip,
			take: parseInt(pageSize),
			include: {
				vendor: true,
				category: true,
				images: { where: { isPrimary: true }, take: 1 },
				barcodes: { where: { isDefault: true }, take: 1 },
				tags: { include: { tag: true } },
				skuVendors: { include: { vendor: true } },
				_count: { select: { variants: true } },
			},
			orderBy: { createdAt: 'desc' },
		}),
		prisma.sKU.count({ where }),
	]);

	res.json({ success: true, data: { items, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
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
		const sku = await prisma.sKU.findUnique({
			where: { id: req.params!.id },
			include: {
				vendor: true,
				category: { include: { parent: true } },
				images: { orderBy: { sortOrder: 'asc' } },
				barcodes: { orderBy: { isDefault: 'desc' } },
				tags: { include: { tag: true } },
				skuVendors: { include: { vendor: true } },
				skuAttributes: {
					include: {
						attribute: { include: { values: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } },
						selectedValues: { include: { attributeValue: true } },
					},
				},
				variants: {
					include: {
						attributeValues: {
							include: { attribute: true, attributeValue: true },
						},
					},
					orderBy: { createdAt: 'asc' },
				},
			},
		});
		if (!sku) {
			res.status(404).json({ error: 'SKU not found' });
			return;
		}
		res.json({ success: true, data: sku });
	}
);

router.post(
	'/',
	requireRole('Admin', 'Manager'),
	[
		body('skuCode').notEmpty(),
		body('name').notEmpty(),
		body('unitOfMeasure').notEmpty(),
	],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const {
			skuCode,
			name,
			description,
			categoryId,
			vendorId,
			vendorIds,
			unitOfMeasure,
			unitOfMeasureId,
			conversionRules,
			dimensions,
			isFragile,
			maxStackHeight,
			costPrice,
			sellingPrice,
			wholesalePrice,
			bulkPrice,
			marginType,
			marginValue,
			currency,
			batchPricing,
			batchReferencePricing,
			lowStockThreshold,
			attributeSelections,
		} = req.body as {
			skuCode: string;
			name: string;
			description?: string;
			categoryId?: string;
			vendorId?: string;
			vendorIds?: string[];
			unitOfMeasure: string;
			unitOfMeasureId?: string;
			conversionRules?: object;
			dimensions?: object;
			isFragile?: boolean;
			maxStackHeight?: number;
			costPrice?: number;
			sellingPrice?: number;
			wholesalePrice?: number;
			bulkPrice?: number;
			marginType?: 'fixed' | 'percentage';
			marginValue?: number;
			currency?: string;
			batchPricing?: object;
			batchReferencePricing?: object;
			lowStockThreshold?: number;
			attributeSelections?: { attributeId: string; valueIds: string[] }[];
		};

		// Resolve vendor IDs: prefer vendorIds array, fall back to single vendorId
		const resolvedVendorIds = vendorIds && vendorIds.length > 0 ? vendorIds : (vendorId ? [vendorId] : []);
		if (resolvedVendorIds.length === 0) {
			res.status(400).json({ error: 'At least one vendor must be selected' });
			return;
		}
		// Use the first vendor as the primary vendorId (for backwards compatibility)
		const primaryVendorId = resolvedVendorIds[0];

		// Create the SKU
		const sku = await prisma.sKU.create({
			data: {
				skuCode,
				name,
				description,
				categoryId,
				vendorId: primaryVendorId,
				unitOfMeasure,
				unitOfMeasureId,
				conversionRules,
				dimensions,
				isFragile: isFragile ?? false,
				maxStackHeight,
				costPrice,
				sellingPrice,
				wholesalePrice,
				bulkPrice,
				marginType,
				marginValue,
				currency,
				batchPricing,
				batchReferencePricing,
				lowStockThreshold,
				skuVendors: {
					create: resolvedVendorIds.map(vid => ({ vendorId: vid })),
				},
			},
		});

		// If attributeSelections provided, generate variants
		let variants: any[] = [];
		console.log('[SKU Create] Received attributeSelections:', attributeSelections);
		if (attributeSelections && Array.isArray(attributeSelections) && attributeSelections.length > 0) {
			console.log('[SKU Create] Starting variant generation for', attributeSelections.length, 'attributes');
			// Validate all attributes and values exist
			for (const sel of attributeSelections) {
				if (!sel.attributeId || !Array.isArray(sel.valueIds) || sel.valueIds.length === 0) {
					await prisma.sKU.delete({ where: { id: sku.id } }); // Rollback SKU creation
					res.status(400).json({ error: 'Each attribute selection must have attributeId and non-empty valueIds' });
					return;
				}
				const attr = await prisma.attribute.findUnique({ where: { id: sel.attributeId } });
				if (!attr) {
					await prisma.sKU.delete({ where: { id: sku.id } });
					res.status(400).json({ error: `Attribute ${sel.attributeId} not found` });
					return;
				}
				const valCount = await prisma.attributeValue.count({
					where: { id: { in: sel.valueIds }, attributeId: sel.attributeId },
				});
				if (valCount !== sel.valueIds.length) {
					await prisma.sKU.delete({ where: { id: sku.id } });
					res.status(400).json({ error: `Some attribute values for ${attr.name} are invalid` });
					return;
				}
			}

			// Build attribute value objects for cartesian product
			type ComboItem = { attributeId: string; attributeValueId: string; valueLabel: string };
			const attributeValueGroups = await Promise.all(
				attributeSelections.map(async (sel) => {
					const vals = await prisma.attributeValue.findMany({
						where: { id: { in: sel.valueIds }, attributeId: sel.attributeId },
						orderBy: { sortOrder: 'asc' },
					});
					return vals.map((v: { id: string; displayName: string }) => ({
						attributeId: sel.attributeId,
						attributeValueId: v.id,
						valueLabel: v.displayName
					}));
				})
			);

			// Cartesian product helper
			function cartesian(arrays: ComboItem[][]): ComboItem[][] {
				return arrays.reduce<ComboItem[][]>(
					(acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
					[[]]
				);
			}

			// Upsert SKUAttribute assignments
			for (const sel of attributeSelections) {
				const skuAttr = await prisma.sKUAttribute.upsert({
					where: { skuId_attributeId: { skuId: sku.id, attributeId: sel.attributeId } },
					update: {},
					create: { skuId: sku.id, attributeId: sel.attributeId },
				});
				// Update selected values
				await prisma.sKUAttributeValue.deleteMany({ where: { skuAttributeId: skuAttr.id } });
				const attrValues = await prisma.attributeValue.findMany({
					where: { id: { in: sel.valueIds } },
				});
				await prisma.sKUAttributeValue.createMany({
					data: attrValues.map((av: { id: string }) => ({ skuAttributeId: skuAttr.id, attributeValueId: av.id })),
					skipDuplicates: true,
				});
			}

			// Generate variants from cartesian product
			const combos = cartesian(attributeValueGroups);
			console.log('[SKU Create] Generated', combos.length, 'variant combinations');
			for (const combo of combos) {
				const variantCode = `${sku.skuCode}-${combo.map((c) => c.valueLabel).join('-')}`;
				const variantName = combo.map((c) => c.valueLabel).join(' / ');
				console.log('[SKU Create] Creating variant:', variantCode, variantName);

				// Ensure unique variant code
				let finalCode = variantCode;
				let codeExists = await prisma.sKUVariant.findUnique({ where: { variantCode: finalCode } });
				let suffix = 1;
				while (codeExists) {
					finalCode = `${variantCode}-${suffix++}`;
					codeExists = await prisma.sKUVariant.findUnique({ where: { variantCode: finalCode } });
				}

				await prisma.sKUVariant.create({
					data: {
						skuId: sku.id,
						variantCode: finalCode,
						name: variantName,
						attributeValues: {
							create: combo.map((c) => ({
								attributeId: c.attributeId,
								attributeValueId: c.attributeValueId,
							})),
						},
					},
				});
			}

			// Fetch created variants
			variants = await prisma.sKUVariant.findMany({
				where: { skuId: sku.id },
				include: {
					attributeValues: {
						include: { attribute: true, attributeValue: true },
					},
				},
				orderBy: { createdAt: 'asc' },
			});
			console.log('[SKU Create] Fetched', variants.length, 'variants from database');
		} else {
			console.log('[SKU Create] No attributeSelections provided or empty array');
		}

		const responseData = {
			...sku,
			variants,
			variantCount: variants.length
		};
		console.log('[SKU Create] Sending response with', responseData.variantCount, 'variants');

		res.status(201).json({
			success: true,
			data: responseData
		});
	}
);

router.put(
	'/:id',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { vendorIds, ...rest } = req.body;

		// If vendorIds is provided, sync the SKUVendor pivot table
		if (vendorIds && Array.isArray(vendorIds)) {
			// Delete existing and recreate
			await prisma.sKUVendor.deleteMany({ where: { skuId: req.params!.id } });
			if (vendorIds.length > 0) {
				await prisma.sKUVendor.createMany({
					data: vendorIds.map((vid: string) => ({ skuId: req.params!.id, vendorId: vid })),
					skipDuplicates: true,
				});
				// Update primary vendorId to the first one
				rest.vendorId = vendorIds[0];
			}
		}

		const sku = await prisma.sKU.update({
			where: { id: req.params!.id },
			data: rest,
			include: { skuVendors: { include: { vendor: true } } },
		});
		res.json({ success: true, data: sku });
	}
);

// --- Barcodes ---
router.get(
	'/:id/barcodes',
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const barcodes = await prisma.productBarcode.findMany({
			where: { skuId: req.params!.id },
			orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
		});
		res.json({ success: true, data: barcodes });
	}
);

router.post(
	'/:id/barcodes',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), body('barcode').notEmpty()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { barcode, barcodeType, isDefault, label } = req.body as {
			barcode: string;
			barcodeType?: string;
			isDefault?: boolean;
			label?: string;
		};
		if (isDefault) {
			await prisma.productBarcode.updateMany({
				where: { skuId: req.params!.id },
				data: { isDefault: false },
			});
		}
		const bc = await prisma.productBarcode.create({
			data: {
				skuId: req.params!.id,
				barcode,
				barcodeType: barcodeType ?? 'EAN13',
				isDefault: isDefault ?? false,
				label,
			},
		});
		res.status(201).json({ success: true, data: bc });
	}
);

router.delete(
	'/:id/barcodes/:bcId',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), param('bcId').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		await prisma.productBarcode.delete({ where: { id: req.params!.bcId } });
		res.json({ success: true, message: 'Barcode deleted' });
	}
);

// --- Images ---
router.get(
	'/:id/images',
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const images = await prisma.productImage.findMany({
			where: { skuId: req.params!.id },
			orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
		});
		res.json({ success: true, data: images });
	}
);

router.post(
	'/:id/images',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), body('url').notEmpty().isURL()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { url, altText, isPrimary, sortOrder } = req.body as {
			url: string;
			altText?: string;
			isPrimary?: boolean;
			sortOrder?: number;
		};
		if (isPrimary) {
			await prisma.productImage.updateMany({
				where: { skuId: req.params!.id },
				data: { isPrimary: false },
			});
		}
		const image = await prisma.productImage.create({
			data: {
				skuId: req.params!.id,
				url,
				altText,
				isPrimary: isPrimary ?? false,
				sortOrder: sortOrder ?? 0,
			},
		});
		res.status(201).json({ success: true, data: image });
	}
);

router.delete(
	'/:id/images/:imgId',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), param('imgId').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		await prisma.productImage.delete({ where: { id: req.params!.imgId } });
		res.json({ success: true, message: 'Image deleted' });
	}
);

// --- Tags ---
router.get('/tags/all', async (_req, res: Response): Promise<void> => {
	const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
	res.json({ success: true, data: tags });
});

// Create a new global tag
router.post(
	'/tags/create',
	requireRole('Admin', 'Manager'),
	[body('name').notEmpty().trim()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		try {
			const tag = await prisma.tag.upsert({
				where: { name: req.body.name.trim() },
				create: { name: req.body.name.trim(), color: req.body.color },
				update: {},
			});
			res.status(201).json({ success: true, data: tag });
		} catch (err: any) {
			res.status(400).json({ success: false, error: err.message });
		}
	}
);

router.post(
	'/:id/tags',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), body('tagId').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		await prisma.sKUTag.upsert({
			where: { skuId_tagId: { skuId: req.params!.id, tagId: req.body.tagId } },
			create: { skuId: req.params!.id, tagId: req.body.tagId },
			update: {},
		});
		res.json({ success: true, message: 'Tag added' });
	}
);

router.delete(
	'/:id/tags/:tagId',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), param('tagId').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		await prisma.sKUTag.delete({
			where: { skuId_tagId: { skuId: req.params!.id, tagId: req.params!.tagId } },
		});
		res.json({ success: true, message: 'Tag removed' });
	}
);

export default router;

