import prisma from '../../prisma/client';
import { getLegacyTableRows } from '../../services/posCloud';
import crypto from 'crypto';

type Row = Record<string, unknown>;
type ProductTarget = { skuId: string; variantId: string | null };

export interface LegacyDocumentImportResult {
	grns: number;
	prns: number;
	transfers: number;
	adjustments: number;
	warnings: string[];
}

const TABLES = [
	'purchaseheader', 'purchasedetail', 'returntype',
	'transfernoteheader', 'transfernotedetail',
	'adjustmentheader', 'adjustmentdetail',
];

function text(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	const result = String(value).trim();
	return result || undefined;
}

function id(value: unknown): string | undefined {
	const result = text(value);
	return result && result !== '0' ? result : undefined;
}

function number(value: unknown): number | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	const result = Number(value);
	return Number.isFinite(result) ? result : undefined;
}

function integer(value: unknown): number | undefined {
	const result = number(value);
	return result === undefined ? undefined : Math.trunc(result);
}

function date(value: unknown): Date | undefined {
	const source = text(value);
	if (!source) return undefined;
	const result = new Date(source);
	return Number.isNaN(result.getTime()) ? undefined : result;
}

function documentQuantity(row: Row) {
	const exact = Math.abs(((number(row.Qty) ?? 0) + Math.max(number(row.FreeQty) ?? 0, 0)) * Math.max(number(row.PackSize) ?? 1, 1));
	return { exact, value: Math.round(exact) };
}

function groupBy(rows: Row[], key: (row: Row) => string | undefined) {
	const result = new Map<string, Row[]>();
	for (const row of rows) {
		const value = key(row);
		if (!value) continue;
		const group = result.get(value) ?? [];
		group.push(row);
		result.set(value, group);
	}
	return result;
}

function sourceHash(...values: unknown[]) {
	return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function legacyNotes(kind: string, row: Row, exactQuantity?: number) {
	return [
		`Historical ${kind} imported from MaxSoft; stock effect is represented only by the vwStockReport balance.`,
		text(row.DocumentNo) ? `Legacy document: ${text(row.DocumentNo)}` : undefined,
		text(row.ReferenceNo) ? `Legacy reference: ${text(row.ReferenceNo)}` : undefined,
		exactQuantity !== undefined ? `Legacy exact base quantity: ${exactQuantity}` : undefined,
	].filter(Boolean).join('\n');
}

async function saveLink(sourceType: string, sourceId: string, sourceCode: string | undefined, targetType: string, targetId: string, hash: string) {
	await prisma.legacyEntityLink.upsert({
		where: { sourceType_sourceId: { sourceType, sourceId } },
		create: {
			sourceType, sourceId, sourceCode: sourceCode ?? null, targetType, targetId,
			resolution: 'historical-document', lastApplied: { imported: true, sourceHash: hash }, lastSeenAt: new Date(),
		},
		update: {
			sourceCode: sourceCode ?? null, targetType, targetId,
			resolution: 'historical-document', lastApplied: { imported: true, sourceHash: hash }, lastSeenAt: new Date(),
		},
	});
}

export async function importLegacyDocuments(runId: string): Promise<LegacyDocumentImportResult> {
	const result: LegacyDocumentImportResult = { grns: 0, prns: 0, transfers: 0, adjustments: 0, warnings: [] };
	const rows = await getLegacyTableRows(TABLES);
	const user = await prisma.user.findFirst({
		where: { isActive: true },
		orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
		select: { id: true },
	});
	if (!user) {
		result.warnings.push('Historical documents were archived but not converted because no active Inventory user exists.');
		return result;
	}

	const links = await prisma.legacyEntityLink.findMany({
		where: { sourceType: { in: ['product', 'productcolorsize', 'supplier', 'location', 'purchaseheader', 'transfernoteheader', 'adjustmentdetail'] } },
		select: { sourceType: true, sourceId: true, targetType: true, targetId: true, lastApplied: true },
	});
	const linkBySource = new Map(links.map((link) => [`${link.sourceType}:${link.sourceId}`, link]));
	const variantIds = links.filter((link) => link.targetType === 'variant').map((link) => link.targetId);
	const variants = variantIds.length > 0
		? await prisma.sKUVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, skuId: true } })
		: [];
	const variantSku = new Map(variants.map((variant) => [variant.id, variant.skuId]));
	const branchIds = links.filter((link) => link.sourceType === 'location' && link.targetType === 'branch').map((link) => link.targetId);
	const floors = branchIds.length > 0
		? await prisma.floor.findMany({ where: { branchId: { in: branchIds } }, orderBy: { floorNumber: 'asc' }, select: { id: true, branchId: true } })
		: [];
	const floorByBranch = new Map<string, string>();
	for (const floor of floors) if (!floorByBranch.has(floor.branchId)) floorByBranch.set(floor.branchId, floor.id);

	const productTarget = (sourceId: string | undefined, colorSizeId?: string): ProductTarget | undefined => {
		if (!sourceId) return undefined;
		const colorSizeLink = colorSizeId ? linkBySource.get(`productcolorsize:${colorSizeId}`) : undefined;
		const link = colorSizeLink?.targetType === 'variant' ? colorSizeLink : linkBySource.get(`product:${sourceId}`);
		if (!link) return undefined;
		if (link.targetType === 'sku') return { skuId: link.targetId, variantId: null };
		if (link.targetType === 'variant') {
			const skuId = variantSku.get(link.targetId);
			return skuId ? { skuId, variantId: link.targetId } : undefined;
		}
		return undefined;
	};
	const vendorId = (sourceId: string | undefined) => {
		const link = sourceId ? linkBySource.get(`supplier:${sourceId}`) : undefined;
		return link?.targetType === 'vendor' ? link.targetId : undefined;
	};
	const location = (sourceId: string | undefined) => {
		const link = sourceId ? linkBySource.get(`location:${sourceId}`) : undefined;
		const branchId = link?.targetType === 'branch' ? link.targetId : undefined;
		return { branchId, floorId: branchId ? floorByBranch.get(branchId) : undefined };
	};

	const purchaseDetails = groupBy(rows.purchasedetail ?? [], (row) => id(row.PurchaseHeaderID));
	const returnReasons = new Map((rows.returntype ?? []).map((row) => [id(row.ReturnTypeID), text(row.ReturnTypeName)]));
	for (const header of rows.purchaseheader ?? []) {
		const sourceId = id(header.PurchaseHeaderID);
		const documentId = integer(header.DocumentID);
		if (!sourceId || (documentId !== 101 && documentId !== 102)) continue;
		const documentDetails = purchaseDetails.get(sourceId) ?? [];
		const hash = sourceHash(header, documentDetails);
		const existingLink = linkBySource.get(`purchaseheader:${sourceId}`);
		if ((existingLink?.lastApplied as Row | null)?.sourceHash === hash) continue;
		const supplierId = vendorId(id(header.SupplierID));
		if (!supplierId) {
			result.warnings.push(`Skipped legacy document ${text(header.DocumentNo) ?? sourceId}: supplier ${id(header.SupplierID) ?? 'unknown'} is not linked.`);
			continue;
		}
		const lines = documentDetails.flatMap((detail) => {
			const target = productTarget(id(detail.ProductID), id(detail.ProductColorSizeID));
			const quantity = documentQuantity(detail);
			if (!target || quantity.value <= 0) return [];
			return [{ detail, target, quantity }];
		});
		if (lines.length === 0) {
			result.warnings.push(`Skipped legacy document ${text(header.DocumentNo) ?? sourceId}: no product lines resolved.`);
			continue;
		}
		const place = location(id(header.DeliveryLocationID) ?? id(header.LocationID));
		const createdAt = date(header.CreatedDate) ?? date(header.PurchaseDate) ?? new Date();
		if (documentId === 101) {
			const data = {
					supplierId, floorId: place.floorId ?? null,
					invoiceReference: `LEGACY-GRN-${sourceId}`,
					supplierInvoiceDate: date(header.PurchaseDate), expectedDeliveryDate: date(header.DeliveryDate),
					deliveryDate: integer(header.Status) === 1 ? (date(header.DeliveryDate) ?? date(header.PurchaseDate)) : null,
					status: integer(header.Status) === 1 ? 'Closed' : 'Draft',
					notes: legacyNotes('GRN', header), createdBy: user.id, createdAt,
					lines: { create: lines.map(({ detail, target, quantity }) => ({
						skuId: target.skuId, variantId: target.variantId,
						expectedQuantity: quantity.value, receivedQuantity: integer(header.Status) === 1 ? quantity.value : 0,
						costPrice: number(detail.CostPrice), sellingPrice: number(detail.SellingPrice) ?? number(detail.UnitPrice),
						notes: legacyNotes('GRN line', detail, quantity.exact),
					})) },
			};
			const existingId = existingLink?.targetType === 'grn' ? existingLink.targetId : undefined;
			const grn = existingId
				? await prisma.gRN.update({ where: { id: existingId }, data: { ...data, lines: { deleteMany: {}, ...data.lines } }, select: { id: true } })
				: await prisma.gRN.create({ data, select: { id: true } });
			await saveLink('purchaseheader', sourceId, text(header.DocumentNo), 'grn', grn.id, hash);
			if (!existingId) await prisma.inventoryEvent.create({ data: {
				eventType: 'GRN_CREATED', parentEntityId: grn.id, userId: user.id, terminalId: 'legacy-desktop-sync', timestamp: createdAt,
				metadata: { runId, historicalOnly: true, stockApplied: false, legacyPurchaseHeaderId: sourceId } as any,
			} });
			result.grns += 1;
		} else {
			const returnTypeId = id(header.PurchaseTypeID);
			const completed = integer(header.Status) === 1;
			const data = {
					supplierId, floorId: place.floorId ?? null,
					returnReason: returnReasons.get(returnTypeId) ?? (returnTypeId ? `Legacy return type ${returnTypeId}` : undefined),
					pickupDate: completed ? date(header.PurchaseDate) : null,
					status: completed ? 'PickedUp' : 'Draft', notes: legacyNotes('PRN', header), createdBy: user.id, createdAt,
					lines: { create: lines.map(({ detail, target, quantity }) => ({
						skuId: target.skuId, variantId: target.variantId,
						returnQuantity: quantity.value, pickedUpQuantity: completed ? quantity.value : 0,
						notes: legacyNotes('PRN line', detail, quantity.exact),
					})) },
			};
			const existingId = existingLink?.targetType === 'prn' ? existingLink.targetId : undefined;
			const prn = existingId
				? await prisma.pRN.update({ where: { id: existingId }, data: { ...data, lines: { deleteMany: {}, ...data.lines } }, select: { id: true } })
				: await prisma.pRN.create({ data, select: { id: true } });
			await saveLink('purchaseheader', sourceId, text(header.DocumentNo), 'prn', prn.id, hash);
			if (!existingId) await prisma.inventoryEvent.create({ data: {
				eventType: 'PRN_CREATED', parentEntityId: prn.id, userId: user.id, terminalId: 'legacy-desktop-sync', timestamp: createdAt,
				metadata: { runId, historicalOnly: true, stockApplied: false, legacyPurchaseHeaderId: sourceId } as any,
			} });
			result.prns += 1;
		}
	}

	const transferDetails = groupBy(rows.transfernotedetail ?? [], (row) => `${id(row.LocationID) ?? ''}:${text(row.DocumentNo) ?? ''}`);
	for (const header of rows.transfernoteheader ?? []) {
		const sourceId = id(header.TransferNoteHeaderID);
		if (!sourceId) continue;
		const from = location(id(header.LocationID));
		const to = location(id(header.ToLocationID));
		const details = transferDetails.get(`${id(header.LocationID) ?? ''}:${text(header.DocumentNo) ?? ''}`) ?? [];
		const hash = sourceHash(header, details);
		const existingLink = linkBySource.get(`transfernoteheader:${sourceId}`);
		if ((existingLink?.lastApplied as Row | null)?.sourceHash === hash) continue;
		const lines = details.flatMap((detail) => {
			const target = productTarget(id(detail.ProductID), id(detail.ProductColorSizeID));
			const requested = documentQuantity(detail);
			if (!target || requested.value <= 0) return [];
			const acceptedExact = Math.abs((number(detail.AcceptedQty) ?? ((header.Accepted === true || header.Accepted === 1) ? requested.exact : 0)) * Math.max(number(detail.PackSize) ?? 1, 1));
			return [{ detail, target, requested, accepted: Math.round(acceptedExact), acceptedExact }];
		});
		if (lines.length === 0) continue;
		const completed = header.Accepted === true || header.Accepted === 1 || header.Accepted === '1';
		const createdAt = date(header.CreatedDate) ?? date(header.DocumentDate) ?? new Date();
		const data = {
			referenceNumber: `LEGACY-TOG-${sourceId}`,
			fromBranchId: from.branchId ?? null, toBranchId: to.branchId ?? null,
			fromFloorId: from.floorId ?? null, toFloorId: to.floorId ?? null,
			status: completed ? 'Completed' : integer(header.Status) === 1 ? 'InTransit' : 'Draft',
			notes: legacyNotes('transfer', header), requestedBy: user.id, approvedBy: completed ? user.id : null,
			requestedAt: date(header.DocumentDate) ?? createdAt, approvedAt: completed ? (date(header.AcceptedDate) ?? createdAt) : null,
			completedAt: completed ? (date(header.AcceptedDate) ?? createdAt) : null,
			lines: { create: lines.map(({ detail, target, requested, accepted, acceptedExact }) => ({
				skuId: target.skuId, variantId: target.variantId, requestedQty: requested.value, transferredQty: accepted,
				notes: `${legacyNotes('transfer line', detail, requested.exact)}\nLegacy exact accepted quantity: ${acceptedExact}`,
			})) },
		};
		const existingId = existingLink?.targetType === 'stock-transfer' ? existingLink.targetId : undefined;
		const transfer = existingId
			? await prisma.stockTransfer.update({ where: { id: existingId }, data: { ...data, lines: { deleteMany: {}, ...data.lines } }, select: { id: true } })
			: await prisma.stockTransfer.create({ data, select: { id: true } });
		await saveLink('transfernoteheader', sourceId, text(header.DocumentNo), 'stock-transfer', transfer.id, hash);
		result.transfers += 1;
	}

	const adjustmentHeaders = new Map((rows.adjustmentheader ?? []).map((row) => [id(row.AdjustmentHeaderID), row]));
	for (const detail of rows.adjustmentdetail ?? []) {
		const sourceId = id(detail.AdjustmentDetailID);
		if (!sourceId) continue;
		const header = adjustmentHeaders.get(id(detail.AdjustmentHeaderID));
		const hash = sourceHash(header, detail);
		const existingLink = linkBySource.get(`adjustmentdetail:${sourceId}`);
		if ((existingLink?.lastApplied as Row | null)?.sourceHash === hash) continue;
		const createdAt = date(detail.CreatedDate) ?? date(detail.DocumentDate) ?? date(header?.DocumentDate) ?? new Date();
		const data = {
			eventType: 'MANUAL_ADJUSTMENT', parentEntityId: `legacy-adjustment:${sourceId}`,
			reasonCode: 'LEGACY_ADJUSTMENT', userId: user.id, terminalId: 'legacy-desktop-sync', timestamp: createdAt,
			metadata: {
				runId, historicalOnly: true, stockApplied: false, legacyAdjustmentDetailId: sourceId,
				legacyAdjustmentHeaderId: id(detail.AdjustmentHeaderID), documentNo: text(detail.DocumentNo) ?? text(header?.DocumentNo),
				adjustmentMode: integer(header?.AdjustmentMode), quantity: number(detail.Qty), productId: id(detail.ProductID),
				locationId: id(detail.LocationID), costPrice: number(detail.CostPrice), sellingPrice: number(detail.SellingPrice),
			} as any,
		};
		const existingId = existingLink?.targetType === 'inventory-event' ? existingLink.targetId : undefined;
		const event = existingId
			? await prisma.inventoryEvent.update({ where: { id: existingId }, data, select: { id: true } })
			: await prisma.inventoryEvent.create({ data, select: { id: true } });
		await saveLink('adjustmentdetail', sourceId, text(detail.DocumentNo), 'inventory-event', event.id, hash);
		result.adjustments += 1;
	}

	return result;
}
