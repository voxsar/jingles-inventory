import { InventoryEventType } from '@jingles/shared';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { queueDashboardStatsRefresh } from '../dashboard/dashboardService';
import { createGRN } from '../grn/grnService';
import { createPRN } from '../purchaseReturns/prnService';
import { preparePromptContent } from './fileExtractor';
import { mapImportDocumentWithClaude } from './claudeClient';
import { prepareImportRecords } from './previewBuilder';
import {
	IMPORT_ENTITY_TYPES,
	IMPORT_JOB_STATUS,
	IMPORT_RECORD_STATUS,
	ImportEntityType,
	ImportJobStatus,
} from './types';

function cleanUndefined<T extends Record<string, any>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, current]) => current !== undefined),
	) as T;
}

function parseStoredDate(value: string | null | undefined) {
	if (!value) return undefined;
	return new Date(`${value}T00:00:00.000Z`);
}

async function ensureVendorFromResolution(resolution: any, defaultType: string) {
	if (!resolution || resolution.action === 'unresolved') {
		throw new Error('A supplier or vendor match is required before this record can be approved.');
	}

	const finalData = cleanUndefined({
		name: resolution.finalData?.name,
		contactEmail: resolution.finalData?.contactEmail,
		contactPhone: resolution.finalData?.contactPhone,
		address: resolution.finalData?.address,
		type: resolution.finalData?.type ?? defaultType,
		website: resolution.finalData?.website,
		taxId: resolution.finalData?.taxId,
		paymentTerms: resolution.finalData?.paymentTerms,
		notes: resolution.finalData?.notes,
		isActive: true,
	});

	if (resolution.vendorId) {
		const existing = await prisma.vendor.findUnique({ where: { id: resolution.vendorId } });
		if (existing) {
			const updated = await prisma.vendor.update({
				where: { id: existing.id },
				data: cleanUndefined({
					contactEmail: finalData.contactEmail ?? existing.contactEmail,
					contactPhone: finalData.contactPhone,
					address: finalData.address,
					type: finalData.type ?? existing.type,
					website: finalData.website,
					taxId: finalData.taxId,
					paymentTerms: finalData.paymentTerms,
					notes: finalData.notes,
					isActive: true,
				}),
			});
			return updated.id;
		}
	}

	if (!finalData.name || !finalData.contactEmail) {
		throw new Error('Vendor creation data is incomplete.');
	}

	const existingByName = await prisma.vendor.findUnique({ where: { name: finalData.name } });
	if (existingByName) {
		const updated = await prisma.vendor.update({
			where: { id: existingByName.id },
			data: cleanUndefined({
				contactEmail: finalData.contactEmail ?? existingByName.contactEmail,
				contactPhone: finalData.contactPhone,
				address: finalData.address,
				type: finalData.type ?? existingByName.type,
				website: finalData.website,
				taxId: finalData.taxId,
				paymentTerms: finalData.paymentTerms,
				notes: finalData.notes,
				isActive: true,
			}),
		});
		return updated.id;
	}

	const created = await prisma.vendor.create({ data: finalData });
	return created.id;
}

async function ensureBatchFromResolution(
	batchResolution: any,
	skuId: string,
	variantId: string | null | undefined,
	vendorId?: string | null,
) {
	if (!batchResolution || batchResolution.action === 'none') {
		return undefined;
	}

	if (batchResolution.action === 'match' && batchResolution.batchId) {
		return batchResolution.batchId;
	}

	if (batchResolution.action !== 'create') {
		return undefined;
	}

	return prisma.$transaction(async (tx) => {
		const desiredBatchNumber = batchResolution.batchNumber?.trim() || batchResolution.createData?.batchNumber?.trim() || null;
		if (desiredBatchNumber) {
			const existingByNumber = await tx.batch.findUnique({ where: { batchNumber: desiredBatchNumber } });
			if (existingByNumber) {
				if (existingByNumber.skuId !== skuId || (existingByNumber.variantId ?? null) !== (variantId ?? null)) {
					throw new Error(`Batch number "${desiredBatchNumber}" already exists for a different product or variant.`);
				}
				return existingByNumber.id;
			}
		}

		const lastBatch = await tx.batch.findFirst({
			where: { skuId, variantId: variantId ?? null },
			orderBy: { sequenceNumber: 'desc' },
			select: { sequenceNumber: true },
		});
		const sequenceNumber = (lastBatch?.sequenceNumber ?? 0) + 1;

		let batchNumber = desiredBatchNumber;
		if (!batchNumber) {
			if (variantId) {
				const variant = await tx.sKUVariant.findUnique({
					where: { id: variantId },
					select: { variantCode: true },
				});
				if (!variant) throw new Error('Variant not found while creating batch.');
				batchNumber = `${variant.variantCode}-B${String(sequenceNumber).padStart(3, '0')}`;
			} else {
				const sku = await tx.sKU.findUnique({
					where: { id: skuId },
					select: { skuCode: true },
				});
				if (!sku) throw new Error('SKU not found while creating batch.');
				batchNumber = `${sku.skuCode}-B${String(sequenceNumber).padStart(3, '0')}`;
			}
		}

		const created = await tx.batch.create({
			data: cleanUndefined({
				batchNumber,
				skuId,
				variantId: variantId ?? null,
				vendorId: vendorId ?? null,
				sequenceNumber,
				costPrice: batchResolution.createData?.costPrice,
				sellingPrice: batchResolution.createData?.sellingPrice,
				wholesalePrice: batchResolution.createData?.wholesalePrice,
				bulkPrice: batchResolution.createData?.bulkPrice,
				currency: batchResolution.createData?.currency ?? 'LKR',
				manufacturingDate: parseStoredDate(batchResolution.createData?.manufacturingDate),
				expiryDate: parseStoredDate(batchResolution.createData?.expiryDate),
				notes: batchResolution.createData?.notes,
				isActive: true,
			}),
			select: { id: true },
		});

		return created.id;
	});
}

async function applySupplierPayload(payload: any) {
	const vendorId = await ensureVendorFromResolution(payload.vendorResolution, 'Supplier');
	return { entityType: 'vendor', entityId: vendorId };
}

async function applyProductPayload(payload: any) {
	let existingSku = payload.existingSkuId
		? await prisma.sKU.findUnique({ where: { id: payload.existingSkuId } })
		: null;

	if (!existingSku && payload.finalData?.skuCode) {
		existingSku = await prisma.sKU.findUnique({ where: { skuCode: payload.finalData.skuCode } });
	}

	const vendorId = payload.vendorResolution && payload.vendorResolution.action !== 'unresolved'
		? await ensureVendorFromResolution(payload.vendorResolution, 'Both')
		: existingSku?.vendorId;
	if (!vendorId) {
		throw new Error('A vendor is required before this product can be approved.');
	}

	const data = cleanUndefined({
		skuCode: existingSku?.skuCode ?? payload.finalData?.skuCode,
		name: payload.finalData?.name,
		description: payload.finalData?.description,
		categoryId: payload.finalData?.categoryId ?? undefined,
		vendorId,
		unitOfMeasure: payload.finalData?.unitOfMeasure ?? 'Piece',
		unitOfMeasureId: payload.unitOfMeasureId ?? undefined,
		costPrice: payload.finalData?.costPrice,
		sellingPrice: payload.finalData?.sellingPrice,
		wholesalePrice: payload.finalData?.wholesalePrice,
		bulkPrice: payload.finalData?.bulkPrice,
		marginType: payload.finalData?.marginType,
		marginValue: payload.finalData?.marginValue,
		currency: payload.finalData?.currency ?? 'LKR',
		defaultManufacturingDate: parseStoredDate(payload.finalData?.defaultManufacturingDate),
		defaultExpiryDate: parseStoredDate(payload.finalData?.defaultExpiryDate),
		shelfLifeDays: payload.finalData?.shelfLifeDays,
		lowStockThreshold: payload.finalData?.lowStockThreshold,
	});

	if (!data.skuCode || !data.name) {
		throw new Error('Product import data is incomplete.');
	}

	if (existingSku) {
		const updated = await prisma.sKU.update({
			where: { id: existingSku.id },
			data,
			select: { id: true },
		});
		await prisma.sKUVendor.upsert({
			where: { skuId_vendorId: { skuId: updated.id, vendorId } },
			create: { skuId: updated.id, vendorId },
			update: {},
		});
		return { entityType: 'sku', entityId: updated.id };
	}

	const created = await prisma.sKU.create({
		data: {
			...data,
			skuVendors: {
				create: [{ vendorId }],
			},
		},
		select: { id: true },
	});
	return { entityType: 'sku', entityId: created.id };
}

async function applyInventoryPayload(payload: any, userId: string) {
	if (!payload.skuId) {
		throw new Error('The inventory record does not have a mapped SKU.');
	}

	const vendorId = payload.vendorResolution && payload.vendorResolution.action !== 'unresolved'
		? await ensureVendorFromResolution(payload.vendorResolution, 'Supplier')
		: undefined;
	const batchId = await ensureBatchFromResolution(payload.batchResolution, payload.skuId, payload.variantId, vendorId);

	const record = await prisma.inventoryRecord.create({
		data: cleanUndefined({
			skuId: payload.skuId,
			variantId: payload.variantId ?? null,
			batchId: batchId ?? null,
			floorId: payload.location?.floorId ?? null,
			shelfId: payload.location?.shelfId ?? null,
			boxId: payload.location?.boxId ?? null,
			quantity: payload.finalData?.quantity,
			state: payload.finalData?.state,
			terminalId: payload.finalData?.terminalId,
			userId,
			version: 1,
		}),
		select: { id: true, quantity: true },
	});

	await prisma.inventoryEvent.create({
		data: {
			eventType: InventoryEventType.MANUAL_ADJUSTMENT,
			parentEntityId: record.id,
			quantityDelta: record.quantity,
			beforeQuantity: 0,
			afterQuantity: record.quantity,
			userId,
			terminalId: payload.finalData?.terminalId,
			metadata: cleanUndefined({
				importNotes: payload.finalData?.notes,
				importBatchId: batchId,
			}),
		},
	});

	queueDashboardStatsRefresh();

	return { entityType: 'inventoryRecord', entityId: record.id };
}

async function applyGRNPayload(payload: any, userId: string) {
	const supplierId = await ensureVendorFromResolution(payload.supplierResolution, 'Supplier');

	const lines = [];
	for (const line of payload.lines ?? []) {
		if (!line.skuId) {
			throw new Error(`The GRN line "${line.skuCode ?? 'unknown line'}" does not have a mapped SKU.`);
		}

		const batchId = await ensureBatchFromResolution(line.batchResolution, line.skuId, line.variantId, supplierId);
		lines.push(cleanUndefined({
			skuId: line.skuId,
			variantId: line.variantId ?? undefined,
			expectedQuantity: line.expectedQuantity,
			batchId,
			createNewBatch: false,
			costPrice: line.costPrice,
			sellingPrice: line.sellingPrice,
			wholesalePrice: line.wholesalePrice,
			bulkPrice: line.bulkPrice,
			marginType: line.marginType,
			marginValue: line.marginValue,
			notes: line.notes,
		}));
	}

	const grn = await createGRN(cleanUndefined({
		supplierId,
		floorId: payload.location?.floorId ?? undefined,
		shelfId: payload.location?.shelfId ?? undefined,
		invoiceReference: payload.finalData?.invoiceReference,
		supplierInvoiceDate: parseStoredDate(payload.finalData?.supplierInvoiceDate),
		expectedDeliveryDate: parseStoredDate(payload.finalData?.expectedDeliveryDate),
		notes: payload.finalData?.notes,
		createdBy: userId,
		lines,
	}));

	return { entityType: 'grn', entityId: grn.id };
}

async function applyPRNPayload(payload: any, userId: string) {
	const supplierId = await ensureVendorFromResolution(payload.supplierResolution, 'Supplier');

	const prn = await createPRN(cleanUndefined({
		supplierId,
		floorId: payload.location?.floorId ?? undefined,
		shelfId: payload.location?.shelfId ?? undefined,
		returnReason: payload.finalData?.returnReason,
		expectedPickupDate: parseStoredDate(payload.finalData?.expectedPickupDate),
		notes: payload.finalData?.notes,
		createdBy: userId,
		lines: (payload.lines ?? []).map((line: any) => cleanUndefined({
			skuId: line.skuId,
			variantId: line.variantId ?? undefined,
			batchId: line.batchId ?? undefined,
			returnQuantity: line.returnQuantity,
			notes: line.notes,
		})),
	}));

	return { entityType: 'prn', entityId: prn.id };
}

async function applyPreparedPayload(payload: any, userId: string) {
	switch (payload.entityType as ImportEntityType) {
		case 'supplier':
			return applySupplierPayload(payload);
		case 'product':
			return applyProductPayload(payload);
		case 'inventory':
			return applyInventoryPayload(payload, userId);
		case 'grn':
			return applyGRNPayload(payload, userId);
		case 'prn':
			return applyPRNPayload(payload, userId);
		default:
			throw new Error(`Unsupported import entity type "${payload.entityType}"`);
	}
}

export function isImportEntityType(value: string): value is ImportEntityType {
	return IMPORT_ENTITY_TYPES.includes(value as ImportEntityType);
}

export function buildDerivedImportJobStatus(stats: {
	approvedCount: number;
	rejectedCount: number;
	failedCount?: number;
	pendingSelectedCount: number;
}): ImportJobStatus {
	const failedCount = stats.failedCount ?? 0;

	if (stats.approvedCount > 0 && (stats.pendingSelectedCount > 0 || failedCount > 0)) {
		return IMPORT_JOB_STATUS.PartiallyApproved;
	}
	if (stats.approvedCount > 0 && stats.pendingSelectedCount === 0 && failedCount === 0) {
		return IMPORT_JOB_STATUS.Approved;
	}
	if (stats.approvedCount === 0 && failedCount > 0 && stats.pendingSelectedCount === 0) {
		return IMPORT_JOB_STATUS.Failed;
	}
	if (stats.approvedCount === 0 && stats.rejectedCount > 0 && stats.pendingSelectedCount === 0 && failedCount === 0) {
		return IMPORT_JOB_STATUS.Rejected;
	}
	return IMPORT_JOB_STATUS.Ready;
}

export async function refreshImportJobStats(jobId: string, statusOverride?: ImportJobStatus) {
	const [
		totalCount,
		selectedCount,
		approvedCount,
		rejectedCount,
		failedCount,
		pendingSelectedCount,
	] = await Promise.all([
		prisma.importRecord.count({ where: { jobId } }),
		prisma.importRecord.count({ where: { jobId, isSelected: true } }),
		prisma.importRecord.count({ where: { jobId, recordStatus: IMPORT_RECORD_STATUS.Approved } }),
		prisma.importRecord.count({ where: { jobId, recordStatus: IMPORT_RECORD_STATUS.Rejected } }),
		prisma.importRecord.count({ where: { jobId, recordStatus: IMPORT_RECORD_STATUS.Failed } }),
		prisma.importRecord.count({ where: { jobId, recordStatus: IMPORT_RECORD_STATUS.Pending, isSelected: true } }),
	]);

	const nextStatus = statusOverride ?? buildDerivedImportJobStatus({
		approvedCount,
		rejectedCount,
		failedCount,
		pendingSelectedCount,
	});

	return prisma.importJob.update({
		where: { id: jobId },
		data: {
			status: nextStatus,
			totalRecords: totalCount,
			selectedRecords: selectedCount,
			approvedRecords: approvedCount,
			rejectedRecords: rejectedCount,
			approvedAt: approvedCount > 0 ? new Date() : null,
		},
	});
}

export async function processImportJob(jobId: string) {
	const job = await prisma.importJob.findUnique({ where: { id: jobId } });
	if (!job) return;
	if (!job.filePath) {
		await prisma.importJob.update({
			where: { id: jobId },
			data: {
				status: IMPORT_JOB_STATUS.Failed,
				errorMessage: 'The uploaded file could not be found for processing.',
			},
		});
		return;
	}

	if (!isImportEntityType(job.entityType)) {
		await prisma.importJob.update({
			where: { id: jobId },
			data: {
				status: IMPORT_JOB_STATUS.Failed,
				errorMessage: `Unsupported import entity type "${job.entityType}".`,
			},
		});
		return;
	}

	try {
		const promptContent = await preparePromptContent(job.filePath, job.filename, job.mimeType);
		const claudeResult = await mapImportDocumentWithClaude(job.entityType, promptContent);
		const prepared = await prepareImportRecords(job.entityType, claudeResult, jobId);

		if (prepared.preparedRecords.length === 0) {
			throw new Error('Claude did not return any records to review.');
		}

		await prisma.$transaction(async (tx) => {
			await tx.importRecord.deleteMany({ where: { jobId } });

			// Single batched insert instead of one INSERT per record
			await tx.importRecord.createMany({
				data: prepared.preparedRecords.map((record, index) => ({
					jobId,
					sourceIndex: index,
					recordType: record.recordType,
					recordStatus: IMPORT_RECORD_STATUS.Pending,
					isSelected: record.isSelected,
					confidence: record.confidence ?? undefined,
					summary: record.summary,
					payload: record.payload as unknown as Prisma.InputJsonValue,
					relatedRecords: record.relatedRecords as unknown as Prisma.InputJsonValue,
					warnings: record.warnings as unknown as Prisma.InputJsonValue,
					errors: record.errors as unknown as Prisma.InputJsonValue,
				})),
			});

			await tx.importJob.update({
				where: { id: jobId },
				data: {
					status: IMPORT_JOB_STATUS.Ready,
					metadata: {
						documentSummary: prepared.documentSummary,
						extraction: promptContent.metadata,
						model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
					} as unknown as Prisma.InputJsonValue,
					warnings: [...promptContent.warnings, ...prepared.warnings] as unknown as Prisma.InputJsonValue,
					errorMessage: null,
					processedAt: new Date(),
				},
			});
		});

		await refreshImportJobStats(jobId, IMPORT_JOB_STATUS.Ready);
	} catch (error: any) {
		await prisma.importJob.update({
			where: { id: jobId },
			data: {
				status: IMPORT_JOB_STATUS.Failed,
				errorMessage: error.message ?? 'Import processing failed.',
			},
		});
	}
}

export async function approveImportJob(jobId: string, userId: string) {
	const pendingRecords = await prisma.importRecord.findMany({
		where: {
			jobId,
			recordStatus: IMPORT_RECORD_STATUS.Pending,
			isSelected: true,
		},
		orderBy: { sourceIndex: 'asc' },
	});

	let approvedCount = 0;
	let failedCount = 0;

	// Records are applied in small chunks: job stats are refreshed between
	// chunks (so progress is visible) and the event loop gets breathing room
	// so a large approval never starves other requests.
	const APPROVAL_CHUNK_SIZE = 20;

	for (let offset = 0; offset < pendingRecords.length; offset += APPROVAL_CHUNK_SIZE) {
		const chunk = pendingRecords.slice(offset, offset + APPROVAL_CHUNK_SIZE);

		for (const record of chunk) {
			try {
				const result = await applyPreparedPayload(record.payload, userId);
				await prisma.importRecord.update({
					where: { id: record.id },
					data: {
						recordStatus: IMPORT_RECORD_STATUS.Approved,
						resultEntityType: result.entityType,
						resultEntityId: result.entityId,
						appliedAt: new Date(),
					},
				});
				approvedCount += 1;
			} catch (error: any) {
				const currentErrors = Array.isArray(record.errors) ? record.errors.map(String) : [];
				await prisma.importRecord.update({
					where: { id: record.id },
					data: {
						recordStatus: IMPORT_RECORD_STATUS.Failed,
						errors: [...currentErrors, error.message ?? 'Import approval failed.'] as unknown as Prisma.InputJsonValue,
					},
				});
				failedCount += 1;
			}
		}

		if (offset + APPROVAL_CHUNK_SIZE < pendingRecords.length) {
			await refreshImportJobStats(jobId);
			await new Promise<void>((resolve) => setImmediate(resolve));
		}
	}

	await refreshImportJobStats(jobId);

	return {
		totalAttempted: pendingRecords.length,
		approvedCount,
		failedCount,
	};
}

export async function rejectImportRecords(jobId: string, recordIds?: string[], selectedOnly = false) {
	const where = {
		jobId,
		recordStatus: IMPORT_RECORD_STATUS.Pending,
		...(selectedOnly ? { isSelected: true } : {}),
		...(recordIds && recordIds.length > 0 ? { id: { in: recordIds } } : {}),
	};

	const result = await prisma.importRecord.updateMany({
		where,
		data: {
			recordStatus: IMPORT_RECORD_STATUS.Rejected,
			isSelected: false,
		},
	});

	await refreshImportJobStats(jobId);

	return result.count;
}
