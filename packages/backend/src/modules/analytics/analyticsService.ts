import prisma from '../../prisma/client';

export async function getInventoryValuation(vendorId?: string) {
  const where: any = { quantity: { gt: 0 } };
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

  const bySku = records.reduce((acc: Record<string, any>, record: any) => {
    const skuId = record.skuId;
    if (!acc[skuId]) {
      acc[skuId] = {
        skuId,
        skuCode: record.sku.skuCode,
        name: record.sku.name,
        vendor: record.sku.vendor,
        totalQuantity: 0,
        byState: {} as Record<string, number>,
      };
    }
    acc[skuId].totalQuantity += record.quantity;
    acc[skuId].byState[record.state] = (acc[skuId].byState[record.state] ?? 0) + record.quantity;
    return acc;
  }, {} as Record<string, any>);

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

  return floors.map((floor: any) => {
    const totalItems = floor.inventoryRecords.length;
    const totalQuantity = floor.inventoryRecords.reduce((sum: number, r: any) => sum + r.quantity, 0);
    const skuCount = new Set(floor.inventoryRecords.map((r: any) => r.skuId)).size;
    const stateBreakdown = floor.inventoryRecords.reduce((acc: Record<string, number>, r: any) => {
      acc[r.state] = (acc[r.state] ?? 0) + r.quantity;
      return acc;
    }, {} as Record<string, number>);

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
  const where: any = { eventType: 'SALE_DEDUCTED' };
  if (fromDate || toDate) {
    where.timestamp = {};
    if (fromDate) where.timestamp.gte = fromDate;
    if (toDate) where.timestamp.lte = toDate;
  }

  const events = await prisma.inventoryEvent.findMany({
    where,
    orderBy: { timestamp: 'desc' },
  });

  const totalSold = events.reduce((sum: number, e: { quantityDelta: number | null }) => sum + Math.abs(e.quantityDelta ?? 0), 0);
  const totalTransactions = events.length;

  return { totalSold, totalTransactions, events };
}
