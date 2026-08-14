import prisma from '../../prisma/client';
import { InventoryEventType } from '@jingles/shared';
import { ensurePosCloudSchema, getLegacyTableRows } from '../../services/posCloud';
import { isLocalReplicaMode } from '../../utils/runtimePaths';

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

	const localPage = isLocalReplicaMode()
		? await getLocalGRNReportPage({ fromDate, toDate, supplierId, status, branchId, skip, pageSize })
		: null;

	const [items, total] = await Promise.all([
		localPage ? Promise.resolve(localPage.items) : prisma.gRN.findMany({
				where,
				skip,
				take: pageSize,
				orderBy: { createdAt: 'desc' },
				include: grnReportInclude,
			}),
		localPage ? Promise.resolve(localPage.total) : prisma.gRN.count({ where }),
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
			const unitCost = line.costPrice ?? line.batch?.costPrice ?? 0;
			if (unitCost && line.receivedQuantity) {
				acc.totalCost += unitCost * line.receivedQuantity;
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

const grnReportInclude = {
	supplier: { select: { id: true, name: true, contactEmail: true } },
	floor: { include: { branch: { select: { id: true, name: true, code: true, address: true, phone: true } } } },
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
			batch: { select: { id: true, batchNumber: true, costPrice: true, sellingPrice: true } },
		},
	},
};

async function getLocalGRNReportPage(filters: {
	fromDate?: Date;
	toDate?: Date;
	supplierId?: string;
	status?: string;
	branchId?: string;
	skip: number;
	pageSize: number;
}) {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (filters.supplierId) {
		clauses.push('supplier_id = ?');
		params.push(filters.supplierId);
	}
	if (filters.status) {
		clauses.push('status = ?');
		params.push(filters.status);
	}
	if (filters.branchId) {
		clauses.push('floor_id IN (SELECT id FROM floors WHERE branch_id = ?)');
		params.push(filters.branchId);
	}
	if (filters.fromDate) {
		clauses.push('datetime(created_at) >= datetime(?)');
		params.push(filters.fromDate.toISOString());
	}
	if (filters.toDate) {
		clauses.push('datetime(created_at) <= datetime(?)');
		params.push(filters.toDate.toISOString());
	}

	const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
	const idRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
		`SELECT id FROM grns ${whereSql} ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
		...params,
		filters.pageSize,
		filters.skip
	);
	const countRows = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(
		`SELECT COUNT(*) AS total FROM grns ${whereSql}`,
		...params
	);
	const ids = idRows.map((row) => row.id);
	if (ids.length === 0) {
		return { items: [], total: Number(countRows[0]?.total ?? 0) };
	}

	const order = new Map(ids.map((id, index) => [id, index]));
	const items = await prisma.gRN.findMany({
		where: { id: { in: ids } },
		include: grnReportInclude,
	});

	items.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));

	return {
		items,
		total: Number(countRows[0]?.total ?? 0),
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

const getPosTransactionRows = async (
	filters: CommonReportFilters,
	options: { cardOnly?: boolean; returnsOnly?: boolean } = {},
) => {
	await ensurePosCloudSchema();
	const params: unknown[] = [];
	const clauses: string[] = [];
	if (filters.fromDate) { params.push(filters.fromDate); clauses.push(`created_at >= $${params.length}`); }
	if (filters.toDate) { params.push(filters.toDate); clauses.push(`created_at <= $${params.length}`); }
	if (filters.branchId && !options.returnsOnly) { params.push(filters.branchId); clauses.push(`branch_id = $${params.length}`); }
	const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
	const sales = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM pos_sales ${where} ORDER BY created_at DESC`, ...params);
	const branchRows = await prisma.branch.findMany({ select: { id: true, name: true } });
	const branchMap = new Map(branchRows.map((branch) => [branch.id, branch.name]));
	const skuIds = Array.from(new Set(sales.flatMap((sale) => (Array.isArray(sale.lines) ? sale.lines : []).map((line: any) => line.productId)).filter(Boolean))) as string[];
	const skus = skuIds.length ? await prisma.sKU.findMany({ where: { id: { in: skuIds } }, include: { category: true } }) : [];
	const skuMap = new Map(skus.map((sku) => [sku.id, sku]));
	const saleMap = new Map(sales.map((sale) => [sale.id, sale]));
	let source: Array<{ sale: any; returnRow?: any }> = sales.map((sale) => ({ sale }));
	if (options.returnsOnly) {
		const returnClauses: string[] = [];
		const returnParams: unknown[] = [];
		if (filters.fromDate) { returnParams.push(filters.fromDate); returnClauses.push(`created_at >= $${returnParams.length}`); }
		if (filters.toDate) { returnParams.push(filters.toDate); returnClauses.push(`created_at <= $${returnParams.length}`); }
		const returns = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM pos_returns ${returnClauses.length ? `WHERE ${returnClauses.join(' AND ')}` : ''} ORDER BY created_at DESC`, ...returnParams);
		for (const row of returns) if (!saleMap.has(row.sale_id)) {
			const linked = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM pos_sales WHERE id=$1`, row.sale_id);
			if (linked[0]) saleMap.set(linked[0].id, linked[0]);
		}
		source = returns.map((returnRow) => ({ sale: saleMap.get(returnRow.sale_id), returnRow })).filter((entry) => entry.sale);
	}
	const rows: any[] = [];
	for (const entry of source) {
		const sale = entry.sale;
		const payments = Array.isArray(sale.payments) ? sale.payments : [];
		if (options.cardOnly && !payments.some((payment: any) => ['VISA', 'MASTER', 'AMEX'].includes(payment.method))) continue;
		const saleLines = Array.isArray(sale.lines) ? sale.lines : [];
		const lines = entry.returnRow && Array.isArray(entry.returnRow.lines) ? entry.returnRow.lines : saleLines;
		for (const line of lines) {
			const original = entry.returnRow
				? saleLines.find((candidate: any) => candidate.id === line.saleLineId || (candidate.productId === line.productId && candidate.variantId === line.variantId))
				: line;
			const skuId = line.productId ?? original?.productId ?? '';
			if (filters.skuId && skuId !== filters.skuId) continue;
			const sku = skuMap.get(skuId);
			const quantity = numberFrom(line.quantity);
			const unitPrice = numberFrom(original?.unitPrice);
			const unitCost = numberFrom(original?.costBasis);
			const revenue = entry.returnRow ? -(unitPrice * quantity) : numberFrom(original?.lineTotal, unitPrice * quantity);
			const cost = (entry.returnRow ? -1 : 1) * unitCost * quantity;
			rows.push({
				id: `${entry.returnRow?.id ?? sale.id}-${line.id ?? skuId}`,
				date: entry.returnRow?.created_at ?? sale.created_at,
				eventType: entry.returnRow ? 'RETURNED' : 'SALE_DEDUCTED', reference: sale.receipt_number,
				receiptNumber: sale.receipt_number, terminalId: sale.terminal_id, unit: sale.terminal_id,
				skuId, skuCode: original?.sku ?? sku?.skuCode ?? '', productName: original?.name ?? sku?.name ?? '',
				category: sku?.category?.name ?? '', department: sku?.category?.name ?? '', branch: branchMap.get(sale.branch_id) ?? '',
				branchId: sale.branch_id ?? '', floorId: '', salesman: original?.salespersonName ?? sale.user_id,
				paymentMethod: payments.map((payment: any) => payment.method).join(', '), cardType: payments.find((payment: any) => ['VISA','MASTER','AMEX'].includes(payment.method))?.method ?? '',
				quantity, unitCost, unitPrice, cost, revenue, grossProfit: revenue - cost,
				marginPercent: revenue ? ((revenue - cost) / revenue) * 100 : 0,
				reasonCode: entry.returnRow?.reason ?? '', user: { id: sale.user_id },
			});
		}
	}
	const needle = normalizeSearch(filters.search)?.toLowerCase();
	const filtered = rows.filter((row) => (!filters.branchId || row.branchId === filters.branchId) && (!needle || [row.receiptNumber,row.skuCode,row.productName,row.salesman].join(' ').toLowerCase().includes(needle)));
	return { rows: filtered, ...paginateRows(filtered, filters) };
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
		grnId: line.grnId,
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
	const posData = await getPosTransactionRows(filters);
	const eventData = posData.total > 0 ? posData : await getInventoryEventRows([InventoryEventType.SALE_DEDUCTED], filters);
	const items = 'items' in eventData ? eventData.items : eventData.rows;
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
	const posData = await getPosTransactionRows(filters, options);
	const eventData = posData.total > 0 ? posData : await getInventoryEventRows(eventTypes, filters, options);
	const items = 'items' in eventData ? eventData.items : eventData.rows;
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

export async function getZReadingReport(filters: CommonReportFilters) {
	await ensurePosCloudSchema();
	const params: unknown[] = [];
	const clauses: string[] = [];
	// A Z slot is selected by its close boundary. The currently open slot falls
	// back to its opening time until it receives a close boundary.
	if (filters.fromDate) { params.push(filters.fromDate); clauses.push(`COALESCE(closed_at, opened_at) >= $${params.length}`); }
	if (filters.toDate) { params.push(filters.toDate); clauses.push(`COALESCE(closed_at, opened_at) <= $${params.length}`); }
	if (filters.branchId) { params.push(filters.branchId); clauses.push(`branch_id = $${params.length}`); }
	if (filters.status) { params.push(filters.status.toUpperCase()); clauses.push(`status = $${params.length}`); }
	const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
	const shifts = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM pos_shifts ${where} ORDER BY COALESCE(closed_at, opened_at) DESC`, ...params);
	if (shifts.length === 0) return { ...paginateRows([], filters), summary: { totalSlots: 0, grossSale: 0, netSale: 0 } };

	const shiftIds = shifts.map((shift) => shift.id);
	const sales = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM pos_sales WHERE shift_id = ANY($1::text[]) ORDER BY created_at`, shiftIds);
	const returns = await prisma.$queryRawUnsafe<any[]>(`
		SELECT r.*, s.shift_id FROM pos_returns r
		INNER JOIN pos_sales s ON s.id = r.sale_id
		WHERE s.shift_id = ANY($1::text[])
	`, shiftIds);
	const collections = await prisma.$queryRawUnsafe<any[]>(`
		SELECT p.*, c.name AS customer_name
		FROM pos_credit_payments p
		LEFT JOIN pos_customers c ON c.id = p.customer_id
		WHERE p.shift_id = ANY($1::text[])
		ORDER BY p.created_at
	`, shiftIds);
	const [branches, users] = await Promise.all([
		prisma.branch.findMany({ select: { id: true, name: true, code: true } }),
		prisma.user.findMany({ select: { id: true, email: true } }),
	]);
	const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
	const userMap = new Map(users.map((user) => [user.id, user.email]));
	const salesByShift = new Map<string, any[]>();
	const refundsByShift = new Map<string, number>();
	const collectionsByShift = new Map<string, any[]>();
	for (const sale of sales) salesByShift.set(sale.shift_id, [...(salesByShift.get(sale.shift_id) ?? []), sale]);
	for (const row of returns) refundsByShift.set(row.shift_id, (refundsByShift.get(row.shift_id) ?? 0) + numberFrom(row.total_refund));
	for (const row of collections) collectionsByShift.set(row.shift_id, [...(collectionsByShift.get(row.shift_id) ?? []), row]);
	const customerIds = [...new Set(sales.map((sale) => sale.customer_id).filter(Boolean))];
	const customers = customerIds.length > 0
		? await prisma.$queryRawUnsafe<any[]>(`SELECT id, name FROM pos_customers WHERE id = ANY($1::text[])`, customerIds)
		: [];
	const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));

	let rows = shifts.map((shift) => {
		const shiftSales = salesByShift.get(shift.id) ?? [];
		const paymentBreakdown: Record<string, number> = {};
		const paymentCounts: Record<string, number> = {};
		let productCount = 0;
		let discountedLineCount = 0;
		const paymentDetails: any[] = [];
		const customerCreditSales: any[] = [];
		for (const sale of shiftSales) {
			const payments = Array.isArray(sale.payments) ? sale.payments : [];
			for (const payment of payments) {
				const method = stringFrom(payment.method, 'OTHER').toUpperCase();
				paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + numberFrom(payment.amount);
				paymentCounts[method] = (paymentCounts[method] ?? 0) + 1;
				if (method === 'CREDIT') {
					customerCreditSales.push({
						saleId: sale.id,
						receiptNumber: sale.receipt_number,
						customerId: sale.customer_id ?? undefined,
						customerName: customerMap.get(sale.customer_id) ?? 'Walk-in customer',
						amount: numberFrom(payment.amount),
						createdAt: sale.created_at,
					});
				}
				if (method === 'CHEQUE' || method === 'BANK_TRANSFER') {
					const metadata = metadataRecord(payment.metadata);
					paymentDetails.push({
						saleId: sale.id,
						receiptNumber: sale.receipt_number,
						customerId: sale.customer_id ?? undefined,
						customerName: customerMap.get(sale.customer_id),
						method,
						amount: numberFrom(payment.amount),
						reference: stringFrom(payment.reference),
						bankName: stringFrom(metadata.bankName, metadata.originatingBank),
						origin: stringFrom(metadata.origin),
						reason: stringFrom(metadata.reason),
						createdAt: sale.created_at,
					});
				}
			}
			const lines = Array.isArray(sale.lines) ? sale.lines : [];
			for (const line of lines) {
				productCount += numberFrom(line.quantity);
				if (numberFrom(line.discountAmount, line.discountPercent) > 0) discountedLineCount += 1;
			}
		}
		const grossSale = shiftSales.reduce((sum, sale) => sum + numberFrom(sale.subtotal), 0);
		const discounts = shiftSales.reduce((sum, sale) => sum + numberFrom(sale.discount_total), 0);
		const refunds = refundsByShift.get(shift.id) ?? 0;
		const netSale = shiftSales.reduce((sum, sale) => sum + numberFrom(sale.total), 0) - refunds;
		const cashSale = paymentBreakdown.CASH ?? 0;
		const nonCashTotal = Object.entries(paymentBreakdown).filter(([method]) => method !== 'CASH').reduce((sum, [, amount]) => sum + amount, 0);
		const expectedDrawer = numberFrom(shift.opening_float) + cashSale - refunds;
		const declaredAmount = shift.closing_float == null ? null : numberFrom(shift.closing_float);
		const branch = branchMap.get(shift.branch_id);
		const customerCollections = (collectionsByShift.get(shift.id) ?? []).map((payment) => ({
			paymentId: payment.id,
			customerId: payment.customer_id,
			customerName: payment.customer_name ?? payment.customer_id,
			amount: numberFrom(payment.amount),
			method: payment.method,
			note: payment.note ?? undefined,
			userName: userMap.get(payment.user_id),
			createdAt: payment.created_at,
		}));
		return {
			id: shift.id, shiftId: shift.id, unit: shift.terminal_id, terminalId: shift.terminal_id,
			branchId: shift.branch_id ?? '', branch: branch?.name ?? shift.branch_id ?? '', branchCode: branch?.code ?? '',
			cashier: userMap.get(shift.user_id) ?? shift.user_id, status: shift.status,
			slotOpenedAt: shift.opened_at, slotClosedAt: shift.closed_at,
			openedAt: shift.opened_at, closedAt: shift.closed_at, grossSale, discounts, discountedLineCount,
			refunds, netSale, billCount: shiftSales.length, productCount, paymentBreakdown, paymentCounts,
			cashSale, nonCashTotal, openingFloat: numberFrom(shift.opening_float), expectedDrawer,
			declaredAmount, cashExcess: declaredAmount == null ? null : declaredAmount - expectedDrawer,
			paymentDetails, customerCreditSales, customerCollections,
		};
	});
	const needle = normalizeSearch(filters.search)?.toLowerCase();
	if (needle) rows = rows.filter((row) => [row.shiftId, row.unit, row.branch, row.cashier, row.status].join(' ').toLowerCase().includes(needle));
	const paged = paginateRows(rows, filters);
	const summary = rows.reduce((acc, row) => {
		acc.totalSlots += 1; acc.grossSale += row.grossSale; acc.netSale += row.netSale; acc.refunds += row.refunds;
		return acc;
	}, { totalSlots: 0, grossSale: 0, netSale: 0, refunds: 0 });
	return { ...paged, summary };
}

export async function getSalesAggregateReport(filters: CommonReportFilters, sort: 'top' | 'slow' | 'summary' = 'summary') {
	const aggregateFilters = { ...filters, page: 1, pageSize: 10000 };
	const posData = await getPosTransactionRows(aggregateFilters);
	const eventData = posData.total > 0 ? { rows: posData.rows } : await getInventoryEventRows([InventoryEventType.SALE_DEDUCTED], aggregateFilters);
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

async function getLegacyDocumentReport(
	kind: 'purchase-order' | 'quotation',
	filters: CommonReportFilters,
) {
	const isPurchaseOrder = kind === 'purchase-order';
	const tables = isPurchaseOrder
		? ['purchaseheader', 'purchasedetail', 'supplier', 'product']
		: ['invoiceheader', 'invoicedetail', 'customer', 'product'];
	const archived = await getLegacyTableRows(tables);
	const headers = archived[isPurchaseOrder ? 'purchaseheader' : 'invoiceheader'] ?? [];
	const details = archived[isPurchaseOrder ? 'purchasedetail' : 'invoicedetail'] ?? [];
	const parties = archived[isPurchaseOrder ? 'supplier' : 'customer'] ?? [];
	const products = archived.product ?? [];
	const expectedDocumentId = isPurchaseOrder ? 100 : 105;
	const headerIdField = isPurchaseOrder ? 'PurchaseHeaderID' : 'InvoiceHeaderID';
	const dateField = isPurchaseOrder ? 'PurchaseDate' : 'InvoiceDate';
	const partyIdField = isPurchaseOrder ? 'SupplierID' : 'CustomerID';
	const partyNameField = isPurchaseOrder ? 'SupplierName' : 'CustomerName';
	const partyLabel = isPurchaseOrder ? 'supplier' : 'customer';
	const partyNames = new Map(parties.map((row) => [String(row[partyIdField] ?? ''), stringFrom(row[partyNameField], row.Name)]));
	const productNames = new Map(products.map((row) => [String(row.ProductID ?? ''), {
		code: stringFrom(row.ProductCode, row.BarCode),
		name: stringFrom(row.ProductName, row.Name),
	}]));
	const detailsByHeader = new Map<string, any[]>();
	for (const detail of details) {
		const headerId = String(detail[headerIdField] ?? '');
		if (!headerId || Number(detail.DocumentID) !== expectedDocumentId) continue;
		const grouped = detailsByHeader.get(headerId) ?? [];
		grouped.push(detail);
		detailsByHeader.set(headerId, grouped);
	}

	const fromTime = filters.fromDate?.getTime();
	const toTime = filters.toDate?.getTime();
	const needle = normalizeSearch(filters.search)?.toLowerCase();
	const rows = headers
		.filter((header) => Number(header.DocumentID) === expectedDocumentId)
		.flatMap((header) => {
			const headerId = String(header[headerIdField] ?? '');
			const documentDate = new Date(String(header[dateField] ?? header.CreatedDate ?? ''));
			const timestamp = documentDate.getTime();
			if (fromTime !== undefined && (!Number.isFinite(timestamp) || timestamp < fromTime)) return [];
			if (toTime !== undefined && (!Number.isFinite(timestamp) || timestamp > toTime)) return [];
			const rawStatus = numberFrom(header.Status);
			const status = rawStatus === 1 ? 'Completed' : rawStatus === 0 ? 'Draft' : `Status ${rawStatus}`;
			if (filters.status && status.toLowerCase() !== filters.status.toLowerCase()) return [];
			const partyId = String(header[partyIdField] ?? '');
			const partyName = partyNames.get(partyId) || `${isPurchaseOrder ? 'Supplier' : 'Customer'} ${partyId}`;
			const reference = stringFrom(header.DocumentNo, header.ReferenceNo, headerId);
			return (detailsByHeader.get(headerId) ?? []).map((detail, index) => {
				const productId = String(detail.ProductID ?? '');
				const product = productNames.get(productId);
				const quantity = numberFrom(detail.Qty) + Math.max(numberFrom(detail.FreeQty), 0);
				const unitAmount = numberFrom(isPurchaseOrder ? detail.CostPrice : detail.SellingPrice, detail.UnitPrice);
				return {
					id: `${kind}:${headerId}:${stringFrom(detail[isPurchaseOrder ? 'PurchaseDetailID' : 'InvoiceDetailID'], index)}`,
					reference,
					status,
					[partyLabel]: partyName,
					supplier: partyName,
					skuCode: product?.code ?? productId,
					productName: product?.name ?? `Product ${productId}`,
					quantity,
					amount: numberFrom(detail.NetAmount, unitAmount * quantity),
					date: Number.isFinite(timestamp) ? documentDate : header.CreatedDate,
					legacyHeaderId: headerId,
					legacyDetailId: stringFrom(detail[isPurchaseOrder ? 'PurchaseDetailID' : 'InvoiceDetailID']),
				};
			});
		})
		.filter((row) => !needle || [row.reference, row.supplier, row.skuCode, row.productName].join(' ').toLowerCase().includes(needle));
	const paged = paginateRows(rows, filters);
	return {
		...paged,
		summary: {
			sourceStatus: 'Legacy MaxSoft archive',
			documents: new Set(rows.map((row) => row.legacyHeaderId)).size,
			lines: rows.length,
			totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
			totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
		},
		notice: headers.length === 0
			? `No ${kind === 'purchase-order' ? 'purchase order' : 'quotation'} rows have reached the lossless legacy archive yet.`
			: undefined,
	};
}

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
			return getLegacyDocumentReport('purchase-order', filters);
		case 'quotation':
			return getLegacyDocumentReport('quotation', filters);
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
		case 'z-reading':
			return getZReadingReport(filters);
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
