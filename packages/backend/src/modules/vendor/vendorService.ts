import prisma from '../../prisma/client';
import { UserRole } from '@jingles/shared';

export function buildVendorFilter(userRole: string, vendorId?: string | null) {
  if (userRole === UserRole.Vendor && vendorId) {
    return { vendorId };
  }
  return {};
}

export async function getVendorProducts(vendorId: string, requestingUserId: string, requestingRole: string) {
  if (requestingRole === UserRole.Vendor) {
    const user = await prisma.user.findUnique({ where: { id: requestingUserId } });
    if (!user || user.vendorId !== vendorId) {
      throw new Error('Access denied: vendors can only view their own products');
    }
  }

  return prisma.sKU.findMany({
    where: { vendorId, isActive: true },
    include: {
      vendor: { select: { id: true, name: true } },
      _count: { select: { inventoryRecords: true } },
    },
  });
}

export async function getVendorInventorySummary(vendorId: string) {
  const skus = await prisma.sKU.findMany({
    where: { vendorId },
    include: {
      inventoryRecords: {
        where: { quantity: { gt: 0 } },
      },
    },
  });

  return skus.map((sku: any) => ({
    skuId: sku.id,
    skuCode: sku.skuCode,
    name: sku.name,
    totalQuantity: sku.inventoryRecords.reduce((sum: number, r: any) => sum + r.quantity, 0),
    byState: sku.inventoryRecords.reduce((acc: Record<string, number>, r: any) => {
      acc[r.state] = (acc[r.state] ?? 0) + r.quantity;
      return acc;
    }, {} as Record<string, number>),
  }));
}
