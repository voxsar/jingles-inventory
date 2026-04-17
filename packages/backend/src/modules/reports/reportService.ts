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
    acc.totalQuantity += grn.lines.reduce((sum, line) => sum + line.orderedQty, 0);
    acc.totalAccepted += grn.lines.reduce((sum, line) => sum + (line.acceptedQty || 0), 0);
    acc.totalRejected += grn.lines.reduce((sum, line) => sum + (line.rejectedQty || 0), 0);

    // Calculate total cost
    grn.lines.forEach(line => {
      if (line.batch?.costPrice && line.acceptedQty) {
        acc.totalCost += line.batch.costPrice * line.acceptedQty;
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
    acc.totalQuantity += prn.lines.reduce((sum, line) => sum + line.returnQty, 0);

    // Calculate total cost
    prn.lines.forEach(line => {
      if (line.batch?.costPrice && line.returnQty) {
        acc.totalCost += line.batch.costPrice * line.returnQty;
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
