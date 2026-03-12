import { IDimensions } from '@jingles/shared';
import prisma from '../../prisma/client';

export function calculateVolume(dimensions: IDimensions): number {
  return dimensions.height * dimensions.width * dimensions.depth;
}

export function calculateCapacityUsage(
  usedVolume: number,
  totalCapacity: number
): number {
  if (totalCapacity <= 0) return 0;
  return Math.min((usedVolume / totalCapacity) * 100, 100);
}

export interface StackingValidation {
  canStack: boolean;
  reason?: string;
}

export function validateStacking(
  items: Array<{ isFragile: boolean; maxStackHeight?: number | null; dimensions?: IDimensions | null; weight?: number }>,
  newItem: { isFragile: boolean; maxStackHeight?: number | null; dimensions?: IDimensions | null; weight?: number }
): StackingValidation {
  if (newItem.isFragile && items.length > 0) {
    return { canStack: false, reason: 'Fragile items cannot have items stacked on top' };
  }

  const existingHeight = items.reduce((sum, item) => {
    return sum + (item.dimensions?.height ?? 0);
  }, 0);

  const totalHeight = existingHeight + (newItem.dimensions?.height ?? 0);

  for (const item of items) {
    if (item.maxStackHeight !== null && item.maxStackHeight !== undefined && totalHeight > item.maxStackHeight) {
      return { canStack: false, reason: `Stack height ${totalHeight}cm exceeds max ${item.maxStackHeight}cm` };
    }
  }

  if (newItem.maxStackHeight !== null && newItem.maxStackHeight !== undefined && totalHeight > newItem.maxStackHeight) {
    return { canStack: false, reason: `Stack height ${totalHeight}cm exceeds item max ${newItem.maxStackHeight}cm` };
  }

  return { canStack: true };
}

export async function calculateFloorUsage(floor: string) {
  const locations = await prisma.location.findMany({
    where: { floor, isActive: true },
    include: {
      inventoryRecords: {
        where: { quantity: { gt: 0 } },
        include: { sku: true },
      },
    },
  });

  let totalCapacity = 0;
  let usedVolume = 0;

  for (const location of locations) {
    if (location.capacityCubicCm) {
      totalCapacity += location.capacityCubicCm;
    }

    for (const record of location.inventoryRecords) {
      const dims = record.sku.dimensions as IDimensions | null;
      if (dims) {
        usedVolume += calculateVolume(dims) * record.quantity;
      }
    }
  }

  return {
    floor,
    totalCapacity,
    usedVolume,
    usagePercentage: calculateCapacityUsage(usedVolume, totalCapacity),
    locationCount: locations.length,
  };
}

export async function getStackingSuggestions(skuId: string, locationId: string) {
  const [sku, location] = await Promise.all([
    prisma.sKU.findUnique({ where: { id: skuId } }),
    prisma.location.findUnique({
      where: { id: locationId },
      include: {
        inventoryRecords: {
          where: { quantity: { gt: 0 } },
          include: { sku: true },
        },
      },
    }),
  ]);

  if (!sku || !location) {
    return { canPlace: false, reason: 'SKU or Location not found' };
  }

  const existingItems = location.inventoryRecords.map((r: any) => ({
    isFragile: r.sku.isFragile,
    maxStackHeight: r.sku.maxStackHeight,
    dimensions: r.sku.dimensions as IDimensions | null,
  }));

  const validation = validateStacking(existingItems, {
    isFragile: sku.isFragile,
    maxStackHeight: sku.maxStackHeight,
    dimensions: sku.dimensions as IDimensions | null,
  });

  return {
    canPlace: validation.canStack,
    reason: validation.reason,
    currentItems: existingItems.length,
    suggestedLocation: validation.canStack ? locationId : null,
  };
}
