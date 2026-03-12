import { InventoryEventType } from '@jingles/shared';
import prisma from '../../prisma/client';

interface RecordEventParams {
  eventType: InventoryEventType;
  parentEntityId?: string;
  quantityDelta?: number;
  beforeQuantity?: number;
  afterQuantity?: number;
  reasonCode?: string;
  userId?: string;
  terminalId?: string;
  overrideFlag?: boolean;
  metadata?: Record<string, unknown>;
}

export async function recordEvent(params: RecordEventParams) {
  return prisma.inventoryEvent.create({
    data: {
      eventType: params.eventType,
      parentEntityId: params.parentEntityId,
      quantityDelta: params.quantityDelta,
      beforeQuantity: params.beforeQuantity,
      afterQuantity: params.afterQuantity,
      reasonCode: params.reasonCode,
      userId: params.userId,
      terminalId: params.terminalId,
      overrideFlag: params.overrideFlag ?? false,
      metadata: params.metadata as any,
    },
  });
}

export async function getEvents(filters: {
  parentEntityId?: string;
  eventType?: InventoryEventType;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 50, ...where } = filters;
  const skip = (page - 1) * pageSize;

  const whereClause: any = {};
  if (where.parentEntityId) whereClause.parentEntityId = where.parentEntityId;
  if (where.eventType) whereClause.eventType = where.eventType;
  if (where.userId) whereClause.userId = where.userId;
  if (where.fromDate || where.toDate) {
    whereClause.timestamp = {};
    if (where.fromDate) whereClause.timestamp.gte = where.fromDate;
    if (where.toDate) whereClause.timestamp.lte = where.toDate;
  }

  const [items, total] = await Promise.all([
    prisma.inventoryEvent.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      skip,
      take: pageSize,
      include: { user: { select: { email: true, role: true } } },
    }),
    prisma.inventoryEvent.count({ where: whereClause }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
