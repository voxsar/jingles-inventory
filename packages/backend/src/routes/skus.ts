import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { searchSKUIdsFts } from '../utils/localSearch';

const router = Router();

router.use(authenticate);

type AttributeValueCandidate = {
	attributeId: string;
	attributeName: string;
	attributeType: string;
	attributeValueId: string;
	label: string;
	representedValue: string;
	normalized: string;
};

const normalizeText = (value: string | null | undefined) =>
	(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const tokenizeText = (value: string) =>
	normalizeText(value)
		.split(' ')
		.filter((token) => token.length > 1 && !['and', 'with', 'for', 'the', 'from', 'new', 'product', 'item'].includes(token));

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const loadAttributeValueCandidates = async (): Promise<AttributeValueCandidate[]> => {
	const values = await prisma.attributeValue.findMany({
		where: { isActive: true, attribute: { isActive: true } },
		include: { attribute: true },
	});

	return values
		.map((value) => ({
			attributeId: value.attributeId,
			attributeName: value.attribute.name,
			attributeType: value.attribute.type,
			attributeValueId: value.id,
			label: value.displayName,
			representedValue: value.representedValue,
			normalized: normalizeText(value.displayName),
		}))
		.filter((value) => value.normalized.length > 0)
		.sort((a, b) => b.normalized.length - a.normalized.length);
};

const stripKnownVariantValues = (name: string, attributeValues: AttributeValueCandidate[]) => {
	let normalized = ` ${normalizeText(name)} `;
	const matchedByAttribute = new Map<string, AttributeValueCandidate>();

	for (const value of attributeValues) {
		const pattern = new RegExp(`\\s${escapeRegExp(value.normalized)}\\s`, 'g');
		if (!pattern.test(normalized)) continue;
		normalized = normalized.replace(pattern, ' ');
		if (!matchedByAttribute.has(value.attributeId)) {
			matchedByAttribute.set(value.attributeId, value);
		}
	}

	return {
		baseName: normalized.replace(/\s+/g, ' ').trim(),
		matchedValues: Array.from(matchedByAttribute.values()),
	};
};

const calculateNameSimilarity = (left: string, right: string) => {
	const leftTokens = new Set(tokenizeText(left));
	const rightTokens = new Set(tokenizeText(right));
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
	const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
	const union = new Set([...leftTokens, ...rightTokens]).size;
	return intersection / union;
};

const buildDuplicateCandidate = (
	target: any,
	candidate: any,
	attributeValues: AttributeValueCandidate[],
) => {
	const targetName = normalizeText(target.name);
	const candidateName = normalizeText(candidate.name);
	const targetBase = stripKnownVariantValues(target.name, attributeValues);
	const candidateBase = stripKnownVariantValues(candidate.name, attributeValues);
	const baseSimilarity = calculateNameSimilarity(targetBase.baseName, candidateBase.baseName);
	const nameSimilarity = calculateNameSimilarity(targetName, candidateName);
	const sameName = targetName.length > 0 && targetName === candidateName;
	const sameBase = targetBase.baseName.length > 0 && targetBase.baseName === candidateBase.baseName;
	const targetVendorIds = new Set((target.skuVendors ?? []).map((sv: any) => sv.vendorId));
	const candidateVendorIds = new Set((candidate.skuVendors ?? []).map((sv: any) => sv.vendorId));
	const sameVendor = Array.from(targetVendorIds).some((vendorId) => candidateVendorIds.has(vendorId));
	const sameCategory = target.categoryId && target.categoryId === candidate.categoryId;
	const sameUnit = target.unitOfMeasureId
		? target.unitOfMeasureId === candidate.unitOfMeasureId
		: target.unitOfMeasure === candidate.unitOfMeasure;
	const sourceHasVariantValue = candidateBase.matchedValues.some((value) =>
		!targetBase.matchedValues.some((targetValue) => targetValue.attributeValueId === value.attributeValueId)
	);

	let relationship: 'duplicate' | 'variant' = 'duplicate';
	let score = Math.round(Math.max(nameSimilarity, baseSimilarity) * 100);
	let reason = 'Similar product name';

	if (sameName) {
		score = 100;
		reason = 'Exact product name match';
	} else if (sameBase && sourceHasVariantValue) {
		relationship = 'variant';
		score = 94;
		reason = 'Same base product with different attribute value';
	} else if (sameBase) {
		relationship = 'variant';
		score = 88;
		reason = 'Same base product name after removing variant values';
	} else if (baseSimilarity >= 0.72 && sourceHasVariantValue) {
		relationship = 'variant';
		score = Math.max(score, 82);
		reason = 'Likely same base product with variant words';
	} else if (nameSimilarity >= 0.82) {
		score = Math.max(score, 82);
		reason = 'Very similar product name';
	}

	if (sameVendor) score += 4;
	if (sameCategory) score += 4;
	if (sameUnit) score += 2;
	score = Math.min(score, 100);

	return {
		sku: candidate,
		relationship,
		score,
		reason,
		matchedVariantValues: candidateBase.matchedValues.map((value) => ({
			attributeId: value.attributeId,
			attributeName: value.attributeName,
			attributeType: value.attributeType,
			attributeValueId: value.attributeValueId,
			label: value.label,
			representedValue: value.representedValue,
		})),
	};
};

const moveImagesToTarget = async (
	tx: Prisma.TransactionClient,
	targetId: string,
	sourceId: string,
	forcedVariantId?: string | null,
) => {
	const sourceImages = await tx.productImage.findMany({
		where: { skuId: sourceId },
		orderBy: { sortOrder: 'asc' },
	});

	for (const image of sourceImages) {
		const variantId = forcedVariantId === undefined ? image.variantId : forcedVariantId;
		const maxTargetImage = await tx.productImage.findFirst({
			where: { skuId: targetId, variantId: variantId ?? null },
			orderBy: { sortOrder: 'desc' },
			select: { sortOrder: true },
		});
		await tx.productImage.update({
			where: { id: image.id },
			data: {
				skuId: targetId,
				variantId,
				sortOrder: (maxTargetImage?.sortOrder ?? -1) + 1,
				isPrimary: variantId ? image.isPrimary : false,
			},
		});
	}
};

const mergeSkuPivots = async (tx: Prisma.TransactionClient, targetId: string, sourceId: string) => {
	const [sourceTags, sourceVendors] = await Promise.all([
		tx.sKUTag.findMany({ where: { skuId: sourceId } }),
		tx.sKUVendor.findMany({ where: { skuId: sourceId } }),
	]);

	if (sourceTags.length > 0) {
		await tx.sKUTag.createMany({
			data: sourceTags.map((tag) => ({ skuId: targetId, tagId: tag.tagId })),
			skipDuplicates: true,
		});
	}
	if (sourceVendors.length > 0) {
		await tx.sKUVendor.createMany({
			data: sourceVendors.map((vendor) => ({ skuId: targetId, vendorId: vendor.vendorId })),
			skipDuplicates: true,
		});
	}

	await Promise.all([
		tx.sKUTag.deleteMany({ where: { skuId: sourceId } }),
		tx.sKUVendor.deleteMany({ where: { skuId: sourceId } }),
	]);
};

const mergeSkuAttributeSelections = async (tx: Prisma.TransactionClient, targetId: string, sourceId: string) => {
	const sourceAttributes = await tx.sKUAttribute.findMany({
		where: { skuId: sourceId },
		include: { selectedValues: true },
	});

	for (const sourceAttribute of sourceAttributes) {
		const targetAttribute = await tx.sKUAttribute.upsert({
			where: { skuId_attributeId: { skuId: targetId, attributeId: sourceAttribute.attributeId } },
			create: { skuId: targetId, attributeId: sourceAttribute.attributeId },
			update: {},
		});
		if (sourceAttribute.selectedValues.length > 0) {
			await tx.sKUAttributeValue.createMany({
				data: sourceAttribute.selectedValues.map((selectedValue) => ({
					skuAttributeId: targetAttribute.id,
					attributeValueId: selectedValue.attributeValueId,
				})),
				skipDuplicates: true,
			});
		}
	}
};

const ensureTargetVariantAttributes = async (
	tx: Prisma.TransactionClient,
	targetId: string,
	variantId: string,
	matchedValues: Array<{ attributeId: string; attributeValueId: string }>,
) => {
	for (const matchedValue of matchedValues) {
		const targetAttribute = await tx.sKUAttribute.upsert({
			where: { skuId_attributeId: { skuId: targetId, attributeId: matchedValue.attributeId } },
			create: { skuId: targetId, attributeId: matchedValue.attributeId },
			update: {},
		});

		await tx.sKUAttributeValue.createMany({
			data: [{ skuAttributeId: targetAttribute.id, attributeValueId: matchedValue.attributeValueId }],
			skipDuplicates: true,
		});
		await tx.sKUVariantValue.createMany({
			data: [{
				variantId,
				attributeId: matchedValue.attributeId,
				attributeValueId: matchedValue.attributeValueId,
			}],
			skipDuplicates: true,
		});
	}
};

const nextBatchSequence = async (tx: Prisma.TransactionClient, skuId: string, variantId: string | null) => {
	const aggregate = await tx.batch.aggregate({
		where: { skuId, variantId },
		_max: { sequenceNumber: true },
	});
	return (aggregate._max.sequenceNumber ?? 0) + 1;
};

const moveBatchesToTarget = async (
	tx: Prisma.TransactionClient,
	targetId: string,
	sourceId: string,
	forcedVariantId?: string | null,
) => {
	const batches = await tx.batch.findMany({
		where: { skuId: sourceId },
		orderBy: { createdAt: 'asc' },
	});

	for (const batch of batches) {
		const variantId = forcedVariantId === undefined ? batch.variantId : forcedVariantId;
		await tx.batch.update({
			where: { id: batch.id },
			data: {
				skuId: targetId,
				variantId,
				sequenceNumber: await nextBatchSequence(tx, targetId, variantId ?? null),
			},
		});
	}
};

const moveStockTransferLinesToTarget = async (
	tx: Prisma.TransactionClient,
	targetId: string,
	sourceId: string,
	forcedVariantId?: string | null,
) => {
	const lines = await tx.stockTransferLine.findMany({ where: { skuId: sourceId } });

	for (const line of lines) {
		const variantId = forcedVariantId === undefined ? line.variantId : forcedVariantId;
		const existing = await tx.stockTransferLine.findFirst({
			where: {
				transferId: line.transferId,
				skuId: targetId,
				variantId: variantId ?? null,
				batchId: line.batchId ?? null,
				id: { not: line.id },
			},
		});

		if (existing) {
			await tx.stockTransferLine.update({
				where: { id: existing.id },
				data: {
					requestedQty: { increment: line.requestedQty },
					transferredQty: { increment: line.transferredQty },
					notes: [existing.notes, line.notes].filter(Boolean).join('\n') || undefined,
				},
			});
			await tx.stockTransferLine.delete({ where: { id: line.id } });
		} else {
			await tx.stockTransferLine.update({
				where: { id: line.id },
				data: {
					skuId: targetId,
					variantId,
				},
			});
		}
	}
};

const makeUniqueVariantCode = async (tx: Prisma.TransactionClient, preferredCode: string) => {
	const baseCode = preferredCode.trim();
	let code = baseCode;
	let suffix = 1;
	while (await tx.sKUVariant.findUnique({ where: { variantCode: code } })) {
		code = `${baseCode}-${suffix++}`;
	}
	return code;
};

const buildGeneralDuplicateGroups = (skus: any[], attributeValues: AttributeValueCandidate[], minScore: number) => {
	const parent = new Map<string, string>();
	const find = (id: string): string => {
		const current = parent.get(id) ?? id;
		if (current === id) return id;
		const root = find(current);
		parent.set(id, root);
		return root;
	};
	const union = (left: string, right: string) => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
	};

	skus.forEach((sku) => parent.set(sku.id, sku.id));
	const relationships = new Map<string, any>();

	for (let i = 0; i < skus.length; i++) {
		for (let j = i + 1; j < skus.length; j++) {
			const left = skus[i];
			const right = skus[j];
			if (left.categoryId && right.categoryId && left.categoryId !== right.categoryId) continue;
			const candidate = buildDuplicateCandidate(left, right, attributeValues);
			if (candidate.score < minScore) continue;
			union(left.id, right.id);
			relationships.set(`${left.id}:${right.id}`, candidate);
			relationships.set(`${right.id}:${left.id}`, buildDuplicateCandidate(right, left, attributeValues));
		}
	}

	const grouped = new Map<string, any[]>();
	for (const sku of skus) {
		const root = find(sku.id);
		grouped.set(root, [...(grouped.get(root) ?? []), sku]);
	}

	return Array.from(grouped.values())
		.filter((group) => group.length > 1)
		.map((group) => {
			const target = [...group].sort((a, b) => {
				const aInventory = a._count?.inventoryRecords ?? 0;
				const bInventory = b._count?.inventoryRecords ?? 0;
				if (aInventory !== bInventory) return bInventory - aInventory;
				const aVariants = a._count?.variants ?? 0;
				const bVariants = b._count?.variants ?? 0;
				if (aVariants !== bVariants) return bVariants - aVariants;
				return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			})[0];
			const items = group
				.filter((sku) => sku.id !== target.id)
				.map((sku) => relationships.get(`${target.id}:${sku.id}`) ?? buildDuplicateCandidate(target, sku, attributeValues))
				.sort((a, b) => b.score - a.score);
			return {
				target,
				items,
				score: items[0]?.score ?? 0,
				relationship: items.some((item) => item.relationship === 'variant') ? 'variant' : 'duplicate',
			};
		})
		.sort((a, b) => b.score - a.score);
};

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
	const { vendorId, categoryId, unitOfMeasureId, isActive, search, page = '1', pageSize = '20' } = req.query as {
		vendorId?: string;
		categoryId?: string;
		unitOfMeasureId?: string;
		isActive?: string;
		search?: string;
		page?: string;
		pageSize?: string;
	};

	const skip = (parseInt(page) - 1) * parseInt(pageSize);

	// In local replica (Electron) mode use FTS5 for fast full-text search.
	// When the FTS table is unavailable the helper returns null and we fall back
	// to the regular Prisma contains filter.
	const ftsSkuIds = search ? await searchSKUIdsFts(search) : null;

	const where: Prisma.SKUWhereInput = {
		...(vendorId ? { skuVendors: { some: { vendorId } } } : {}),
		...(categoryId ? { categoryId } : {}),
		...(unitOfMeasureId ? { unitOfMeasureId } : {}),
		...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
		...(search
			? ftsSkuIds !== null
				? { id: { in: ftsSkuIds } }
				: {
					OR: [
						{ name: { contains: search, mode: 'insensitive' } },
						{ skuCode: { contains: search, mode: 'insensitive' } },
						{ description: { contains: search, mode: 'insensitive' } },
						{ vendor: { name: { contains: search, mode: 'insensitive' } } },
						{ category: { name: { contains: search, mode: 'insensitive' } } },
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
				unitModel: true,
				images: { where: { isPrimary: true, variantId: null }, take: 1 },
				barcodes: { where: { isDefault: true }, take: 1 },
				tags: { include: { tag: true } },
				skuVendors: { include: { vendor: true } },
				inventoryRecords: {
					select: {
						id: true,
						quantity: true,
						state: true,
						floor: {
							select: {
								id: true,
								name: true,
								code: true,
								branch: { select: { id: true, name: true, code: true } },
							},
						},
						shelf: { select: { id: true, name: true, code: true } },
						box: { select: { id: true, name: true, code: true } },
					},
				},
				_count: { select: { variants: true } },
			},
			orderBy: { createdAt: 'desc' },
		}),
		prisma.sKU.count({ where }),
	]);

	res.json({ success: true, data: { items, total, page: parseInt(page), pageSize: parseInt(pageSize), totalPages: Math.ceil(total / parseInt(pageSize)) } });
});

router.get('/duplicates', async (req: AuthRequest, res: Response): Promise<void> => {
	const { minScore = '72', limit = '600' } = req.query as { minScore?: string; limit?: string };
	const scoreThreshold = Math.max(1, Math.min(100, parseInt(minScore) || 72));
	const take = Math.max(50, Math.min(2000, parseInt(limit) || 600));

	const attributeValues = await loadAttributeValueCandidates();
	const items = await prisma.sKU.findMany({
		where: { isActive: true },
		take,
		include: {
			vendor: true,
			category: true,
			unitModel: true,
			images: { where: { isPrimary: true, variantId: null }, take: 1 },
			barcodes: { where: { isDefault: true }, take: 1 },
			tags: { include: { tag: true } },
			skuVendors: { include: { vendor: true } },
			_count: { select: { inventoryRecords: true, batches: true, variants: true } },
		},
		orderBy: { updatedAt: 'desc' },
	});

	const groups = buildGeneralDuplicateGroups(items, attributeValues, scoreThreshold);
	res.json({
		success: true,
		data: {
			items: groups,
			total: groups.length,
			limit: take,
			minScore: scoreThreshold,
		},
	});
});

router.get(
	'/:id/duplicates',
	[param('id').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		const target = await prisma.sKU.findUnique({
			where: { id: req.params!.id },
			include: {
				vendor: true,
				category: true,
				unitModel: true,
				skuVendors: true,
			},
		});
		if (!target) {
			res.status(404).json({ error: 'SKU not found' });
			return;
		}

		const attributeValues = await loadAttributeValueCandidates();
		const targetBase = stripKnownVariantValues(target.name, attributeValues);
		const searchTokens = tokenizeText(targetBase.baseName || target.name).slice(0, 4);
		const targetVendorIds = (target.skuVendors ?? []).map((vendor) => vendor.vendorId);
		const candidateOr: Prisma.SKUWhereInput[] = [];

		if (target.categoryId) candidateOr.push({ categoryId: target.categoryId });
		if (targetVendorIds.length > 0) candidateOr.push({ skuVendors: { some: { vendorId: { in: targetVendorIds } } } });
		for (const token of searchTokens) {
			candidateOr.push({ name: { contains: token, mode: 'insensitive' } });
		}

		const candidates = await prisma.sKU.findMany({
			where: {
				id: { not: target.id },
				isActive: true,
				...(candidateOr.length > 0 ? { OR: candidateOr } : {}),
			},
			take: 150,
			include: {
				vendor: true,
				category: true,
				unitModel: true,
				images: { where: { isPrimary: true, variantId: null }, take: 1 },
				barcodes: { where: { isDefault: true }, take: 1 },
				tags: { include: { tag: true } },
				skuVendors: { include: { vendor: true } },
				_count: { select: { inventoryRecords: true, batches: true, variants: true } },
			},
			orderBy: { updatedAt: 'desc' },
		});

		const scoredCandidates = candidates
			.map((candidate) => buildDuplicateCandidate(target, candidate, attributeValues))
			.filter((candidate) => candidate.score >= 62)
			.sort((a, b) => b.score - a.score);

		res.json({
			success: true,
			data: {
				target,
				items: scoredCandidates,
			},
		});
	}
);

router.post(
	'/:id/duplicates/:sourceId/merge',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), param('sourceId').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		const { id: targetId, sourceId } = req.params as { id: string; sourceId: string };
		if (targetId === sourceId) {
			res.status(400).json({ error: 'Cannot merge a product into itself' });
			return;
		}

		try {
			const result = await prisma.$transaction(async (tx) => {
				const [target, source] = await Promise.all([
					tx.sKU.findUnique({ where: { id: targetId } }),
					tx.sKU.findUnique({
						where: { id: sourceId },
						include: {
							_count: { select: { inventoryRecords: true, batches: true, variants: true } },
						},
					}),
				]);
				if (!target || !source) throw new Error('SKU not found');

				await mergeSkuPivots(tx, targetId, sourceId);
				await mergeSkuAttributeSelections(tx, targetId, sourceId);
				await moveImagesToTarget(tx, targetId, sourceId);
				await tx.productBarcode.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId } });
				await tx.sKUVariant.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId } });
				await moveBatchesToTarget(tx, targetId, sourceId);
				await tx.inventoryRecord.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId } });
				await tx.gRNLine.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId } });
				await tx.pRNLine.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId } });
				await moveStockTransferLinesToTarget(tx, targetId, sourceId);
				await tx.sKU.delete({ where: { id: sourceId } });

				return {
					targetId,
					mergedSkuCode: source.skuCode,
					movedInventoryRecords: source._count.inventoryRecords,
					movedBatches: source._count.batches,
					movedVariants: source._count.variants,
				};
			});

			res.json({ success: true, data: result });
		} catch (err: any) {
			res.status(400).json({ success: false, error: err.message ?? 'Failed to merge duplicate product' });
		}
	}
);

router.post(
	'/:id/duplicates/:sourceId/variantize',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), param('sourceId').isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		const { id: targetId, sourceId } = req.params as { id: string; sourceId: string };
		if (targetId === sourceId) {
			res.status(400).json({ error: 'Cannot variantize a product into itself' });
			return;
		}

		try {
			const attributeValues = await loadAttributeValueCandidates();
			const result = await prisma.$transaction(async (tx) => {
				const [target, source] = await Promise.all([
					tx.sKU.findUnique({ where: { id: targetId } }),
					tx.sKU.findUnique({
						where: { id: sourceId },
						include: {
							_count: { select: { inventoryRecords: true, batches: true, variants: true } },
						},
					}),
				]);
				if (!target || !source) throw new Error('SKU not found');
				if (source._count.variants > 0) {
					throw new Error('This product already has variants. Merge it or move its variants before variantizing it.');
				}

				const sourceVariantValues = stripKnownVariantValues(source.name, attributeValues).matchedValues;
				const variant = await tx.sKUVariant.create({
					data: {
						skuId: targetId,
						variantCode: await makeUniqueVariantCode(tx, source.skuCode),
						name: source.name,
					},
				});

				await ensureTargetVariantAttributes(tx, targetId, variant.id, sourceVariantValues.map((value) => ({
					attributeId: value.attributeId,
					attributeValueId: value.attributeValueId,
				})));
				await mergeSkuPivots(tx, targetId, sourceId);
				await moveImagesToTarget(tx, targetId, sourceId, variant.id);
				await tx.productBarcode.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId } });
				await moveBatchesToTarget(tx, targetId, sourceId, variant.id);
				await tx.inventoryRecord.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId, variantId: variant.id } });
				await tx.gRNLine.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId, variantId: variant.id } });
				await tx.pRNLine.updateMany({ where: { skuId: sourceId }, data: { skuId: targetId, variantId: variant.id } });
				await moveStockTransferLinesToTarget(tx, targetId, sourceId, variant.id);
				await tx.sKU.delete({ where: { id: sourceId } });

				return {
					targetId,
					variantId: variant.id,
					variantCode: variant.variantCode,
					variantName: variant.name,
					movedInventoryRecords: source._count.inventoryRecords,
					movedBatches: source._count.batches,
				};
			});

			res.json({ success: true, data: result });
		} catch (err: any) {
			res.status(400).json({ success: false, error: err.message ?? 'Failed to variantize product' });
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
		const sku = await prisma.sKU.findUnique({
			where: { id: req.params!.id },
			include: {
				vendor: true,
				category: { include: { parent: true } },
				images: { where: { variantId: null }, orderBy: { sortOrder: 'asc' } },
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
						images: { orderBy: { sortOrder: 'asc' } },
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
			tagIds,
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
			defaultManufacturingDate,
			defaultExpiryDate,
			shelfLifeDays,
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
			tagIds?: string[];
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
			defaultManufacturingDate?: string;
			defaultExpiryDate?: string;
			shelfLifeDays?: number;
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
				defaultManufacturingDate: defaultManufacturingDate ? new Date(defaultManufacturingDate) : null,
				defaultExpiryDate: defaultExpiryDate ? new Date(defaultExpiryDate) : null,
				shelfLifeDays,
				batchPricing,
				batchReferencePricing,
				lowStockThreshold,
				tags: tagIds && tagIds.length > 0
					? {
						create: tagIds.map((tagId) => ({ tagId })),
					}
					: undefined,
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
		const { vendorIds, tagIds, ...rest } = req.body;

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

		if (tagIds && Array.isArray(tagIds)) {
			await prisma.sKUTag.deleteMany({ where: { skuId: req.params!.id } });
			if (tagIds.length > 0) {
				await prisma.sKUTag.createMany({
					data: tagIds.map((tagId: string) => ({ skuId: req.params!.id, tagId })),
					skipDuplicates: true,
				});
			}
		}

		const sku = await prisma.sKU.update({
			where: { id: req.params!.id },
			data: rest,
			include: {
				category: true,
				unitModel: true,
				tags: { include: { tag: true } },
				skuVendors: { include: { vendor: true } },
			},
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
	[param('id').isUUID(), query('variantId').optional().isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const variantId = typeof req.query.variantId === 'string' ? req.query.variantId : null;
		if (variantId) {
			const variant = await prisma.sKUVariant.findFirst({
				where: { id: variantId, skuId: req.params!.id },
				select: { id: true },
			});
			if (!variant) {
				res.status(400).json({ success: false, error: 'Variant does not belong to this SKU' });
				return;
			}
		}
		const images = await prisma.productImage.findMany({
			where: { skuId: req.params!.id, variantId },
			orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
		});
		res.json({ success: true, data: images });
	}
);

router.post(
	'/:id/images',
	requireRole('Admin', 'Manager'),
	[param('id').isUUID(), body('url').notEmpty().isURL(), body('variantId').optional({ nullable: true, checkFalsy: true }).isUUID()],
	async (req: AuthRequest, res: Response): Promise<void> => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}
		const { url, altText, isPrimary, sortOrder, variantId } = req.body as {
			url: string;
			altText?: string;
			isPrimary?: boolean;
			sortOrder?: number;
			variantId?: string | null;
		};
		const imageVariantId = variantId || null;
		if (imageVariantId) {
			const variant = await prisma.sKUVariant.findFirst({
				where: { id: imageVariantId, skuId: req.params!.id },
				select: { id: true },
			});
			if (!variant) {
				res.status(400).json({ success: false, error: 'Variant does not belong to this SKU' });
				return;
			}
		}
		if (isPrimary) {
			await prisma.productImage.updateMany({
				where: { skuId: req.params!.id, variantId: imageVariantId },
				data: { isPrimary: false },
			});
		}
		const image = await prisma.productImage.create({
			data: {
				skuId: req.params!.id,
				variantId: imageVariantId,
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
