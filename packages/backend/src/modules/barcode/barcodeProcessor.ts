import prisma from '../../prisma/client';

export interface BarcodeLookupResult {
  found: boolean;
  sku?: any;
  inventoryRecords?: any[];
  error?: string;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const sku = await prisma.sKU.findFirst({
    where: {
      OR: [
        { skuCode: barcode },
        { skuCode: { contains: barcode, mode: 'insensitive' } },
      ],
      isActive: true,
    },
    include: { vendor: { select: { id: true, name: true } } },
  });

  if (!sku) {
    return { found: false, error: `No SKU found for barcode: ${barcode}` };
  }

  const inventoryRecords = await prisma.inventoryRecord.findMany({
    where: { skuId: sku.id, quantity: { gt: 0 } },
    include: {
      location: true,
      user: { select: { email: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return { found: true, sku, inventoryRecords };
}

export async function processScan(
  barcode: string,
  userId: string,
  terminalId?: string
): Promise<BarcodeLookupResult & { scanRecorded: boolean }> {
  const result = await lookupBarcode(barcode);

  await prisma.inventoryEvent.create({
    data: {
      eventType: 'STATE_CHANGE',
      reasonCode: 'BARCODE_SCAN',
      userId,
      terminalId,
      metadata: { barcode, found: result.found } as any,
    },
  });

  return { ...result, scanRecorded: true };
}
