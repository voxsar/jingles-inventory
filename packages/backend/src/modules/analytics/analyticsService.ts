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
      location: true,
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
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    include: {
      inventoryRecords: {
        where: { quantity: { gt: 0 } },
        include: { sku: true },
      },
    },
  });

  const byFloor = locations.reduce((acc: Record<string, any>, loc: any) => {
    const floor = loc.floor;
    if (!acc[floor]) {
      acc[floor] = {
        floor,
        locationCount: 0,
        totalItems: 0,
        totalQuantity: 0,
        skuCount: new Set<string>(),
        stateBreakdown: {} as Record<string, number>,
      };
    }

    acc[floor].locationCount++;

    for (const record of loc.inventoryRecords) {
      acc[floor].totalItems++;
      acc[floor].totalQuantity += record.quantity;
      acc[floor].skuCount.add(record.skuId);
      acc[floor].stateBreakdown[record.state] =
        (acc[floor].stateBreakdown[record.state] ?? 0) + record.quantity;
    }

    return acc;
  }, {} as Record<string, any>);

  return (Object.values(byFloor) as Array<{ floor: string; locationCount: number; totalItems: number; totalQuantity: number; skuCount: Set<string>; stateBreakdown: Record<string, number> }>).map(f => ({
    ...f,
    skuCount: f.skuCount.size,
  }));
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
