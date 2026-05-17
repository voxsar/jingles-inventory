import prisma from '../../prisma/client';
import { InventoryEventType } from '@jingles/shared';

/**
 * GRN Report - Good Received Note Report
 * Shows all GRN records with supplier, line items, and status
 */
export async function getGRNReport(filters: {
	fromDate?: Date;
	toDate?: Date;
	supplierId?: string;
	status?: string;
	branchId?: string;
	page?: number;
	pageSize?: number;
}) {
	const { page = 1, pageSize = 50, fromDate, toDate, supplierId, status, branchId } = filters;
	const skip = (page - 1) * pageSize;

	const where: any = {};
	if (supplierId) where.supplierId = supplierId;
	if (status) where.status = status;
	if (branchId) where.floor = { branchId };
	if (fromDate || toDate) {
		where.createdAt = {};
		if (fromDate) where.createdAt.gte = fromDate;
		if (toDate) where.createdAt.lte = toDate;
	}

	const [items, total] = await Promise.all([
		prisma.gRN.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: { createdAt: 'desc' },
			include: {
				supplier: { select: { id: true, name: true, contactEmail: true } },
				floor: { include: { branch: { select: { id: true, name: true } } } },
				shelf: { select: { id: true, name: true, code: true } },
				creator: { select: { id: true, email: true } },
				lines: {
					include: {
						sku: { select: { id: true, skuCode: true, name: true } },
						variant: {
							include: {
								attributeValues: {
									include: { attribute: true, attributeValue: true },
								},
							},
						},
						batch: { select: { id: true, batchNumber: true, costPrice: true } },
					},
				},
			},
		}),
		prisma.gRN.count({ where }),
	]);

	// Calculate summary statistics
	const summary = items.reduce((acc, grn) => {
		acc.totalGRNs += 1;
		acc.totalLines += grn.lines.length;
		acc.totalQuantity += grn.lines.reduce((sum, line) => sum + line.expectedQuantity, 0);
		acc.totalAccepted += grn.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
		acc.totalRejected += grn.lines.reduce((sum, line) => sum + (line.expectedQuantity - line.receivedQuantity), 0);

		// Calculate total cost
		grn.lines.forEach(line => {
			if (line.batch?.costPrice && line.receivedQuantity) {
				acc.totalCost += line.batch.costPrice * line.receivedQuantity;
			}
		});

		return acc;
	}, {
		totalGRNs: 0,
		totalLines: 0,
		totalQuantity: 0,
		totalAccepted: 0,
		totalRejected: 0,
		totalCost: 0,
	});

	return {
		items,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
		summary,
	};
}

/**
 * PRN Report - Purchase Return Note Report
 * Shows all PRN records with supplier, line items, and status
 */
export async function getPRNReport(filters: {
	fromDate?: Date;
	toDate?: Date;
	supplierId?: string;
	status?: string;
	branchId?: string;
	page?: number;
	pageSize?: number;
}) {
	const { page = 1, pageSize = 50, fromDate, toDate, supplierId, status, branchId } = filters;
	const skip = (page - 1) * pageSize;

	const where: any = {};
	if (supplierId) where.supplierId = supplierId;
	if (status) where.status = status;
	if (branchId) where.floor = { branchId };
	if (fromDate || toDate) {
		where.createdAt = {};
		if (fromDate) where.createdAt.gte = fromDate;
		if (toDate) where.createdAt.lte = toDate;
	}

	const [items, total] = await Promise.all([
		prisma.pRN.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: { createdAt: 'desc' },
			include: {
				supplier: { select: { id: true, name: true, contactEmail: true } },
				floor: { include: { branch: { select: { id: true, name: true } } } },
				shelf: { select: { id: true, name: true, code: true } },
				creator: { select: { id: true, email: true } },
				lines: {
					include: {
						sku: { select: { id: true, skuCode: true, name: true } },
						variant: {
							include: {
								attributeValues: {
									include: { attribute: true, attributeValue: true },
								},
							},
						},
						batch: { select: { id: true, batchNumber: true, costPrice: true } },
					},
				},
			},
		}),
		prisma.pRN.count({ where }),
	]);

	// Calculate summary statistics
	const summary = items.reduce((acc, prn) => {
		acc.totalPRNs += 1;
		acc.totalLines += prn.lines.length;
		acc.totalQuantity += prn.lines.reduce((sum, line) => sum + line.returnQuantity, 0);

		// Calculate total cost
		prn.lines.forEach(line => {
			if (line.batch?.costPrice && line.returnQuantity) {
				acc.totalCost += line.batch.costPrice * line.returnQuantity;
			}
		});

		return acc;
	}, {
		totalPRNs: 0,
		totalLines: 0,
		totalQuantity: 0,
		totalCost: 0,
	});

	return {
		items,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
		summary,
	};
}

/**
 * Stock Adjustment Report
 * Shows all manual adjustments and damage records
 */
export async function getStockAdjustmentReport(filters: {
	fromDate?: Date;
	toDate?: Date;
	userId?: string;
	page?: number;
	pageSize?: number;
}) {
	const { page = 1, pageSize = 50, fromDate, toDate, userId } = filters;
	const skip = (page - 1) * pageSize;

	const where: any = {
		eventType: {
			in: [InventoryEventType.MANUAL_ADJUSTMENT, InventoryEventType.DAMAGE_RECORDED],
		},
	};

	if (userId) where.userId = userId;
	if (fromDate || toDate) {
		where.timestamp = {};
		if (fromDate) where.timestamp.gte = fromDate;
		if (toDate) where.timestamp.lte = toDate;
	}

	const [items, total] = await Promise.all([
		prisma.inventoryEvent.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: { timestamp: 'desc' },
			include: {
				user: { select: { id: true, email: true, role: true } },
			},
		}),
		prisma.inventoryEvent.count({ where }),
	]);

	// Calculate summary statistics
	const summary = items.reduce((acc, event) => {
		acc.totalAdjustments += 1;
		if (event.quantityDelta) {
			if (event.quantityDelta > 0) {
				acc.totalIncrease += event.quantityDelta;
			} else {
				acc.totalDecrease += Math.abs(event.quantityDelta);
			}
		}

		if (event.eventType === InventoryEventType.DAMAGE_RECORDED) {
			acc.damageEvents += 1;
		} else {
			acc.manualAdjustments += 1;
		}

		return acc;
	}, {
		totalAdjustments: 0,
		totalIncrease: 0,
		totalDecrease: 0,
		damageEvents: 0,
		manualAdjustments: 0,
	});

	return {
		items,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
		summary,
	};
}

/**
 * Stock Balance Report
 * Shows current inventory balances grouped by SKU, location, and state
 */
export async function getStockBalanceReport(filters: {
	skuId?: string;
	branchId?: string;
	floorId?: string;
	state?: string;
	page?: number;
	pageSize?: number;
}) {
	const { page = 1, pageSize = 50, skuId, branchId, floorId, state } = filters;
	const skip = (page - 1) * pageSize;

	const where: any = {};
	if (skuId) where.skuId = skuId;
	if (state) where.state = state;
	if (floorId) {
		where.floorId = floorId;
	} else if (branchId) {
		where.floor = { branchId };
	}

	const [items, total] = await Promise.all([
		prisma.inventoryRecord.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: [{ skuId: 'asc' }, { floorId: 'asc' }, { state: 'asc' }],
			include: {
				sku: {
					include: {
						vendor: { select: { id: true, name: true } },
						category: { select: { id: true, name: true } },
					},
				},
				variant: {
					include: {
						attributeValues: {
							include: { attribute: true, attributeValue: true },
						},
					},
				},
				batch: { select: { id: true, batchNumber: true, costPrice: true, sellingPrice: true } },
				floor: { include: { branch: { select: { id: true, name: true } } } },
				shelf: { select: { id: true, name: true, code: true } },
				box: { select: { id: true, code: true } },
			},
		}),
		prisma.inventoryRecord.count({ where }),
	]);

	// Calculate summary statistics
	const summary = items.reduce((acc, record) => {
		acc.totalRecords += 1;
		acc.totalQuantity += record.quantity;

		// Group by state
		if (!acc.byState[record.state]) {
			acc.byState[record.state] = { count: 0, quantity: 0 };
		}
		acc.byState[record.state].count += 1;
		acc.byState[record.state].quantity += record.quantity;

		// Calculate total value
		if (record.batch?.costPrice) {
			acc.totalCostValue += record.batch.costPrice * record.quantity;
		}
		if (record.batch?.sellingPrice) {
			acc.totalSellingValue += record.batch.sellingPrice * record.quantity;
		}

		return acc;
	}, {
		totalRecords: 0,
		totalQuantity: 0,
		totalCostValue: 0,
		totalSellingValue: 0,
		byState: {} as Record<string, { count: number; quantity: number }>,
	});

	return {
		items,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
		summary,
	};
}

/**
 * Stock Movement Report
 * Shows all inventory state changes and location transfers
 */
export async function getStockMovementReport(filters: {
	fromDate?: Date;
	toDate?: Date;
	skuId?: string;
	branchId?: string;
	eventType?: string;
	page?: number;
	pageSize?: number;
}) {
	const { page = 1, pageSize = 50, fromDate, toDate, skuId, eventType } = filters;
	const skip = (page - 1) * pageSize;

	const where: any = {};

	if (eventType) {
		where.eventType = eventType;
	} else {
		// Default to movement-related events
		where.eventType = {
			in: [
				InventoryEventType.STATE_CHANGE,
				InventoryEventType.LOCATION_TRANSFER,
				InventoryEventType.BOX_OPENED,
				InventoryEventType.INSPECTION_APPROVED,
			],
		};
	}

	if (fromDate || toDate) {
		where.timestamp = {};
		if (fromDate) where.timestamp.gte = fromDate;
		if (toDate) where.timestamp.lte = toDate;
	}

	const [items, total] = await Promise.all([
		prisma.inventoryEvent.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: { timestamp: 'desc' },
			include: {
				user: { select: { id: true, email: true, role: true } },
			},
		}),
		prisma.inventoryEvent.count({ where }),
	]);

	// Calculate summary statistics
	const summary = items.reduce((acc, event) => {
		acc.totalMovements += 1;

		// Group by event type
		if (!acc.byEventType[event.eventType]) {
			acc.byEventType[event.eventType] = 0;
		}
		acc.byEventType[event.eventType] += 1;

		// Calculate quantity moved
		if (event.quantityDelta) {
			acc.totalQuantityMoved += Math.abs(event.quantityDelta);
		}

		return acc;
	}, {
		totalMovements: 0,
		totalQuantityMoved: 0,
		byEventType: {} as Record<string, number>,
	});

	return {
		items,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
		summary,
	};
}

/**
 * Transfer of Good Note (TOG) Report
 * Shows all stock transfers between branches/floors
 */
export async function getTOGReport(filters: {
	fromDate?: Date;
	toDate?: Date;
	fromBranchId?: string;
	toBranchId?: string;
	status?: string;
	page?: number;
	pageSize?: number;
}) {
	const { page = 1, pageSize = 50, fromDate, toDate, fromBranchId, toBranchId, status } = filters;
	const skip = (page - 1) * pageSize;

	const where: any = {};
	if (fromBranchId) where.fromBranchId = fromBranchId;
	if (toBranchId) where.toBranchId = toBranchId;
	if (status) where.status = status;
	if (fromDate || toDate) {
		where.requestedAt = {};
		if (fromDate) where.requestedAt.gte = fromDate;
		if (toDate) where.requestedAt.lte = toDate;
	}

	const [items, total] = await Promise.all([
		prisma.stockTransfer.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: { requestedAt: 'desc' },
			include: {
				fromBranch: { select: { id: true, name: true, code: true } },
				toBranch: { select: { id: true, name: true, code: true } },
				fromFloor: { select: { id: true, name: true } },
				toFloor: { select: { id: true, name: true } },
				requester: { select: { id: true, email: true } },
				approver: { select: { id: true, email: true } },
				lines: {
					include: {
						sku: { select: { id: true, skuCode: true, name: true } },
						variant: {
							include: {
								attributeValues: {
									include: { attribute: true, attributeValue: true },
								},
							},
						},
						batch: { select: { id: true, batchNumber: true, costPrice: true } },
					},
				},
			},
		}),
		prisma.stockTransfer.count({ where }),
	]);

	// Calculate summary statistics
	const summary = items.reduce((acc, transfer) => {
		acc.totalTransfers += 1;
		acc.totalLines += transfer.lines.length;
		acc.totalRequestedQty += transfer.lines.reduce((sum, line) => sum + line.requestedQty, 0);
		acc.totalTransferredQty += transfer.lines.reduce((sum, line) => sum + line.transferredQty, 0);

		// Group by status
		if (!acc.byStatus[transfer.status]) {
			acc.byStatus[transfer.status] = 0;
		}
		acc.byStatus[transfer.status] += 1;

		// Calculate total cost
		transfer.lines.forEach(line => {
			if (line.batch?.costPrice && line.transferredQty) {
				acc.totalCost += line.batch.costPrice * line.transferredQty;
			}
		});

		return acc;
	}, {
		totalTransfers: 0,
		totalLines: 0,
		totalRequestedQty: 0,
		totalTransferredQty: 0,
		totalCost: 0,
		byStatus: {} as Record<string, number>,
	});

	return {
		items,
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
		summary,
	};
}

type CommonReportFilters = {
	fromDate?: Date;
	toDate?: Date;
	supplierId?: string;
	branchId?: string;
	floorId?: string;
	skuId?: string;
	status?: string;
	eventType?: string;
	groupBy?: string;
	search?: string;
	page?: number;
	pageSize?: number;
};

type SourceRequirement = {
	module: string;
	tables: string[];
	requiredFields: string[];
	relationships?: string[];
	notes?: string[];
};

const emptySourceReport = (reportName: string, filters: CommonReportFilters = {}, requirement?: SourceRequirement) => {
	const page = filters.page ?? 1;
	const pageSize = filters.pageSize ?? 50;
	const missingTables = requirement?.tables?.join(', ');
	return {
		items: [],
		total: 0,
		page,
		pageSize,
		totalPages: 0,
		summary: {
			reportName,
			sourceStatus: 'Source table not configured',
			availableRows: 0,
			...(missingTables ? { missingTables } : {}),
		},
		missingSource: requirement,
		notice: requirement
			? `${reportName} is not connected because the ${requirement.module} source is missing. Add/connect table(s): ${missingTables}. Required fields: ${requirement.requiredFields.join(', ')}.`
			: `${reportName} needs its source module/table connected before live rows can be displayed.`,
	};
};

const addDateRange = (where: any, field: string, fromDate?: Date, toDate?: Date) => {
	if (!fromDate && !toDate) return;
	where[field] = {};
	if (fromDate) where[field].gte = fromDate;
	if (toDate) where[field].lte = toDate;
};

const normalizeSearch = (value?: string) => value?.trim();

const metadataRecord = (value: unknown): Record<string, any> => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value as Record<string, any>;
};

const stringFrom = (...values: any[]) => {
	const value = values.find((item) => item !== undefined && item !== null && item !== '');
	return value === undefined ? '' : String(value);
};

const numberFrom = (...values: any[]) => {
	for (const value of values) {
		if (value === undefined || value === null || value === '') continue;
		const number = Number(value);
		if (Number.isFinite(number)) return number;
	}
	return 0;
};

const paginateRows = <T>(rows: T[], filters: CommonReportFilters) => {
	const page = filters.page ?? 1;
	const pageSize = filters.pageSize ?? 50;
	const start = (page - 1) * pageSize;
	return {
		items: rows.slice(start, start + pageSize),
		total: rows.length,
		page,
		pageSize,
		totalPages: Math.ceil(rows.length / pageSize),
	};
};

const getInventoryEventRows = async (
	eventTypes: string[],
	filters: CommonReportFilters,
	options: { cardOnly?: boolean; receiptsOnly?: boolean; exchangeOnly?: boolean } = {}
) => {
	const { page = 1, pageSize = 50, fromDate, toDate, branchId, floorId, skuId, search } = filters;
	const skip = (page - 1) * pageSize;
	const where: any = { eventType: { in: eventTypes } };
	addDateRange(where, 'timestamp', fromDate, toDate);

	if (options.exchangeOnly) {
		where.OR = [
			{ reasonCode: { contains: 'exchange', mode: 'insensitive' } },
			{ eventType: InventoryEventType.STATE_CHANGE },
		];
	}

	const events = await prisma.inventoryEvent.findMany({
		where,
		skip,
		take: pageSize,
		orderBy: { timestamp: 'desc' },
		include: { user: { select: { id: true, email: true, role: true } } },
	});

	const total = await prisma.inventoryEvent.count({ where });
	const parentIds = Array.from(new Set(events.map((event) => event.parentEntityId).filter(Boolean))) as string[];
	const records = parentIds.length > 0
		? await prisma.inventoryRecord.findMany({
			where: { id: { in: parentIds } },
			include: {
				sku: { include: { category: true, vendor: { select: { id: true, name: true } } } },
				batch: true,
				floor: { include: { branch: { select: { id: true, name: true, code: true } } } },
			},
		})
		: [];
	const recordMap = new Map(records.map((record) => [record.id, record]));

	const rows = events.map((event) => {
		const metadata = (event.metadata ?? {}) as Record<string, any>;
		const record = event.parentEntityId ? recordMap.get(event.parentEntityId) : undefined;
		const quantity = Math.abs(Number(metadata.quantity ?? event.quantityDelta ?? 0));
		const unitCost = Number(metadata.unitCost ?? metadata.costPrice ?? record?.batch?.costPrice ?? record?.sku?.costPrice ?? 0);
		const unitPrice = Number(metadata.unitPrice ?? metadata.sellingPrice ?? metadata.price ?? record?.batch?.sellingPrice ?? record?.sku?.sellingPrice ?? 0);
		const revenue = Number(metadata.revenue ?? metadata.totalAmount ?? (unitPrice * quantity));
		const cost = Number(metadata.cost ?? (unitCost * quantity));
		const paymentMethod = String(metadata.paymentMethod ?? metadata.tenderType ?? '');
		const receiptNumber = metadata.receiptNumber ?? metadata.receiptNo ?? metadata.invoiceNo ?? '';
		return {
			id: event.id,
			date: event.timestamp,
			eventType: event.eventType,
			reference: metadata.reference ?? metadata.posReference ?? receiptNumber ?? event.parentEntityId ?? event.id,
			receiptNumber,
			terminalId: event.terminalId ?? metadata.terminalId ?? '',
			unit: metadata.unit ?? metadata.posUnit ?? event.terminalId ?? '',
			skuId: metadata.skuId ?? record?.skuId ?? '',
			skuCode: metadata.skuCode ?? record?.sku?.skuCode ?? '',
			productName: metadata.productName ?? metadata.skuName ?? record?.sku?.name ?? '',
			category: metadata.category ?? record?.sku?.category?.name ?? '',
			department: metadata.department ?? record?.sku?.category?.name ?? '',
			branch: metadata.branch ?? record?.floor?.branch?.name ?? '',
			branchId: metadata.branchId ?? record?.floor?.branch?.id ?? '',
			floorId: metadata.floorId ?? record?.floorId ?? '',
			salesman: metadata.salesman ?? metadata.salesPerson ?? event.user?.email ?? '',
			paymentMethod,
			cardType: metadata.cardType ?? metadata.cardScheme ?? '',
			quantity,
			unitCost,
			unitPrice,
			cost,
			revenue,
			grossProfit: revenue - cost,
			marginPercent: revenue ? ((revenue - cost) / revenue) * 100 : 0,
			reasonCode: event.reasonCode ?? metadata.reason ?? '',
			user: event.user,
			metadata,
		};
	}).filter((row) => {
		if (skuId && row.skuId !== skuId) return false;
		if (branchId && row.branchId !== branchId) return false;
		if (floorId && row.floorId !== floorId) return false;
		if (options.cardOnly && !/card|visa|master|amex/i.test(`${row.paymentMethod} ${row.cardType}`)) return false;
		if (options.receiptsOnly && !row.receiptNumber) return false;
		const needle = normalizeSearch(search)?.toLowerCase();
		if (needle) {
			const haystack = [row.reference, row.receiptNumber, row.skuCode, row.productName, row.category, row.branch, row.salesman].join(' ').toLowerCase();
			if (!haystack.includes(needle)) return false;
		}
		return true;
	});

	return { rows, total, page, pageSize };
};

export async function getTOGProductWiseReport(filters: CommonReportFilters) {
	const { page = 1, pageSize = 50, fromDate, toDate, branchId, skuId, status, search } = filters;
	const skip = (page - 1) * pageSize;
	const where: any = {};
	if (status) where.status = status;
	if (branchId) where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }];
	addDateRange(where, 'requestedAt', fromDate, toDate);

	const transfers = await prisma.stockTransfer.findMany({
		where,
		skip,
		take: pageSize,
		orderBy: { requestedAt: 'desc' },
		include: {
			fromBranch: { select: { id: true, name: true, code: true } },
			toBranch: { select: { id: true, name: true, code: true } },
			fromFloor: { select: { id: true, name: true } },
			toFloor: { select: { id: true, name: true } },
			lines: {
				include: {
					sku: { include: { category: true } },
					variant: true,
					batch: true,
				},
			},
		},
	});

	const rows = transfers.flatMap((transfer) => transfer.lines.map((line) => ({
		id: `${transfer.id}-${line.id}`,
		referenceNumber: transfer.referenceNumber,
		status: transfer.status,
		date: transfer.requestedAt,
		fromBranch: transfer.fromBranch?.name ?? '',
		toBranch: transfer.toBranch?.name ?? '',
		fromFloor: transfer.fromFloor?.name ?? '',
		toFloor: transfer.toFloor?.name ?? '',
		skuId: line.skuId,
		skuCode: line.sku.skuCode,
		productName: line.sku.name,
		category: line.sku.category?.name ?? '',
		batchNumber: line.batch?.batchNumber ?? '',
		requestedQty: line.requestedQty,
		transferredQty: line.transferredQty,
		togOut: line.transferredQty,
		togIn: line.transferredQty,
	}))).filter((row) => {
		if (skuId && row.skuId !== skuId) return false;
		const needle = normalizeSearch(search)?.toLowerCase();
		if (!needle) return true;
		return [row.referenceNumber, row.skuCode, row.productName, row.category, row.batchNumber].join(' ').toLowerCase().includes(needle);
	});

	const summary = rows.reduce((acc, row) => {
		acc.totalLines += 1;
		acc.totalRequestedQty += row.requestedQty;
		acc.totalTransferredQty += row.transferredQty;
		return acc;
	}, { totalLines: 0, totalRequestedQty: 0, totalTransferredQty: 0 });

	return {
		items: rows,
		total: rows.length,
		page,
		pageSize,
		totalPages: Math.ceil(rows.length / pageSize),
		summary,
	};
}

export async function getStockValuationReport(filters: CommonReportFilters) {
	const balance = await getStockBalanceReport({ ...filters, state: filters.status });
	const items = balance.items.map((record: any) => {
		const costPrice = record.batch?.costPrice ?? record.sku?.costPrice ?? 0;
		const sellingPrice = record.batch?.sellingPrice ?? record.sku?.sellingPrice ?? 0;
		return {
			...record,
			skuCode: record.sku?.skuCode,
			productName: record.sku?.name,
			category: record.sku?.category?.name,
			vendor: record.sku?.vendor?.name,
			costPrice,
			sellingPrice,
			costValue: costPrice * record.quantity,
			sellingValue: sellingPrice * record.quantity,
			potentialMargin: (sellingPrice - costPrice) * record.quantity,
		};
	});

	const summary = items.reduce((acc: any, row: any) => {
		acc.totalQuantity += row.quantity ?? 0;
		acc.totalCostValue += row.costValue ?? 0;
		acc.totalSellingValue += row.sellingValue ?? 0;
		acc.potentialMargin += row.potentialMargin ?? 0;
		return acc;
	}, { totalQuantity: 0, totalCostValue: 0, totalSellingValue: 0, potentialMargin: 0 });

	return { ...balance, items, summary };
}

export async function getReorderLevelReport(filters: CommonReportFilters) {
	const { page = 1, pageSize = 50, supplierId, skuId, search } = filters;
	const skip = (page - 1) * pageSize;
	const where: any = { isActive: true, lowStockThreshold: { not: null } };
	if (supplierId) where.vendorId = supplierId;
	if (skuId) where.id = skuId;
	const needle = normalizeSearch(search);
	if (needle) {
		where.OR = [
			{ skuCode: { contains: needle, mode: 'insensitive' } },
			{ name: { contains: needle, mode: 'insensitive' } },
		];
	}

	const [skus, total] = await Promise.all([
		prisma.sKU.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: { name: 'asc' },
			include: {
				vendor: { select: { id: true, name: true } },
				category: { select: { id: true, name: true } },
				inventoryRecords: { where: { quantity: { gt: 0 } }, select: { quantity: true } },
			},
		}),
		prisma.sKU.count({ where }),
	]);

	const items = skus.map((sku) => {
		const currentQuantity = sku.inventoryRecords.reduce((sum, record) => sum + record.quantity, 0);
		const reorderLevel = sku.lowStockThreshold ?? 0;
		return {
			id: sku.id,
			skuCode: sku.skuCode,
			productName: sku.name,
			category: sku.category?.name ?? '',
			vendor: sku.vendor.name,
			currentQuantity,
			reorderLevel,
			shortfall: Math.max(reorderLevel - currentQuantity, 0),
			status: currentQuantity <= reorderLevel ? 'Reorder' : 'OK',
		};
	});

	const summary = items.reduce((acc, row) => {
		acc.totalProducts += 1;
		if (row.status === 'Reorder') acc.reorderRequired += 1;
		acc.totalShortfall += row.shortfall;
		return acc;
	}, { totalProducts: 0, reorderRequired: 0, totalShortfall: 0 });

	return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize), summary };
}

export async function getExpiryDateReport(filters: CommonReportFilters & { daysToExpiry?: number }) {
	const { page = 1, pageSize = 50, supplierId, skuId, search, daysToExpiry } = filters;
	const skip = (page - 1) * pageSize;
	const where: any = { expiryDate: { not: null } };
	if (supplierId) where.vendorId = supplierId;
	if (skuId) where.skuId = skuId;
	if (daysToExpiry) {
		where.expiryDate = {
			not: null,
			lte: new Date(Date.now() + daysToExpiry * 24 * 60 * 60 * 1000),
		};
	}
	const needle = normalizeSearch(search);
	if (needle) {
		where.OR = [
			{ batchNumber: { contains: needle, mode: 'insensitive' } },
			{ sku: { name: { contains: needle, mode: 'insensitive' } } },
			{ sku: { skuCode: { contains: needle, mode: 'insensitive' } } },
		];
	}

	const [batches, total] = await Promise.all([
		prisma.batch.findMany({
			where,
			skip,
			take: pageSize,
			orderBy: { expiryDate: 'asc' },
			include: {
				sku: { include: { category: true, vendor: { select: { id: true, name: true } } } },
				vendor: { select: { id: true, name: true } },
				inventoryRecords: { where: { quantity: { gt: 0 } }, select: { quantity: true, state: true } },
			},
		}),
		prisma.batch.count({ where }),
	]);

	const today = new Date();
	const items = batches.map((batch) => {
		const quantity = batch.inventoryRecords.reduce((sum, record) => sum + record.quantity, 0);
		const daysRemaining = batch.expiryDate ? Math.ceil((batch.expiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)) : null;
		return {
			id: batch.id,
			batchNumber: batch.batchNumber,
			skuCode: batch.sku.skuCode,
			productName: batch.sku.name,
			category: batch.sku.category?.name ?? '',
			vendor: batch.vendor?.name ?? batch.sku.vendor.name,
			manufacturingDate: batch.manufacturingDate,
			expiryDate: batch.expiryDate,
			daysRemaining,
			quantity,
			costValue: (batch.costPrice ?? batch.sku.costPrice ?? 0) * quantity,
			status: daysRemaining !== null && daysRemaining < 0 ? 'Expired' : daysRemaining !== null && daysRemaining <= 30 ? 'Expiring Soon' : 'OK',
		};
	});

	const summary = items.reduce((acc, row) => {
		acc.totalBatches += 1;
		acc.totalQuantity += row.quantity;
		if (row.status === 'Expired') acc.expired += 1;
		if (row.status === 'Expiring Soon') acc.expiringSoon += 1;
		return acc;
	}, { totalBatches: 0, totalQuantity: 0, expired: 0, expiringSoon: 0 });

	return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize), summary };
}

export async function getPriceChangeReport(filters: CommonReportFilters) {
	const { page = 1, pageSize = 50, fromDate, toDate, supplierId, skuId, search } = filters;
	const skip = (page - 1) * pageSize;
	const where: any = {};
	if (supplierId) where.grn = { ...(where.grn ?? {}), supplierId };
	if (skuId) where.skuId = skuId;
	if (fromDate || toDate) {
		where.grn = { ...(where.grn ?? {}), createdAt: {} };
		if (fromDate) where.grn.createdAt.gte = fromDate;
		if (toDate) where.grn.createdAt.lte = toDate;
	}

	const lines = await prisma.gRNLine.findMany({
		where,
		skip,
		take: pageSize,
		orderBy: { grn: { createdAt: 'desc' } },
		include: {
			grn: { include: { supplier: { select: { id: true, name: true } } } },
			sku: { include: { category: true } },
			batch: true,
		},
	});

	const needle = normalizeSearch(search)?.toLowerCase();
	const items = lines.map((line) => ({
		id: line.id,
		date: line.grn.createdAt,
		grnReference: line.grn.invoiceReference ?? line.grn.id,
		supplier: line.grn.supplier.name,
		skuId: line.skuId,
		skuCode: line.sku.skuCode,
		productName: line.sku.name,
		category: line.sku.category?.name ?? '',
		batchNumber: line.batch?.batchNumber ?? '',
		costPrice: line.costPrice ?? line.batch?.costPrice ?? line.sku.costPrice ?? 0,
		sellingPrice: line.sellingPrice ?? line.batch?.sellingPrice ?? line.sku.sellingPrice ?? 0,
		wholesalePrice: line.wholesalePrice ?? line.batch?.wholesalePrice ?? line.sku.wholesalePrice ?? 0,
		bulkPrice: line.bulkPrice ?? line.batch?.bulkPrice ?? line.sku.bulkPrice ?? 0,
		quantity: line.receivedQuantity,
	})).filter((row) => !needle || [row.grnReference, row.supplier, row.skuCode, row.productName, row.batchNumber].join(' ').toLowerCase().includes(needle));

	const summary = items.reduce((acc, row) => {
		acc.totalLines += 1;
		acc.totalQuantity += row.quantity;
		acc.totalCostValue += row.costPrice * row.quantity;
		acc.totalSellingValue += row.sellingPrice * row.quantity;
		return acc;
	}, { totalLines: 0, totalQuantity: 0, totalCostValue: 0, totalSellingValue: 0 });

	return { items, total: items.length, page, pageSize, totalPages: Math.ceil(items.length / pageSize), summary };
}

export async function getProfitLossReport(filters: CommonReportFilters) {
	const eventData = await getInventoryEventRows([InventoryEventType.SALE_DEDUCTED], filters);
	const items = eventData.rows;
	const summary = items.reduce((acc, row) => {
		acc.totalQuantity += row.quantity;
		acc.totalRevenue += row.revenue;
		acc.totalCost += row.cost;
		acc.grossProfit += row.grossProfit;
		return acc;
	}, { totalQuantity: 0, totalRevenue: 0, totalCost: 0, grossProfit: 0 });
	return {
		items,
		total: eventData.total,
		page: eventData.page,
		pageSize: eventData.pageSize,
		totalPages: Math.ceil(eventData.total / eventData.pageSize),
		summary: { ...summary, marginPercent: summary.totalRevenue ? (summary.grossProfit / summary.totalRevenue) * 100 : 0 },
	};
}

export async function getSalesEventReport(filters: CommonReportFilters, options: { cardOnly?: boolean; receiptsOnly?: boolean; exchangeOnly?: boolean; returnsOnly?: boolean } = {}) {
	const eventTypes = options.returnsOnly ? [InventoryEventType.RETURN_RECEIVED] : [InventoryEventType.SALE_DEDUCTED];
	const eventData = await getInventoryEventRows(eventTypes, filters, options);
	const items = eventData.rows;
	const summary = items.reduce((acc, row) => {
		acc.totalRows += 1;
		acc.totalQuantity += row.quantity;
		acc.totalRevenue += row.revenue;
		return acc;
	}, { totalRows: 0, totalQuantity: 0, totalRevenue: 0 });
	return {
		items,
		total: eventData.total,
		page: eventData.page,
		pageSize: eventData.pageSize,
		totalPages: Math.ceil(eventData.total / eventData.pageSize),
		summary,
	};
}

export async function getSalesAggregateReport(filters: CommonReportFilters, sort: 'top' | 'slow' | 'summary' = 'summary') {
	const eventData = await getInventoryEventRows([InventoryEventType.SALE_DEDUCTED], { ...filters, page: 1, pageSize: 10000 });
	const groupBy = filters.groupBy ?? 'product';
	const groups = new Map<string, any>();

	for (const row of eventData.rows) {
		const key = groupBy === 'category'
			? (row.category || 'Uncategorized')
			: groupBy === 'department'
				? (row.department || 'Unassigned')
				: (row.skuCode || row.productName || row.reference);
		if (!groups.has(key)) {
			groups.set(key, {
				group: key,
				groupBy,
				skuCode: groupBy === 'product' ? row.skuCode : '',
				productName: groupBy === 'product' ? row.productName : '',
				category: row.category,
				quantity: 0,
				revenue: 0,
				cost: 0,
				grossProfit: 0,
				transactionCount: 0,
			});
		}
		const group = groups.get(key);
		group.quantity += row.quantity;
		group.revenue += row.revenue;
		group.cost += row.cost;
		group.grossProfit += row.grossProfit;
		group.transactionCount += 1;
	}

	let items = Array.from(groups.values());
	if (sort === 'top') items = items.sort((a, b) => b.quantity - a.quantity);
	if (sort === 'slow') items = items.sort((a, b) => a.quantity - b.quantity);
	const page = filters.page ?? 1;
	const pageSize = filters.pageSize ?? 50;
	const start = (page - 1) * pageSize;
	const pagedItems = items.slice(start, start + pageSize);
	const summary = items.reduce((acc, row) => {
		acc.totalGroups += 1;
		acc.totalQuantity += row.quantity;
		acc.totalRevenue += row.revenue;
		acc.grossProfit += row.grossProfit;
		return acc;
	}, { totalGroups: 0, totalQuantity: 0, totalRevenue: 0, grossProfit: 0 });

	return { items: pagedItems, total: items.length, page, pageSize, totalPages: Math.ceil(items.length / pageSize), summary };
}

const purchaseOrderSourceRequirement: SourceRequirement = {
	module: 'purchase order',
	tables: ['purchase_orders', 'purchase_order_lines'],
	requiredFields: [
		'referenceNumber',
		'supplierId',
		'status',
		'orderDate',
		'expectedDeliveryDate',
		'createdBy',
		'skuId',
		'quantity',
		'unitCost',
	],
	relationships: ['supplier/vendor', 'creator/user', 'sku', 'variant', 'batch'],
	notes: ['A GRN is receipt-side data only; it cannot reliably stand in for a purchase order note.'],
};

const quotationSourceRequirement: SourceRequirement = {
	module: 'quotation',
	tables: ['quotations', 'quotation_lines'],
	requiredFields: [
		'referenceNumber',
		'supplierId',
		'status',
		'quotationDate',
		'validUntil',
		'createdBy',
		'skuId',
		'quantity',
		'quotedCost',
	],
	relationships: ['supplier/vendor', 'creator/user', 'sku', 'variant', 'batch'],
	notes: ['No quotation model, route, or Prisma relation exists in the current codebase.'],
};

export async function getPaidInOutReport(filters: CommonReportFilters) {
	const { fromDate, toDate, status, search } = filters;
	const where: any = {
		OR: [
			{ eventType: { in: ['PAID_IN', 'PAID_OUT', 'CASH_IN', 'CASH_OUT', 'POS_PAID_IN', 'POS_PAID_OUT', 'POS_CASH_IN', 'POS_CASH_OUT'] } },
			{ reasonCode: { contains: 'paid', mode: 'insensitive' } },
			{ reasonCode: { contains: 'cash', mode: 'insensitive' } },
		],
	};
	addDateRange(where, 'timestamp', fromDate, toDate);

	const events = await prisma.inventoryEvent.findMany({
		where,
		take: 10000,
		orderBy: { timestamp: 'desc' },
		include: { user: { select: { id: true, email: true, role: true } } },
	});

	const needle = normalizeSearch(search)?.toLowerCase();
	const rows = events.map((event) => {
		const metadata = metadataRecord(event.metadata);
		const typeText = stringFrom(metadata.direction, metadata.type, metadata.transactionType, metadata.cashMovementType, event.eventType, event.reasonCode);
		const signedAmount = numberFrom(metadata.amount, metadata.cashAmount, metadata.value, metadata.totalAmount, event.quantityDelta);
		const direction = /out|withdraw|expense|payout|paid[-_ ]?out/i.test(typeText)
			? 'Out'
			: /in|deposit|income|payin|paid[-_ ]?in/i.test(typeText)
				? 'In'
				: signedAmount < 0 ? 'Out' : 'In';
		return {
			id: event.id,
			date: event.timestamp,
			reference: stringFrom(metadata.reference, metadata.receiptNumber, metadata.receiptNo, metadata.posReference, event.parentEntityId, event.id),
			status: stringFrom(metadata.status, direction),
			direction,
			unit: stringFrom(metadata.unit, metadata.posUnit, event.terminalId),
			terminalId: stringFrom(event.terminalId, metadata.terminalId),
			reason: stringFrom(metadata.reason, event.reasonCode),
			description: stringFrom(metadata.description, metadata.notes, metadata.memo),
			amount: Math.abs(signedAmount),
			user: event.user,
			metadata,
		};
	}).filter((row) => {
		if (status && row.status.toLowerCase() !== status.toLowerCase() && row.direction.toLowerCase() !== status.toLowerCase()) return false;
		if (!needle) return true;
		return [row.reference, row.status, row.direction, row.unit, row.terminalId, row.reason, row.description, row.user?.email].join(' ').toLowerCase().includes(needle);
	});

	const summary = rows.reduce((acc, row) => {
		acc.totalRows += 1;
		if (row.direction === 'Out') acc.totalPaidOut += row.amount;
		else acc.totalPaidIn += row.amount;
		acc.netCashMovement = acc.totalPaidIn - acc.totalPaidOut;
		return acc;
	}, { sourceStatus: 'Derived from inventory_events cash movement events', totalRows: 0, totalPaidIn: 0, totalPaidOut: 0, netCashMovement: 0 });

	const paged = paginateRows(rows, filters);
	return {
		...paged,
		summary,
		notice: rows.length === 0
			? 'No paid-in/out rows were found in inventory_events. For full live data, connect a POS cash movement table/module or write PAID_IN/PAID_OUT events with amount, direction, POS unit, reference, reason, and user metadata.'
			: undefined,
	};
}

export async function getSalesmenCommissionReport(filters: CommonReportFilters) {
	const eventData = await getInventoryEventRows([InventoryEventType.SALE_DEDUCTED], { ...filters, page: 1, pageSize: 10000 });
	const groups = new Map<string, any>();
	const needle = normalizeSearch(filters.search)?.toLowerCase();

	for (const row of eventData.rows) {
		const metadata = metadataRecord(row.metadata);
		const salesman = stringFrom(row.salesman, metadata.salesmanId, metadata.salesPersonId, 'Unassigned');
		if (needle && ![salesman, row.reference, row.receiptNumber, row.productName, row.skuCode].join(' ').toLowerCase().includes(needle)) continue;
		const commissionRate = numberFrom(metadata.commissionRate, metadata.commissionPercent, metadata.salesmanCommissionRate);
		const commissionAmount = numberFrom(metadata.commissionAmount, metadata.salesmanCommissionAmount, commissionRate ? (row.revenue * commissionRate) / 100 : 0);
		if (!groups.has(salesman)) {
			groups.set(salesman, {
				id: salesman,
				salesman,
				transactionCount: 0,
				quantity: 0,
				revenue: 0,
				grossProfit: 0,
				commissionableAmount: 0,
				commissionAmount: 0,
				commissionRate,
			});
		}
		const group = groups.get(salesman);
		group.transactionCount += 1;
		group.quantity += row.quantity;
		group.revenue += row.revenue;
		group.grossProfit += row.grossProfit;
		group.commissionableAmount += numberFrom(metadata.commissionableAmount, row.revenue);
		group.commissionAmount += commissionAmount;
		if (!group.commissionRate && commissionRate) group.commissionRate = commissionRate;
	}

	const rows = Array.from(groups.values()).map((row) => ({
		...row,
		effectiveCommissionRate: row.commissionableAmount ? (row.commissionAmount / row.commissionableAmount) * 100 : row.commissionRate,
	})).sort((a, b) => b.commissionAmount - a.commissionAmount || b.revenue - a.revenue);

	const summary = rows.reduce((acc, row) => {
		acc.totalSalesmen += 1;
		acc.totalTransactions += row.transactionCount;
		acc.totalRevenue += row.revenue;
		acc.totalCommission += row.commissionAmount;
		return acc;
	}, { sourceStatus: 'Derived from SALE_DEDUCTED inventory_events metadata', totalSalesmen: 0, totalTransactions: 0, totalRevenue: 0, totalCommission: 0 });

	const paged = paginateRows(rows, filters);
	return {
		...paged,
		summary,
		notice: rows.length === 0
			? 'No sales rows were found for commission reporting. For full live commissions, connect a salesman commission policy/table or write commissionRate/commissionAmount and salesman metadata on SALE_DEDUCTED events.'
			: undefined,
	};
}

export async function getAdvancedReceiptsReport(filters: CommonReportFilters) {
	const { fromDate, toDate, status, search } = filters;
	const where: any = {
		OR: [
			{ eventType: { in: ['ADVANCE_RECEIPT', 'ADVANCED_RECEIPT', 'POS_ADVANCE_RECEIPT', 'ADVANCE_PAYMENT', 'RECEIPT_RECALLED'] } },
			{ eventType: InventoryEventType.SALE_DEDUCTED },
			{ reasonCode: { contains: 'advance', mode: 'insensitive' } },
			{ reasonCode: { contains: 'receipt', mode: 'insensitive' } },
		],
	};
	addDateRange(where, 'timestamp', fromDate, toDate);

	const events = await prisma.inventoryEvent.findMany({
		where,
		take: 10000,
		orderBy: { timestamp: 'desc' },
		include: { user: { select: { id: true, email: true, role: true } } },
	});

	const needle = normalizeSearch(search)?.toLowerCase();
	const rows = events.map((event) => {
		const metadata = metadataRecord(event.metadata);
		const advanceAmount = numberFrom(metadata.advanceAmount, metadata.advancedAmount, metadata.depositAmount, metadata.amount, metadata.totalAmount);
		const isAdvanceReceipt = Boolean(
			metadata.isAdvanceReceipt
			|| metadata.advanceReceipt
			|| metadata.advancedReceipt
			|| metadata.advanceAmount
			|| metadata.depositAmount
			|| /advance/i.test(`${event.eventType} ${event.reasonCode ?? ''}`)
		);
		if (!isAdvanceReceipt) return null;
		const statusText = metadata.recalled
			? 'Recalled'
			: stringFrom(metadata.status, metadata.receiptStatus, metadata.pending ? 'Pending' : '', /recalled/i.test(event.eventType) ? 'Recalled' : 'Issued');
		return {
			id: event.id,
			date: event.timestamp,
			reference: stringFrom(metadata.reference, metadata.posReference, metadata.receiptNumber, metadata.receiptNo, event.parentEntityId, event.id),
			receiptNumber: stringFrom(metadata.receiptNumber, metadata.receiptNo),
			status: statusText,
			customer: stringFrom(metadata.customerName, metadata.customer, metadata.customerId),
			unit: stringFrom(metadata.unit, metadata.posUnit, event.terminalId),
			terminalId: stringFrom(event.terminalId, metadata.terminalId),
			amount: advanceAmount,
			balanceAmount: numberFrom(metadata.balanceAmount, metadata.remainingAmount, metadata.pendingAmount),
			recalledAt: metadata.recalledAt ?? null,
			user: event.user,
			metadata,
		};
	}).filter((row): row is NonNullable<typeof row> => {
		if (!row) return false;
		if (status && !['all', 'any'].includes(status.toLowerCase()) && row.status.toLowerCase() !== status.toLowerCase()) return false;
		if (!needle) return true;
		return [row.reference, row.receiptNumber, row.status, row.customer, row.unit, row.terminalId, row.user?.email].join(' ').toLowerCase().includes(needle);
	});

	const summary = rows.reduce((acc, row) => {
		acc.totalReceipts += 1;
		acc.totalAdvanceAmount += row.amount;
		acc.totalBalanceAmount += row.balanceAmount;
		if (row.status.toLowerCase() === 'pending') acc.pending += 1;
		if (row.status.toLowerCase() === 'recalled') acc.recalled += 1;
		return acc;
	}, { sourceStatus: 'Derived from inventory_events advance receipt metadata', totalReceipts: 0, pending: 0, recalled: 0, totalAdvanceAmount: 0, totalBalanceAmount: 0 });

	const paged = paginateRows(rows, filters);
	return {
		...paged,
		summary,
		notice: rows.length === 0
			? 'No advanced receipt rows were found in inventory_events. For full live data, connect a POS advance receipt table/module or write advance receipt events with receipt number, status, customer, amount, balance, POS unit, and recalled metadata.'
			: undefined,
	};
}

export async function getCreditorsDebtorsReport(filters: CommonReportFilters) {
	const { supplierId, fromDate, toDate, search } = filters;
	const where: any = {};
	if (supplierId) where.supplierId = supplierId;
	addDateRange(where, 'createdAt', fromDate, toDate);

	const [grns, prns] = await Promise.all([
		prisma.gRN.findMany({
			where,
			include: {
				supplier: { select: { id: true, name: true, paymentTerms: true } },
				lines: { include: { batch: true, sku: true } },
			},
		}),
		prisma.pRN.findMany({
			where,
			include: {
				supplier: { select: { id: true, name: true, paymentTerms: true } },
				lines: { include: { batch: true, sku: true } },
			},
		}),
	]);

	const bySupplier = new Map<string, any>();
	const ensureSupplier = (supplier: any) => {
		if (!bySupplier.has(supplier.id)) {
			bySupplier.set(supplier.id, {
				supplierId: supplier.id,
				supplier: supplier.name,
				paymentTerms: supplier.paymentTerms ?? '',
				creditAmount: 0,
				settlementAmount: 0,
				outstandingAmount: 0,
				grnCount: 0,
				prnCount: 0,
			});
		}
		return bySupplier.get(supplier.id);
	};

	for (const grn of grns) {
		const row = ensureSupplier(grn.supplier);
		row.grnCount += 1;
		row.creditAmount += grn.lines.reduce((sum, line) => sum + (line.receivedQuantity * (line.costPrice ?? line.batch?.costPrice ?? line.sku.costPrice ?? 0)), 0);
	}

	for (const prn of prns) {
		const row = ensureSupplier(prn.supplier);
		row.prnCount += 1;
		row.settlementAmount += prn.lines.reduce((sum, line) => sum + (line.pickedUpQuantity * (line.batch?.costPrice ?? line.sku.costPrice ?? 0)), 0);
	}

	let items = Array.from(bySupplier.values()).map((row) => ({
		...row,
		outstandingAmount: row.creditAmount - row.settlementAmount,
	}));

	const needle = normalizeSearch(search)?.toLowerCase();
	if (needle) items = items.filter((row) => [row.supplier, row.paymentTerms].join(' ').toLowerCase().includes(needle));

	const summary = items.reduce((acc, row) => {
		acc.totalCredit += row.creditAmount;
		acc.totalSettlement += row.settlementAmount;
		acc.totalOutstanding += row.outstandingAmount;
		return acc;
	}, { totalCredit: 0, totalSettlement: 0, totalOutstanding: 0 });

	const page = filters.page ?? 1;
	const pageSize = filters.pageSize ?? 50;
	const start = (page - 1) * pageSize;
	return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize, totalPages: Math.ceil(items.length / pageSize), summary };
}

export async function getGenericReport(reportId: string, filters: CommonReportFilters & { daysToExpiry?: number }) {
	switch (reportId) {
		case 'purchase-order':
			return emptySourceReport('Purchase order note report', filters, purchaseOrderSourceRequirement);
		case 'quotation':
			return emptySourceReport('Quotation report', filters, quotationSourceRequirement);
		case 'sales-return':
			return getSalesEventReport(filters, { returnsOnly: true });
		case 'tog-product-wise':
			return getTOGProductWiseReport(filters);
		case 'stock-valuation':
			return getStockValuationReport(filters);
		case 'profit-loss':
			return getProfitLossReport(filters);
		case 'price-change':
			return getPriceChangeReport(filters);
		case 'reorder-level':
			return getReorderLevelReport(filters);
		case 'expiry-date':
			return getExpiryDateReport(filters);
		case 'creditors-debtors':
			return getCreditorsDebtorsReport(filters);
		case 'pos-sales':
			return getSalesEventReport(filters);
		case 'paid-in-out':
			return getPaidInOutReport(filters);
		case 'product-exchange':
			return getSalesEventReport(filters, { exchangeOnly: true });
		case 'credit-card-sales':
			return getSalesEventReport(filters, { cardOnly: true });
		case 'issued-receipts':
			return getSalesEventReport(filters, { receiptsOnly: true });
		case 'sales-summary-dimension':
			return getSalesAggregateReport(filters, 'summary');
		case 'slow-movement-sales':
			return getSalesAggregateReport(filters, 'slow');
		case 'top-sales':
			return getSalesAggregateReport(filters, 'top');
		case 'salesmen-commission':
			return getSalesmenCommissionReport(filters);
		case 'advanced-receipts':
			return getAdvancedReceiptsReport(filters);
		default:
			return emptySourceReport(reportId, filters);
	}
}
