import { Prisma, SKU } from '@prisma/client';
import prisma from '../prisma/client';

type SkuWithCounts = Pick<
	SKU,
	| 'id'
	| 'skuCode'
	| 'name'
	| 'description'
	| 'categoryId'
	| 'vendorId'
	| 'unitOfMeasureId'
	| 'unitOfMeasure'
	| 'costPrice'
	| 'sellingPrice'
	| 'wholesalePrice'
	| 'bulkPrice'
	| 'marginType'
	| 'marginValue'
	| 'currency'
	| 'defaultManufacturingDate'
	| 'defaultExpiryDate'
	| 'shelfLifeDays'
	| 'batchPricing'
	| 'batchReferencePricing'
	| 'lowStockThreshold'
	| 'conversionRules'
	| 'dimensions'
	| 'videoUrl'
	| 'isFragile'
	| 'maxStackHeight'
	| 'createdAt'
	| 'updatedAt'
> & {
	_count: {
		barcodes: number;
		images: number;
		batches: number;
		inventoryRecords: number;
		grnLines: number;
		prnLines: number;
		stockTransferLines: number;
		variants: number;
	};
};

type ParsedVariantSignature = {
	kind: 'parenthetical' | 'numbered';
	baseName: string;
	variantParts: string[];
	rawVariantLabel: string;
};

type ParsedSku = {
	sku: SkuWithCounts;
	signature: ParsedVariantSignature;
};

type VariantCluster = {
	clusterKey: string;
	displayName: string;
	items: ParsedSku[];
};

type VariantGroup = {
	groupKey: string;
	parentName: string;
	parentNameNormalized: string;
	parentStrategy: 'generic-existing' | 'repurpose-member';
	parentCandidate: SkuWithCounts;
	commonParts: string[];
	clusters: VariantCluster[];
	items: ParsedSku[];
};

type ApplySummary = {
	processedGroups: number;
	createdVariants: number;
	deletedSkus: number;
	repurposedParents: number;
	reusedGenericParents: number;
};

type SkuOwnedRecordCounts = Pick<
	SkuWithCounts['_count'],
	'barcodes' | 'images' | 'batches' | 'inventoryRecords' | 'grnLines' | 'prnLines' | 'stockTransferLines'
>;

const CONSOLIDATION_TRANSACTION_TIMEOUT_MS = 30 * 60 * 1000;
const CONSOLIDATION_TRANSACTION_MAX_WAIT_MS = 60 * 1000;

const collapseWhitespace = (value: string | null | undefined) =>
	(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeText = (value: string | null | undefined) =>
	collapseWhitespace(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const parseClearVariantSignature = (name: string): ParsedVariantSignature | null => {
	const trimmed = collapseWhitespace(name);
	const parentheticalMatches = Array.from(trimmed.matchAll(/\(([^()]*)\)/g))
		.map((match) => collapseWhitespace(match[1]))
		.filter(Boolean);

	if (parentheticalMatches.length > 0) {
		const baseName = collapseWhitespace(trimmed.replace(/\([^()]*\)/g, ' '));
		if (baseName.length >= 3) {
			return {
				kind: 'parenthetical',
				baseName,
				variantParts: parentheticalMatches,
				rawVariantLabel: parentheticalMatches.join(' / '),
			};
		}
	}

	const numberedMatch = trimmed.match(/^(.*?)(?:\s+(NO\.?\s*[A-Z0-9*./-]+|#\s*[A-Z0-9*./-]+))$/i);
	if (!numberedMatch) return null;

	const baseName = collapseWhitespace(numberedMatch[1]);
	const rawVariantLabel = collapseWhitespace(numberedMatch[2]).replace(/\s+/g, ' ');
	if (baseName.length < 3 || !rawVariantLabel) return null;

	return {
		kind: 'numbered',
		baseName,
		variantParts: [rawVariantLabel],
		rawVariantLabel,
	};
};

const groupDimensionKey = (sku: SkuWithCounts) => `${sku.vendorId}|${sku.categoryId ?? ''}|${sku.unitOfMeasureId ?? sku.unitOfMeasure}`;

const skuScore = (sku: SkuWithCounts) =>
	(sku._count.barcodes * 200) +
	(sku._count.batches * 25) +
	(sku._count.grnLines * 5) +
	(sku._count.inventoryRecords * 20) +
	(sku._count.stockTransferLines * 10) +
	sku._count.images;

const chooseBestSku = (items: SkuWithCounts[]) =>
	[...items].sort((left, right) => {
		const scoreDelta = skuScore(right) - skuScore(left);
		if (scoreDelta !== 0) return scoreDelta;
		return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
	})[0];

const hasSkuOwnedRecords = (counts: SkuOwnedRecordCounts) =>
	counts.barcodes > 0 ||
	counts.images > 0 ||
	counts.batches > 0 ||
	counts.inventoryRecords > 0 ||
	counts.grnLines > 0 ||
	counts.prnLines > 0 ||
	counts.stockTransferLines > 0;

const buildUnspecifiedVariantName = (skuCode: string) => `Unspecified (${skuCode})`;

const collectCommonParts = (items: ParsedSku[]) => {
	if (items.length === 0) return [] as string[];

	const common = new Map<string, string>();
	for (const part of items[0].signature.variantParts) {
		common.set(normalizeText(part), part);
	}

	for (const item of items.slice(1)) {
		const currentParts = new Set(item.signature.variantParts.map((part) => normalizeText(part)));
		for (const key of Array.from(common.keys())) {
			if (!currentParts.has(key)) {
				common.delete(key);
			}
		}
	}

	return Array.from(common.values());
};

const buildGroupKey = (parsed: ParsedSku) =>
	`${groupDimensionKey(parsed.sku)}|${parsed.signature.kind}|${normalizeText(parsed.signature.baseName)}`;

const buildVariantLabel = (item: ParsedSku, commonPartKeys: Set<string>) => {
	const specificParts = item.signature.variantParts.filter(
		(part) => !commonPartKeys.has(normalizeText(part)),
	);
	const label = collapseWhitespace(specificParts.join(' / '));
	return label || item.signature.rawVariantLabel || item.sku.name;
};

const buildVariantGroups = (skus: SkuWithCounts[]) => {
	const parsedItems = skus
		.filter((sku) => sku._count.variants === 0)
		.map((sku) => {
			const signature = parseClearVariantSignature(sku.name);
			return signature ? ({ sku, signature } satisfies ParsedSku) : null;
		})
		.filter(Boolean) as ParsedSku[];

	const groupsByKey = new Map<string, ParsedSku[]>();
	for (const item of parsedItems) {
		const key = buildGroupKey(item);
		const existing = groupsByKey.get(key);
		if (existing) existing.push(item);
		else groupsByKey.set(key, [item]);
	}

	const skuByNormalizedName = new Map<string, SkuWithCounts[]>();
	for (const sku of skus) {
		const normalizedName = normalizeText(sku.name);
		const existing = skuByNormalizedName.get(normalizedName);
		if (existing) existing.push(sku);
		else skuByNormalizedName.set(normalizedName, [sku]);
	}

	const groups: VariantGroup[] = [];
	for (const [groupKey, items] of groupsByKey.entries()) {
		if (items.length < 2) continue;

		const uniqueVariantLabels = new Set(items.map((item) => normalizeText(item.signature.rawVariantLabel)));
		if (uniqueVariantLabels.size < 2) continue;

		const commonParts = collectCommonParts(items);
		const commonPartKeys = new Set(commonParts.map((part) => normalizeText(part)));
		const parentName = collapseWhitespace([items[0].signature.baseName, ...commonParts].join(' '));
		const parentNameNormalized = normalizeText(parentName);
		if (parentNameNormalized.length < 3) continue;

		const dimensionKey = groupDimensionKey(items[0].sku);
		const genericParentCandidates = (skuByNormalizedName.get(parentNameNormalized) ?? [])
			.filter((candidate) =>
				groupDimensionKey(candidate) === dimensionKey &&
				items.every((item) => item.sku.id !== candidate.id) &&
				candidate._count.variants === 0,
			);

		const parentCandidate = genericParentCandidates.length > 0
			? chooseBestSku(genericParentCandidates)
			: chooseBestSku(items.map((item) => item.sku));

		const parentStrategy: VariantGroup['parentStrategy'] = genericParentCandidates.length > 0
			? 'generic-existing'
			: 'repurpose-member';

		const clustersByKey = new Map<string, VariantCluster>();
		for (const item of items) {
			const displayName = buildVariantLabel(item, commonPartKeys);
			const clusterKey = normalizeText(displayName);
			const existing = clustersByKey.get(clusterKey);
			if (existing) {
				existing.items.push(item);
			} else {
				clustersByKey.set(clusterKey, { clusterKey, displayName, items: [item] });
			}
		}

		if (clustersByKey.size < 2) continue;

		groups.push({
			groupKey,
			parentName,
			parentNameNormalized,
			parentStrategy,
			parentCandidate,
			commonParts,
			clusters: Array.from(clustersByKey.values()).sort((left, right) => right.items.length - left.items.length),
			items,
		});
	}

	return groups.sort((left, right) => right.items.length - left.items.length);
};

const clearDefaultBarcodeForScope = async (
	tx: Prisma.TransactionClient,
	skuId: string,
	variantId: string | null,
	excludeId?: string,
) => {
	await tx.productBarcode.updateMany({
		where: {
			skuId,
			variantId,
			isDefault: true,
			...(excludeId ? { id: { not: excludeId } } : {}),
		},
		data: { isDefault: false },
	});
};

const moveBarcodesToTarget = async (
	tx: Prisma.TransactionClient,
	targetId: string,
	sourceId: string,
	forcedVariantId?: string | null,
) => {
	const sourceBarcodes = await tx.productBarcode.findMany({
		where: { skuId: sourceId },
		orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
	});

	for (const barcode of sourceBarcodes) {
		const variantId = forcedVariantId === undefined ? barcode.variantId : forcedVariantId;
		if (barcode.isDefault) {
			await clearDefaultBarcodeForScope(tx, targetId, variantId ?? null, barcode.id);
		}
		await tx.productBarcode.update({
			where: { id: barcode.id },
			data: {
				skuId: targetId,
				variantId,
			},
		});
	}
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
	if (targetId === sourceId) return;

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
	if (targetId === sourceId) return;

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

const moveSkuIntoVariant = async (
	tx: Prisma.TransactionClient,
	parentSkuId: string,
	sourceSkuId: string,
	variantId: string,
) => {
	await mergeSkuPivots(tx, parentSkuId, sourceSkuId);
	await mergeSkuAttributeSelections(tx, parentSkuId, sourceSkuId);
	await moveImagesToTarget(tx, parentSkuId, sourceSkuId, variantId);
	await moveBarcodesToTarget(tx, parentSkuId, sourceSkuId, variantId);
	await moveBatchesToTarget(tx, parentSkuId, sourceSkuId, variantId);
	await tx.inventoryRecord.updateMany({
		where: { skuId: sourceSkuId },
		data: { skuId: parentSkuId, variantId },
	});
	await tx.gRNLine.updateMany({
		where: { skuId: sourceSkuId },
		data: { skuId: parentSkuId, variantId },
	});
	await tx.pRNLine.updateMany({
		where: { skuId: sourceSkuId },
		data: { skuId: parentSkuId, variantId },
	});
	await moveStockTransferLinesToTarget(tx, parentSkuId, sourceSkuId, variantId);
	if (sourceSkuId !== parentSkuId) {
		await tx.sKU.delete({ where: { id: sourceSkuId } });
	}
};

const createParentVariantFromSku = async (
	tx: Prisma.TransactionClient,
	parentSkuId: string,
	sourceSku: Pick<SKU, 'skuCode'>,
	variantName: string,
) =>
	tx.sKUVariant.create({
		data: {
			skuId: parentSkuId,
			variantCode: await makeUniqueVariantCode(tx, sourceSku.skuCode),
			name: variantName,
		},
	});

const applyGroup = async (group: VariantGroup, summary: ApplySummary) => {
	await prisma.$transaction(
		async (tx) => {
			const currentParent = await tx.sKU.findUnique({
				where: { id: group.parentCandidate.id },
				select: {
					id: true,
					name: true,
					skuCode: true,
					_count: {
						select: {
							barcodes: true,
							images: true,
							batches: true,
							inventoryRecords: true,
							grnLines: true,
							prnLines: true,
							stockTransferLines: true,
						},
					},
				},
			});
			if (!currentParent) {
				throw new Error(`Parent candidate ${group.parentCandidate.skuCode} no longer exists.`);
			}

			const parentSkuId = currentParent.id;
			if (group.parentStrategy === 'repurpose-member' && currentParent.name !== group.parentName) {
				await tx.sKU.update({
					where: { id: parentSkuId },
					data: { name: group.parentName },
				});
			}

			if (group.parentStrategy === 'generic-existing' && hasSkuOwnedRecords(currentParent._count)) {
				const parentHistoryVariant = await createParentVariantFromSku(
					tx,
					parentSkuId,
					{ skuCode: currentParent.skuCode },
					buildUnspecifiedVariantName(currentParent.skuCode),
				);
				summary.createdVariants += 1;
				await moveSkuIntoVariant(tx, parentSkuId, parentSkuId, parentHistoryVariant.id);
			}

			for (const cluster of group.clusters) {
				const representative = chooseBestSku(cluster.items.map((item) => item.sku));
				const variant = await createParentVariantFromSku(tx, parentSkuId, representative, cluster.displayName);
				summary.createdVariants += 1;

				for (const item of cluster.items) {
					await moveSkuIntoVariant(tx, parentSkuId, item.sku.id, variant.id);
					if (item.sku.id !== parentSkuId) {
						summary.deletedSkus += 1;
					}
				}
			}
		},
		{
			maxWait: CONSOLIDATION_TRANSACTION_MAX_WAIT_MS,
			timeout: CONSOLIDATION_TRANSACTION_TIMEOUT_MS,
		},
	);

	summary.processedGroups += 1;
	if (group.parentStrategy === 'repurpose-member') summary.repurposedParents += 1;
	else summary.reusedGenericParents += 1;
};

const printPreview = (groups: VariantGroup[], limit: number) => {
	const previewGroups = groups.slice(0, limit);
	for (const [index, group] of previewGroups.entries()) {
		const includesParentHistoryVariant =
			group.parentStrategy === 'generic-existing' && hasSkuOwnedRecords(group.parentCandidate._count);
		const variantCountLabel = includesParentHistoryVariant
			? `${group.clusters.length} + parent-history`
			: `${group.clusters.length}`;
		console.log(
			`\n[${index + 1}] ${group.parentName} -> ${variantCountLabel} variant(s) ` +
			`(${group.parentStrategy === 'generic-existing' ? `reuse ${group.parentCandidate.skuCode}` : `repurpose ${group.parentCandidate.skuCode}`})`,
		);
		for (const cluster of group.clusters.slice(0, 10)) {
			const skuCodes = cluster.items.map((item) => item.sku.skuCode).join(', ');
			console.log(`    - ${cluster.displayName}: ${skuCodes}`);
		}
		if (includesParentHistoryVariant) {
			console.log(`    - ${buildUnspecifiedVariantName(group.parentCandidate.skuCode)}: existing parent-level history`);
		}
		if (group.clusters.length > 10) {
			console.log(`    ... ${group.clusters.length - 10} more variant cluster(s)`);
		}
	}
};

async function main() {
	const args = new Set(process.argv.slice(2));
	const apply = args.has('--apply');
	const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
	const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.split('=')[1] ?? '0', 10) || 0) : undefined;

	const skus = await prisma.sKU.findMany({
		where: { isActive: true },
		select: {
			id: true,
			skuCode: true,
			name: true,
			description: true,
			categoryId: true,
			vendorId: true,
			unitOfMeasureId: true,
			unitOfMeasure: true,
			costPrice: true,
			sellingPrice: true,
			wholesalePrice: true,
			bulkPrice: true,
			marginType: true,
			marginValue: true,
			currency: true,
			defaultManufacturingDate: true,
			defaultExpiryDate: true,
			shelfLifeDays: true,
			batchPricing: true,
			batchReferencePricing: true,
			lowStockThreshold: true,
			conversionRules: true,
			dimensions: true,
			videoUrl: true,
			isFragile: true,
			maxStackHeight: true,
			createdAt: true,
			updatedAt: true,
			_count: {
				select: {
					barcodes: true,
					images: true,
					batches: true,
					inventoryRecords: true,
					grnLines: true,
					prnLines: true,
					stockTransferLines: true,
					variants: true,
				},
			},
		},
	});

	const groups = buildVariantGroups(skus as SkuWithCounts[]);
	const targetGroups = limit ? groups.slice(0, limit) : groups;

	console.log(
		`Found ${groups.length} clear variant family group(s)` +
		`${limit ? `, processing the first ${targetGroups.length}` : ''}.`,
	);
	printPreview(targetGroups, Math.min(targetGroups.length, 20));

	if (!apply) {
		console.log('\nPreview only. Re-run with --apply to persist changes.');
		return;
	}

	const summary: ApplySummary = {
		processedGroups: 0,
		createdVariants: 0,
		deletedSkus: 0,
		repurposedParents: 0,
		reusedGenericParents: 0,
	};

	for (const group of targetGroups) {
		console.log(`Applying ${group.parentName} (${group.clusters.length} variant clusters)...`);
		await applyGroup(group, summary);
	}

	console.log('\nConsolidation complete.');
	console.log(JSON.stringify(summary, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
