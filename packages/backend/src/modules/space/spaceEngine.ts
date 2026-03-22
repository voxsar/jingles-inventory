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

export async function calculateShelfUsage(shelfId: string) {
  const shelf = await prisma.shelf.findUnique({
    where: { id: shelfId, isActive: true },
    include: {
      inventoryRecords: {
        where: { quantity: { gt: 0 } },
        include: { sku: true },
      },
    },
  });

  if (!shelf) {
    return { shelfId, totalCapacity: 0, usedVolume: 0, usagePercentage: 0 };
  }

  const totalCapacity = shelf.height * shelf.width * shelf.length;
  let usedVolume = 0;

  for (const record of shelf.inventoryRecords) {
    const dims = record.sku.dimensions as IDimensions | null;
    if (dims) {
      usedVolume += calculateVolume(dims) * record.quantity;
    }
  }

  return {
    shelfId,
    totalCapacity,
    usedVolume,
    usagePercentage: calculateCapacityUsage(usedVolume, totalCapacity),
  };
}

export async function getStackingSuggestions(skuId: string, floorId: string) {
  const [sku, floor] = await Promise.all([
    prisma.sKU.findUnique({ where: { id: skuId } }),
    prisma.floor.findUnique({
      where: { id: floorId },
      include: {
        inventoryRecords: {
          where: { quantity: { gt: 0 } },
          include: { sku: true },
        },
      },
    }),
  ]);

  if (!sku || !floor) {
    return { canPlace: false, reason: 'SKU or Floor not found' };
  }

  const existingItems = floor.inventoryRecords.map((r: any) => ({
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
    suggestedFloor: validation.canStack ? floorId : null,
  };
}
