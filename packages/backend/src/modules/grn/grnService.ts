import { GRNStatus, InventoryState, InventoryEventType } from '@jingles/shared';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { recordEvent } from '../inventory/eventLedger';
import { getStatusesByKeys, SpecialStatusKeys } from '../statuses/statusLookup';
import { queueDashboardStatsRefresh } from '../dashboard/dashboardService';

export async function createGRN(data: {
	supplierId: string;
	floorId?: string;
	shelfId?: string;
	invoiceReference?: string;
	supplierInvoiceDate?: Date;
	expectedDeliveryDate?: Date;
	notes?: string;
	createdBy: string;
	lines: Array<{
		skuId: string;
		variantId?: string;
		expectedQuantity: number;
		batchReference?: string;
		notes?: string;
	}>;
}) {
	const statusMap = await getStatusesByKeys([SpecialStatusKeys.GRN_DRAFT]);
	const grnDraftStatus = statusMap.get(SpecialStatusKeys.GRN_DRAFT)!;

	if (data.invoiceReference) {
		const existing = await prisma.gRN.findFirst({
			where: { invoiceReference: data.invoiceReference, supplierId: data.supplierId },
		});
		if (existing) {
			throw new Error(`Duplicate invoice reference: ${data.invoiceReference} for this supplier`);
		}
	}

	// For duplicate detection consider variantId when present
	const lineKeys = data.lines.map(l => `${l.skuId}:${l.variantId ?? ''}`);
	const uniqueKeys = new Set(lineKeys);
	if (uniqueKeys.size !== lineKeys.length) {
		throw new Error('Duplicate SKUs (or SKU+variant combinations) in GRN lines detected');
	}

	const grn = await prisma.gRN.create({
		data: {
			supplierId: data.supplierId,
			floorId: data.floorId,
			shelfId: data.shelfId,
			invoiceReference: data.invoiceReference,
			supplierInvoiceDate: data.supplierInvoiceDate,
			expectedDeliveryDate: data.expectedDeliveryDate,
			notes: data.notes,
			createdBy: data.createdBy,
			status: grnDraftStatus,
			lines: {
				create: data.lines.map(line => ({
					skuId: line.skuId,
					variantId: line.variantId,
					expectedQuantity: line.expectedQuantity,
					receivedQuantity: 0,
					batchReference: line.batchReference,
					notes: line.notes,
				})),
			},
		},
		include: { lines: true },
	});

	await recordEvent({
		eventType: InventoryEventType.GRN_CREATED,
		parentEntityId: grn.id,
		userId: data.createdBy,
		metadata: { grnId: grn.id, supplierId: data.supplierId },
	});

	// Queue dashboard stats refresh in background
	queueDashboardStatsRefresh();

	return grn;
}

export async function submitGRN(grnId: string, userId: string, deliveryDate?: Date) {
	const statusMap = await getStatusesByKeys([
		SpecialStatusKeys.GRN_DRAFT,
		SpecialStatusKeys.GRN_SUBMITTED,
		SpecialStatusKeys.INVENTORY_UNINSPECTED,
	]);
	const grnDraftStatus = statusMap.get(SpecialStatusKeys.GRN_DRAFT)!;
	const grnSubmittedStatus = statusMap.get(SpecialStatusKeys.GRN_SUBMITTED)!;
	const inventoryUninspected = statusMap.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)!;

	const grn = await prisma.gRN.findUnique({
		where: { id: grnId },
		include: { lines: true },
	});

	if (!grn) throw new Error('GRN not found');
	if (grn.status !== grnDraftStatus) throw new Error('Only Draft GRNs can be submitted');
	if (!grn.shelfId) throw new Error('A shelf location must be assigned to the GRN before it can be submitted');

	const inventoryRecords = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		const records = [];

		for (const line of grn.lines) {
			await tx.gRNLine.update({
				where: { id: line.id },
				data: { receivedQuantity: line.expectedQuantity },
			});

			const record = await tx.inventoryRecord.create({
				data: {
					skuId: line.skuId,
					variantId: line.variantId ?? null,
					batchId: line.batchReference,
					floorId: grn.floorId,
					shelfId: grn.shelfId,
					quantity: line.expectedQuantity,
					state: inventoryUninspected,
					userId,
					version: 1,
				},
			});

			records.push(record);

			await tx.inventoryEvent.create({
				data: {
					eventType: InventoryEventType.GRN_CREATED,
					parentEntityId: record.id,
					quantityDelta: line.expectedQuantity,
					beforeQuantity: 0,
					afterQuantity: line.expectedQuantity,
					userId,
					metadata: { grnId, grnLineId: line.id } as any,
				},
			});
		}

		await tx.gRN.update({
			where: { id: grnId },
			data: {
				status: grnSubmittedStatus,
				deliveryDate: deliveryDate ?? new Date(),
			},
		});

		return records;
	});

	// Queue dashboard stats refresh in background
	queueDashboardStatsRefresh();

	return { grn: { ...grn, status: grnSubmittedStatus }, inventoryRecords };
}

export async function submitInspection(data: {
	grnLineId: string;
	approvedQuantity: number;
	rejectedQuantity: number;
	damageClassification?: string;
	inspectorUserId: string;
	remarks?: string;
}) {
	const statusMap = await getStatusesByKeys([
		SpecialStatusKeys.GRN_DRAFT,
		SpecialStatusKeys.GRN_FULLY_INSPECTED,
		SpecialStatusKeys.GRN_PARTIALLY_INSPECTED,
		SpecialStatusKeys.INVENTORY_INSPECTED,
		SpecialStatusKeys.INVENTORY_DAMAGED,
	]);
	const grnDraftStatus = statusMap.get(SpecialStatusKeys.GRN_DRAFT)!;
	const grnFullyInspectedStatus = statusMap.get(SpecialStatusKeys.GRN_FULLY_INSPECTED)!;
	const grnPartiallyInspectedStatus = statusMap.get(SpecialStatusKeys.GRN_PARTIALLY_INSPECTED)!;
	const inventoryInspected = statusMap.get(SpecialStatusKeys.INVENTORY_INSPECTED)!;
	const inventoryDamaged = statusMap.get(SpecialStatusKeys.INVENTORY_DAMAGED)!;

	const grnLine = await prisma.gRNLine.findUnique({
		where: { id: data.grnLineId },
		include: { grn: true },
	});

	if (!grnLine) throw new Error('GRN line not found');
	if (grnLine.grn.status === grnDraftStatus) throw new Error('GRN must be submitted before inspection');

	const inspection = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		const record = await tx.inspectionRecord.create({
			data: {
				grnLineId: data.grnLineId,
				approvedQuantity: data.approvedQuantity,
				rejectedQuantity: data.rejectedQuantity,
				damageClassification: data.damageClassification,
				inspectorUserId: data.inspectorUserId,
				remarks: data.remarks,
			},
		});

		if (data.approvedQuantity > 0) {
			const approvedRecord = await tx.inventoryRecord.create({
				data: {
					skuId: grnLine.skuId,
					variantId: grnLine.variantId ?? null,
					batchId: grnLine.batchReference,
					quantity: data.approvedQuantity,
					state: inventoryInspected,
					userId: data.inspectorUserId,
					version: 1,
				},
			});

			await tx.inventoryEvent.create({
				data: {
					eventType: InventoryEventType.INSPECTION_APPROVED,
					parentEntityId: approvedRecord.id,
					quantityDelta: data.approvedQuantity,
					beforeQuantity: 0,
					afterQuantity: data.approvedQuantity,
					userId: data.inspectorUserId,
					metadata: { grnLineId: data.grnLineId, inspectionId: record.id } as any,
				},
			});
		}

		if (data.rejectedQuantity > 0) {
			const damagedRecord = await tx.inventoryRecord.create({
				data: {
					skuId: grnLine.skuId,
					variantId: grnLine.variantId ?? null,
					batchId: grnLine.batchReference,
					quantity: data.rejectedQuantity,
					state: inventoryDamaged,
					userId: data.inspectorUserId,
					version: 1,
				},
			});

			await tx.inventoryEvent.create({
				data: {
					eventType: InventoryEventType.DAMAGE_RECORDED,
					parentEntityId: damagedRecord.id,
					quantityDelta: data.rejectedQuantity,
					beforeQuantity: 0,
					afterQuantity: data.rejectedQuantity,
					userId: data.inspectorUserId,
					metadata: { grnLineId: data.grnLineId, damageClassification: data.damageClassification } as any,
				},
			});
		}

		const allLines = await tx.gRNLine.findMany({
			where: { grnId: grnLine.grnId },
			include: { inspectionRecords: true },
		});

		const allInspected = allLines.every((l: any) => l.inspectionRecords.length > 0);
		const anyInspected = allLines.some((l: any) => l.inspectionRecords.length > 0);

		if (allInspected) {
			await tx.gRN.update({
				where: { id: grnLine.grnId },
				data: { status: grnFullyInspectedStatus },
			});
		} else if (anyInspected) {
			await tx.gRN.update({
				where: { id: grnLine.grnId },
				data: { status: grnPartiallyInspectedStatus },
			});
		}

		return record;
	});

	// Queue dashboard stats refresh in background
	queueDashboardStatsRefresh();

	return inspection;
}
