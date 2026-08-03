import { GRNStatus, InventoryState, InventoryEventType } from '@jingles/shared';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { recordEvent } from '../inventory/eventLedger';
import { getStatusesByKeys, SpecialStatusKeys } from '../statuses/statusLookup';
import { queueDashboardStatsRefresh } from '../dashboard/dashboardService';
import { createBatch } from '../batch/batchService';
import {
	assertVariantBatchReferences,
	buildDocumentLineContext,
} from '../catalog/variantReferences';

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
		batchId?: string;
		createNewBatch?: boolean;
		costPrice?: number;
		sellingPrice?: number;
		wholesalePrice?: number;
		bulkPrice?: number;
		marginType?: 'fixed' | 'percentage';
		marginValue?: number;
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

	for (const [index, line] of data.lines.entries()) {
		await assertVariantBatchReferences(prisma, {
			skuId: line.skuId,
			variantId: line.variantId ?? null,
			batchId: line.createNewBatch ? null : (line.batchId ?? null),
			context: buildDocumentLineContext('GRN', index),
		});
	}

	// Allow the same product/variant in multiple lines when each line targets a different batch.
	const lineKeys = data.lines.map((line, index) =>
		`${line.skuId}:${line.variantId ?? ''}:${line.createNewBatch ? `new-${index}` : (line.batchId ?? '')}`,
	);
	const uniqueKeys = new Set(lineKeys);
	if (uniqueKeys.size !== lineKeys.length) {
		throw new Error('Duplicate SKUs or SKU+variant+batch combinations in GRN lines detected');
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
					batchId: line.createNewBatch ? undefined : line.batchId,
					costPrice: line.costPrice,
					sellingPrice: line.sellingPrice,
					wholesalePrice: line.wholesalePrice,
					bulkPrice: line.bulkPrice,
					notes: line.notes,
				})),
			},
		},
		include: { lines: true },
	});

	// Create batches for lines that request new batch creation
	for (let i = 0; i < data.lines.length; i++) {
		const line = data.lines[i];
		const grnLine = grn.lines[i];

		if (line.createNewBatch) {
			try {
				const batch = await createBatch({
					skuId: line.skuId,
					variantId: line.variantId,
					vendorId: data.supplierId,
					costPrice: line.costPrice,
					sellingPrice: line.sellingPrice,
					wholesalePrice: line.wholesalePrice,
					bulkPrice: line.bulkPrice,
					marginType: line.marginType,
					marginValue: line.marginValue,
					notes: line.notes,
				});

				// Update GRN line with the batch ID
				await prisma.gRNLine.update({
					where: { id: grnLine.id },
					data: { batchId: batch.id },
				});
			} catch (err) {
				console.error('Failed to create batch for GRN line:', err);
			}
		}
	}

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

export async function updateDraftGRN(grnId: string, data: {
	supplierId: string;
	floorId?: string | null;
	shelfId?: string | null;
	invoiceReference?: string | null;
	supplierInvoiceDate?: Date | null;
	expectedDeliveryDate?: Date | null;
	notes?: string | null;
	lines: Array<{
		skuId: string;
		variantId?: string;
		expectedQuantity: number;
		batchId?: string;
		createNewBatch?: boolean;
		costPrice?: number;
		sellingPrice?: number;
		wholesalePrice?: number;
		bulkPrice?: number;
		marginType?: 'fixed' | 'percentage';
		marginValue?: number;
		notes?: string;
	}>;
}) {
	const existing = await prisma.gRN.findUnique({ where: { id: grnId } });
	if (!existing) throw new Error('GRN not found');
	if (existing.status !== GRNStatus.Draft) throw new Error('Only Draft GRNs can be edited');
	if (!data.supplierId) throw new Error('Supplier is required');
	if (!Array.isArray(data.lines) || data.lines.length === 0) throw new Error('At least one GRN line is required');

	if (data.invoiceReference) {
		const duplicateInvoice = await prisma.gRN.findFirst({
			where: {
				id: { not: grnId },
				invoiceReference: data.invoiceReference,
				supplierId: data.supplierId,
			},
		});
		if (duplicateInvoice) {
			throw new Error(`Duplicate invoice reference: ${data.invoiceReference} for this supplier`);
		}
	}

	for (const [index, line] of data.lines.entries()) {
		if (!line.skuId || !Number.isFinite(line.expectedQuantity) || line.expectedQuantity <= 0) {
			throw new Error(`GRN line ${index + 1} requires a product and a positive quantity`);
		}
		await assertVariantBatchReferences(prisma, {
			skuId: line.skuId,
			variantId: line.variantId ?? null,
			batchId: line.createNewBatch ? null : (line.batchId ?? null),
			context: buildDocumentLineContext('GRN', index),
		});
	}

	const lineKeys = data.lines.map((line, index) =>
		`${line.skuId}:${line.variantId ?? ''}:${line.createNewBatch ? `new-${index}` : (line.batchId ?? '')}`,
	);
	if (new Set(lineKeys).size !== lineKeys.length) {
		throw new Error('Duplicate SKUs or SKU+variant+batch combinations in GRN lines detected');
	}

	const preparedLines: Array<Omit<(typeof data.lines)[number], 'batchId'> & { batchId: string | null }> = [];
	for (const line of data.lines) {
		let batchId = line.batchId || null;
		if (line.createNewBatch) {
			const batch = await createBatch({
				skuId: line.skuId,
				variantId: line.variantId,
				vendorId: data.supplierId,
				costPrice: line.costPrice,
				sellingPrice: line.sellingPrice,
				wholesalePrice: line.wholesalePrice,
				bulkPrice: line.bulkPrice,
				marginType: line.marginType,
				marginValue: line.marginValue,
				notes: line.notes,
			});
			batchId = batch.id;
		}
		preparedLines.push({ ...line, batchId });
	}

	await prisma.$transaction(async (tx) => {
		await tx.gRN.update({
			where: { id: grnId },
			data: {
				supplierId: data.supplierId,
				floorId: data.floorId || null,
				shelfId: data.shelfId || null,
				invoiceReference: data.invoiceReference || null,
				supplierInvoiceDate: data.supplierInvoiceDate || null,
				expectedDeliveryDate: data.expectedDeliveryDate || null,
				notes: data.notes || null,
			},
		});
		await tx.gRNLine.deleteMany({ where: { grnId } });
		await tx.gRNLine.createMany({
			data: preparedLines.map((line) => ({
				grnId,
				skuId: line.skuId,
				variantId: line.variantId || null,
				batchId: line.batchId,
				expectedQuantity: line.expectedQuantity,
				receivedQuantity: 0,
				costPrice: line.costPrice,
				sellingPrice: line.sellingPrice,
				wholesalePrice: line.wholesalePrice,
				bulkPrice: line.bulkPrice,
				notes: line.notes,
			})),
		});
	});

	queueDashboardStatsRefresh();
	return prisma.gRN.findUnique({
		where: { id: grnId },
		include: { lines: { include: { sku: true, variant: true, batch: true } } },
	});
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
					batchId: (line as any).batchId ?? null,
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
		SpecialStatusKeys.INVENTORY_UNINSPECTED,
		SpecialStatusKeys.INVENTORY_INSPECTED,
		SpecialStatusKeys.INVENTORY_DAMAGED,
	]);
	const grnDraftStatus = statusMap.get(SpecialStatusKeys.GRN_DRAFT)!;
	const grnFullyInspectedStatus = statusMap.get(SpecialStatusKeys.GRN_FULLY_INSPECTED)!;
	const grnPartiallyInspectedStatus = statusMap.get(SpecialStatusKeys.GRN_PARTIALLY_INSPECTED)!;
	const inventoryUninspected = statusMap.get(SpecialStatusKeys.INVENTORY_UNINSPECTED)!;
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

		// Find the UNINSPECTED inventory record created during GRN submission
		const uninspectedRecord = await tx.inventoryRecord.findFirst({
			where: {
				skuId: grnLine.skuId,
				variantId: grnLine.variantId ?? null,
				batchId: (grnLine as any).batchId ?? null,
				state: inventoryUninspected,
				// Match by GRN metadata in events to ensure we get the right record
			},
			orderBy: { createdAt: 'desc' },
		});

		if (!uninspectedRecord) {
			throw new Error('UNINSPECTED inventory record not found for this GRN line. GRN may not have been properly submitted.');
		}

		const totalInspected = data.approvedQuantity + data.rejectedQuantity;
		if (totalInspected !== uninspectedRecord.quantity) {
			throw new Error(
				`Inspection quantities (${data.approvedQuantity} approved + ${data.rejectedQuantity} rejected = ${totalInspected}) ` +
				`do not match uninspected quantity (${uninspectedRecord.quantity})`
			);
		}

		// Update the UNINSPECTED record based on inspection results
		if (data.approvedQuantity > 0 && data.rejectedQuantity === 0) {
			// All approved - update record to INSPECTED state
			await tx.inventoryRecord.update({
				where: { id: uninspectedRecord.id },
				data: {
					state: inventoryInspected,
					userId: data.inspectorUserId,
					version: { increment: 1 },
				},
			});

			await tx.inventoryEvent.create({
				data: {
					eventType: InventoryEventType.INSPECTION_APPROVED,
					parentEntityId: uninspectedRecord.id,
					quantityDelta: 0,
					beforeQuantity: uninspectedRecord.quantity,
					afterQuantity: data.approvedQuantity,
					userId: data.inspectorUserId,
					metadata: { grnLineId: data.grnLineId, inspectionId: record.id, previousState: inventoryUninspected, newState: inventoryInspected } as any,
				},
			});
		} else if (data.rejectedQuantity > 0 && data.approvedQuantity === 0) {
			// All damaged - update record to DAMAGED state
			await tx.inventoryRecord.update({
				where: { id: uninspectedRecord.id },
				data: {
					state: inventoryDamaged,
					userId: data.inspectorUserId,
					version: { increment: 1 },
				},
			});

			await tx.inventoryEvent.create({
				data: {
					eventType: InventoryEventType.DAMAGE_RECORDED,
					parentEntityId: uninspectedRecord.id,
					quantityDelta: 0,
					beforeQuantity: uninspectedRecord.quantity,
					afterQuantity: data.rejectedQuantity,
					userId: data.inspectorUserId,
					metadata: { grnLineId: data.grnLineId, inspectionId: record.id, damageClassification: data.damageClassification, previousState: inventoryUninspected, newState: inventoryDamaged } as any,
				},
			});
		} else if (data.approvedQuantity > 0 && data.rejectedQuantity > 0) {
			// Mixed result - update original to INSPECTED with approved quantity, create new DAMAGED record for rejected
			await tx.inventoryRecord.update({
				where: { id: uninspectedRecord.id },
				data: {
					quantity: data.approvedQuantity,
					state: inventoryInspected,
					userId: data.inspectorUserId,
					version: { increment: 1 },
				},
			});

			await tx.inventoryEvent.create({
				data: {
					eventType: InventoryEventType.INSPECTION_APPROVED,
					parentEntityId: uninspectedRecord.id,
					quantityDelta: -(data.rejectedQuantity),
					beforeQuantity: uninspectedRecord.quantity,
					afterQuantity: data.approvedQuantity,
					userId: data.inspectorUserId,
					metadata: { grnLineId: data.grnLineId, inspectionId: record.id, previousState: inventoryUninspected, newState: inventoryInspected, note: 'Partial approval - quantity adjusted' } as any,
				},
			});

			// Create new DAMAGED record for rejected quantity
			const damagedRecord = await tx.inventoryRecord.create({
				data: {
					skuId: grnLine.skuId,
					variantId: grnLine.variantId ?? null,
					batchId: (grnLine as any).batchId ?? null,
					floorId: uninspectedRecord.floorId,
					shelfId: uninspectedRecord.shelfId,
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
					metadata: { grnLineId: data.grnLineId, inspectionId: record.id, damageClassification: data.damageClassification, splitFromRecord: uninspectedRecord.id } as any,
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
