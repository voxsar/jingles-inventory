import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';

interface SkuValuation {
  skuId: string;
  skuCode: string;
  name: string;
  vendor: { id: string; name: string } | null;
  totalQuantity: number;
  byState: Record<string, number>;
}

export async function getInventoryValuation(vendorId?: string) {
  const where: Prisma.InventoryRecordWhereInput = { quantity: { gt: 0 } };
  if (vendorId) where.sku = { vendorId };

  const records = await prisma.inventoryRecord.findMany({
    where,
    include: {
      sku: {
        include: { vendor: { select: { id: true, name: true } } },
      },
      floor: true,
    },
  });

  const bySku = records.reduce<Record<string, SkuValuation>>((acc, record) => {
    const skuId = record.skuId;
    if (!acc[skuId]) {
      acc[skuId] = {
        skuId,
        skuCode: record.sku.skuCode,
        name: record.sku.name,
        vendor: record.sku.vendor,
        totalQuantity: 0,
        byState: {},
      };
    }
    acc[skuId].totalQuantity += record.quantity;
    acc[skuId].byState[record.state] = (acc[skuId].byState[record.state] ?? 0) + record.quantity;
    return acc;
  }, {});

  return Object.values(bySku);
}

export async function getFloorPerformance() {
  const floors = await prisma.floor.findMany({
    where: { isActive: true },
    include: {
      inventoryRecords: {
        where: { quantity: { gt: 0 } },
        include: { sku: true },
      },
    },
  });

  return floors.map((floor) => {
    const totalItems = floor.inventoryRecords.length;
    const totalQuantity = floor.inventoryRecords.reduce((sum, r) => sum + r.quantity, 0);
    const skuCount = new Set(floor.inventoryRecords.map((r) => r.skuId)).size;
    const stateBreakdown = floor.inventoryRecords.reduce<Record<string, number>>((acc, r) => {
      acc[r.state] = (acc[r.state] ?? 0) + r.quantity;
      return acc;
    }, {});

    return {
      floorId: floor.id,
      floorName: floor.name,
      floorCode: floor.code,
      totalItems,
      totalQuantity,
      skuCount,
      stateBreakdown,
    };
  });
}

export async function getSalesSummary(fromDate?: Date, toDate?: Date) {
  const where: Prisma.InventoryEventWhereInput = { eventType: 'SALE_DEDUCTED' };
  if (fromDate || toDate) {
    where.timestamp = {};
    if (fromDate) (where.timestamp as Prisma.DateTimeFilter).gte = fromDate;
    if (toDate) (where.timestamp as Prisma.DateTimeFilter).lte = toDate;
  }

  const events = await prisma.inventoryEvent.findMany({
    where,
    orderBy: { timestamp: 'desc' },
  });

  const totalSold = events.reduce((sum, e) => sum + Math.abs(e.quantityDelta ?? 0), 0);
  const totalTransactions = events.length;

  return { totalSold, totalTransactions, events };
}
