import { GRNStatus, InventoryState, InventoryEventType } from '@jingles/shared';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { recordEvent } from '../inventory/eventLedger';

export async function createGRN(data: {
  supplierId: string;
  invoiceReference?: string;
  supplierInvoiceDate?: Date;
  expectedDeliveryDate?: Date;
  notes?: string;
  createdBy: string;
  lines: Array<{
    skuId: string;
    expectedQuantity: number;
    batchReference?: string;
    notes?: string;
  }>;
}) {
  if (data.invoiceReference) {
    const existing = await prisma.gRN.findFirst({
      where: { invoiceReference: data.invoiceReference, supplierId: data.supplierId },
    });
    if (existing) {
      throw new Error(`Duplicate invoice reference: ${data.invoiceReference} for this supplier`);
    }
  }

  const skuIds = data.lines.map(l => l.skuId);
  const uniqueSkuIds = new Set(skuIds);
  if (uniqueSkuIds.size !== skuIds.length) {
    throw new Error('Duplicate SKUs in GRN lines detected');
  }

  const grn = await prisma.gRN.create({
    data: {
      supplierId: data.supplierId,
      invoiceReference: data.invoiceReference,
      supplierInvoiceDate: data.supplierInvoiceDate,
      expectedDeliveryDate: data.expectedDeliveryDate,
      notes: data.notes,
      createdBy: data.createdBy,
      status: GRNStatus.Draft,
      lines: {
        create: data.lines.map(line => ({
          skuId: line.skuId,
          expectedQuantity: line.expectedQuantity,
          receivedQuantity: 0,
          batchReference: line.batchReference,
          notes: line.notes,
        })),
      },
    },
    include: { lines: true },
  });

  await recordEvent({
    eventType: InventoryEventType.GRN_CREATED,
    parentEntityId: grn.id,
    userId: data.createdBy,
    metadata: { grnId: grn.id, supplierId: data.supplierId },
  });

  return grn;
}

export async function submitGRN(grnId: string, userId: string, deliveryDate?: Date) {
  const grn = await prisma.gRN.findUnique({
    where: { id: grnId },
    include: { lines: true },
  });

  if (!grn) throw new Error('GRN not found');
  if (grn.status !== GRNStatus.Draft) throw new Error('Only Draft GRNs can be submitted');

  const inventoryRecords = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const records = [];

    for (const line of grn.lines) {
      await tx.gRNLine.update({
        where: { id: line.id },
        data: { receivedQuantity: line.expectedQuantity },
      });

      const record = await tx.inventoryRecord.create({
        data: {
          skuId: line.skuId,
          batchId: line.batchReference,
          quantity: line.expectedQuantity,
          state: InventoryState.Uninspected,
          userId,
          version: 1,
        },
      });

      records.push(record);

      await tx.inventoryEvent.create({
        data: {
          eventType: InventoryEventType.GRN_CREATED,
          parentEntityId: record.id,
          quantityDelta: line.expectedQuantity,
          beforeQuantity: 0,
          afterQuantity: line.expectedQuantity,
          userId,
          metadata: { grnId, grnLineId: line.id } as any,
        },
      });
    }

    await tx.gRN.update({
      where: { id: grnId },
      data: {
        status: GRNStatus.Submitted,
        deliveryDate: deliveryDate ?? new Date(),
      },
    });

    return records;
  });

  return { grn: { ...grn, status: GRNStatus.Submitted }, inventoryRecords };
}

export async function submitInspection(data: {
  grnLineId: string;
  approvedQuantity: number;
  rejectedQuantity: number;
  damageClassification?: string;
  inspectorUserId: string;
  remarks?: string;
}) {
  const grnLine = await prisma.gRNLine.findUnique({
    where: { id: data.grnLineId },
    include: { grn: true },
  });

  if (!grnLine) throw new Error('GRN line not found');
  if (grnLine.grn.status === GRNStatus.Draft) throw new Error('GRN must be submitted before inspection');

  const inspection = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const record = await tx.inspectionRecord.create({
      data: {
        grnLineId: data.grnLineId,
        approvedQuantity: data.approvedQuantity,
        rejectedQuantity: data.rejectedQuantity,
        damageClassification: data.damageClassification,
        inspectorUserId: data.inspectorUserId,
        remarks: data.remarks,
      },
    });

    if (data.approvedQuantity > 0) {
      const approvedRecord = await tx.inventoryRecord.create({
        data: {
          skuId: grnLine.skuId,
          batchId: grnLine.batchReference,
          quantity: data.approvedQuantity,
          state: InventoryState.Inspected,
          userId: data.inspectorUserId,
          version: 1,
        },
      });

      await tx.inventoryEvent.create({
        data: {
          eventType: InventoryEventType.INSPECTION_APPROVED,
          parentEntityId: approvedRecord.id,
          quantityDelta: data.approvedQuantity,
          beforeQuantity: 0,
          afterQuantity: data.approvedQuantity,
          userId: data.inspectorUserId,
          metadata: { grnLineId: data.grnLineId, inspectionId: record.id } as any,
        },
      });
    }

    if (data.rejectedQuantity > 0) {
      const damagedRecord = await tx.inventoryRecord.create({
        data: {
          skuId: grnLine.skuId,
          batchId: grnLine.batchReference,
          quantity: data.rejectedQuantity,
          state: InventoryState.Damaged,
          userId: data.inspectorUserId,
          version: 1,
        },
      });

      await tx.inventoryEvent.create({
        data: {
          eventType: InventoryEventType.DAMAGE_RECORDED,
          parentEntityId: damagedRecord.id,
          quantityDelta: data.rejectedQuantity,
          beforeQuantity: 0,
          afterQuantity: data.rejectedQuantity,
          userId: data.inspectorUserId,
          metadata: { grnLineId: data.grnLineId, damageClassification: data.damageClassification } as any,
        },
      });
    }

    const allLines = await tx.gRNLine.findMany({
      where: { grnId: grnLine.grnId },
      include: { inspectionRecords: true },
    });

    const allInspected = allLines.every((l: any) => l.inspectionRecords.length > 0);
    const anyInspected = allLines.some((l: any) => l.inspectionRecords.length > 0);

    if (allInspected) {
      await tx.gRN.update({
        where: { id: grnLine.grnId },
        data: { status: GRNStatus.FullyInspected },
      });
    } else if (anyInspected) {
      await tx.gRN.update({
        where: { id: grnLine.grnId },
        data: { status: GRNStatus.PartiallyInspected },
      });
    }

    return record;
  });

  return inspection;
}
