import { PRNStatus, InventoryEventType, InventoryState } from '@jingles/shared';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { recordEvent } from '../inventory/eventLedger';
import { getStatusesByKeys, SpecialStatusKeys } from '../statuses/statusLookup';
import { queueDashboardStatsRefresh } from '../dashboard/dashboardService';
import {
	assertVariantBatchReferences,
	buildDocumentLineContext,
} from '../catalog/variantReferences';

export async function createPRN(data: {
	supplierId: string;
	inspectionRecordId?: string;
	floorId?: string;
	shelfId?: string;
	returnReason?: string;
	expectedPickupDate?: Date;
	notes?: string;
	createdBy: string;
	lines: Array<{
		skuId: string;
		variantId?: string;
		batchId?: string;
		returnQuantity: number;
		notes?: string;
	}>;
}) {
	const statusMap = await getStatusesByKeys([SpecialStatusKeys.PRN_DRAFT]);
	const prnDraftStatus = statusMap.get(SpecialStatusKeys.PRN_DRAFT) ?? 'Draft';

	for (const [index, line] of data.lines.entries()) {
		await assertVariantBatchReferences(prisma, {
			skuId: line.skuId,
			variantId: line.variantId ?? null,
			batchId: line.batchId ?? null,
			context: buildDocumentLineContext('PRN', index),
		});
	}

	// Allow the same product/variant to appear on multiple lines only when each line targets a different batch.
	const lineKeys = data.lines.map((line) => `${line.skuId}:${line.variantId ?? ''}:${line.batchId ?? ''}`);
	const uniqueKeys = new Set(lineKeys);
	if (uniqueKeys.size !== lineKeys.length) {
		throw new Error('Duplicate SKUs or SKU+variant+batch combinations in PRN lines detected');
	}

	const prn = await prisma.pRN.create({
		data: {
			supplierId: data.supplierId,
			inspectionRecordId: data.inspectionRecordId,
			floorId: data.floorId,
			shelfId: data.shelfId,
			returnReason: data.returnReason,
			expectedPickupDate: data.expectedPickupDate,
			notes: data.notes,
			createdBy: data.createdBy,
			status: prnDraftStatus,
			lines: {
				create: data.lines.map(line => ({
					skuId: line.skuId,
					variantId: line.variantId,
					batchId: line.batchId,
					returnQuantity: line.returnQuantity,
					pickedUpQuantity: 0,
					notes: line.notes,
				})),
			},
		},
		include: { lines: true },
	});

	await recordEvent({
		eventType: InventoryEventType.PRN_CREATED,
		parentEntityId: prn.id,
		userId: data.createdBy,
		metadata: { prnId: prn.id, supplierId: data.supplierId },
	});

	// Queue dashboard stats refresh in background
	queueDashboardStatsRefresh();

	return prn;
}

export async function submitPRN(prnId: string, userId: string, pickupDate?: Date) {
	const statusMap = await getStatusesByKeys([
		SpecialStatusKeys.PRN_DRAFT,
		SpecialStatusKeys.PRN_SUBMITTED,
		SpecialStatusKeys.INVENTORY_DAMAGED,
		SpecialStatusKeys.INVENTORY_RETURNED,
	]);
	const prnDraftStatus = statusMap.get(SpecialStatusKeys.PRN_DRAFT) ?? 'Draft';
	const prnSubmittedStatus = statusMap.get(SpecialStatusKeys.PRN_SUBMITTED) ?? 'Submitted';
	const inventoryDamaged = statusMap.get(SpecialStatusKeys.INVENTORY_DAMAGED) ?? 'Damaged';
	const inventoryReturned = statusMap.get(SpecialStatusKeys.INVENTORY_RETURNED) ?? 'Returned';

	const prn = await prisma.pRN.findUnique({
		where: { id: prnId },
		include: { lines: true },
	});

	if (!prn) throw new Error('PRN not found');
	if (prn.status !== prnDraftStatus) throw new Error('Only Draft PRNs can be submitted');
	if (!prn.shelfId) throw new Error('A shelf location must be assigned to the PRN before it can be submitted');

	const inventoryRecords = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		const records = [];

		for (const line of prn.lines) {
			// Find damaged inventory to mark as returned
			const damagedRecord = await tx.inventoryRecord.findFirst({
				where: {
					skuId: line.skuId,
					variantId: line.variantId ?? null,
					batchId: (line as any).batchId ?? null,
					state: inventoryDamaged,
					floorId: prn.floorId,
					shelfId: prn.shelfId,
				},
				orderBy: { createdAt: 'desc' },
			});

			if (damagedRecord && damagedRecord.quantity >= line.returnQuantity) {
				// Update existing damaged record
				const updatedRecord = await tx.inventoryRecord.update({
					where: { id: damagedRecord.id },
					data: {
						quantity: damagedRecord.quantity - line.returnQuantity,
						version: { increment: 1 },
					},
				});

				// Create new record for returned items
				const returnedRecord = await tx.inventoryRecord.create({
					data: {
						skuId: line.skuId,
						variantId: line.variantId ?? null,
						batchId: (line as any).batchId ?? null,
						floorId: prn.floorId,
						shelfId: prn.shelfId,
						quantity: line.returnQuantity,
						state: inventoryReturned,
						userId,
						version: 1,
					},
				});

				records.push(returnedRecord);

				await tx.inventoryEvent.create({
					data: {
						eventType: InventoryEventType.RETURN_RECEIVED,
						parentEntityId: returnedRecord.id,
						quantityDelta: line.returnQuantity,
						beforeQuantity: 0,
						afterQuantity: line.returnQuantity,
						userId,
						metadata: { prnId, prnLineId: line.id, fromRecordId: damagedRecord.id } as any,
					},
				});
			} else {
				throw new Error(`Insufficient damaged inventory for SKU ${line.skuId}. PRN cannot be submitted.`);
			}
		}

		await tx.pRN.update({
			where: { id: prnId },
			data: {
				status: prnSubmittedStatus,
				pickupDate: pickupDate ?? new Date(),
			},
		});

		return records;
	});

	// Queue dashboard stats refresh in background
	queueDashboardStatsRefresh();

	return { prn: { ...prn, status: prnSubmittedStatus }, inventoryRecords };
}

export async function markPRNPickedUp(prnId: string, userId: string) {
	const statusMap = await getStatusesByKeys([
		SpecialStatusKeys.PRN_SUBMITTED,
		SpecialStatusKeys.PRN_PICKED_UP,
	]);
	const prnSubmittedStatus = statusMap.get(SpecialStatusKeys.PRN_SUBMITTED) ?? 'Submitted';
	const prnPickedUpStatus = statusMap.get(SpecialStatusKeys.PRN_PICKED_UP) ?? 'PickedUp';

	const prn = await prisma.pRN.findUnique({
		where: { id: prnId },
		include: { lines: true },
	});

	if (!prn) throw new Error('PRN not found');
	if (prn.status !== prnSubmittedStatus) throw new Error('Only Submitted PRNs can be marked as picked up');

	const updatedPRN = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		// Mark all lines as fully picked up
		for (const line of prn.lines) {
			await tx.pRNLine.update({
				where: { id: line.id },
				data: { pickedUpQuantity: line.returnQuantity },
			});
		}

		// Update PRN status
		const updated = await tx.pRN.update({
			where: { id: prnId },
			data: {
				status: prnPickedUpStatus,
				pickupDate: new Date(),
			},
		});

		return updated;
	});

	// Queue dashboard stats refresh in background
	queueDashboardStatsRefresh();

	return updatedPRN;
}
