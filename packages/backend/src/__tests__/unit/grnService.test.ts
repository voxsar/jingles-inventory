import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';
import { GRNS, GRN_LINES, USERS, SKUS } from '../fixtures/testData';
import { GRNStatus, InventoryState, InventoryEventType } from '@jingles/shared';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

// Import after mocking
const { createGRN, submitGRN, submitInspection } = await import('../../modules/grn/grnService');

describe('createGRN', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('creates a GRN with Draft status', async () => {
    prismaMock.gRN.findFirst.mockResolvedValue(null);

    const createdGRN = {
      ...GRNS.draftGRN,
      lines: [GRN_LINES.draftLine1, GRN_LINES.draftLine2],
    };
    prismaMock.gRN.create.mockResolvedValue(createdGRN);
    prismaMock.inventoryEvent.create.mockResolvedValue({
      id: 'event-001',
      eventType: InventoryEventType.GRN_CREATED,
    });

    const result = await createGRN({
      supplierId: 'vendor-acme-001',
      invoiceReference: 'ACME-INV-2024-001',
      createdBy: USERS.admin.id,
      lines: [
        { skuId: SKUS.widgetBox.id, expectedQuantity: 50 },
        { skuId: SKUS.widgetPiece.id, expectedQuantity: 100 },
      ],
    });

    expect(result.status).toBe(GRNStatus.Draft);
    expect(result.lines).toHaveLength(2);
    expect(prismaMock.gRN.create).toHaveBeenCalledOnce();
    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledOnce();
  });

  it('throws error on duplicate invoice reference for same supplier', async () => {
    prismaMock.gRN.findFirst.mockResolvedValue(GRNS.draftGRN);

    await expect(
      createGRN({
        supplierId: 'vendor-acme-001',
        invoiceReference: 'ACME-INV-2024-001',
        createdBy: USERS.admin.id,
        lines: [{ skuId: SKUS.widgetBox.id, expectedQuantity: 10 }],
      })
    ).rejects.toThrow('Duplicate invoice reference');
  });

  it('throws error on duplicate SKUs in GRN lines', async () => {
    prismaMock.gRN.findFirst.mockResolvedValue(null);

    await expect(
      createGRN({
        supplierId: 'vendor-acme-001',
        createdBy: USERS.admin.id,
        lines: [
          { skuId: SKUS.widgetBox.id, expectedQuantity: 10 },
          { skuId: SKUS.widgetBox.id, expectedQuantity: 20 },
        ],
      })
    ).rejects.toThrow('Duplicate SKUs');
  });

  it('allows the same SKU on different GRN lines when each line uses a different batch', async () => {
    prismaMock.gRN.findFirst.mockResolvedValue(null);
    prismaMock.batch.findUnique
      .mockResolvedValueOnce({
        id: 'batch-001',
        skuId: SKUS.widgetBox.id,
        variantId: null,
        batchNumber: 'WGT-BOX-001-B001',
      } as any)
      .mockResolvedValueOnce({
        id: 'batch-002',
        skuId: SKUS.widgetBox.id,
        variantId: null,
        batchNumber: 'WGT-BOX-001-B002',
      } as any);
    prismaMock.gRN.create.mockResolvedValue({
      ...GRNS.draftGRN,
      lines: [
        { ...GRN_LINES.draftLine1, batchId: 'batch-001' },
        { ...GRN_LINES.draftLine2, skuId: SKUS.widgetBox.id, batchId: 'batch-002' },
      ],
    } as any);
    prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-batch-split' } as any);

    const result = await createGRN({
      supplierId: 'vendor-acme-001',
      createdBy: USERS.admin.id,
      lines: [
        { skuId: SKUS.widgetBox.id, expectedQuantity: 10, batchId: 'batch-001' },
        { skuId: SKUS.widgetBox.id, expectedQuantity: 12, batchId: 'batch-002' },
      ],
    });

    expect(result.lines).toHaveLength(2);
    expect(prismaMock.gRN.create).toHaveBeenCalledOnce();
  });

  it('allows GRN without invoice reference', async () => {
    const grnWithoutInvoice = { ...GRNS.draftGRN, invoiceReference: null, lines: [] };
    prismaMock.gRN.create.mockResolvedValue(grnWithoutInvoice);
    prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-002', eventType: 'GRN_CREATED' });

    const result = await createGRN({
      supplierId: 'vendor-acme-001',
      createdBy: USERS.admin.id,
      lines: [{ skuId: SKUS.widgetBox.id, expectedQuantity: 5 }],
    });

    expect(prismaMock.gRN.findFirst).not.toHaveBeenCalled();
    expect(result.status).toBe(GRNStatus.Draft);
  });

  it('records GRN_CREATED event after creation', async () => {
    prismaMock.gRN.findFirst.mockResolvedValue(null);
    prismaMock.gRN.create.mockResolvedValue({ ...GRNS.draftGRN, lines: [] });
    prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-003', eventType: 'GRN_CREATED' });

    await createGRN({
      supplierId: 'vendor-acme-001',
      createdBy: USERS.admin.id,
      lines: [{ skuId: SKUS.widgetBox.id, expectedQuantity: 5 }],
    });

    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: InventoryEventType.GRN_CREATED }),
      })
    );
  });
});

describe('submitGRN', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('throws if GRN is not found', async () => {
    prismaMock.gRN.findUnique.mockResolvedValue(null);
    await expect(submitGRN('non-existent-id', USERS.admin.id)).rejects.toThrow('GRN not found');
  });

  it('throws if GRN is not in Draft status', async () => {
    prismaMock.gRN.findUnique.mockResolvedValue({ ...GRNS.submittedGRN, lines: [] });
    await expect(submitGRN(GRNS.submittedGRN.id, USERS.admin.id)).rejects.toThrow('Only Draft GRNs');
  });

  it('throws if GRN does not have a shelf assigned', async () => {
    const grnWithoutShelf = { ...GRNS.draftGRN, shelfId: null, lines: [GRN_LINES.draftLine1] };
    prismaMock.gRN.findUnique.mockResolvedValue(grnWithoutShelf);
    await expect(submitGRN(GRNS.draftGRN.id, USERS.admin.id)).rejects.toThrow('shelf location must be assigned');
  });

  it('transitions GRN status to Submitted', async () => {
    const grnWithLines = { ...GRNS.draftGRN, shelfId: 'shelf-test-001', lines: [GRN_LINES.draftLine1] };
    prismaMock.gRN.findUnique.mockResolvedValue(grnWithLines);

    const mockTx = {
      gRNLine: { update: vi.fn() },
      inventoryRecord: { create: vi.fn().mockResolvedValue({ id: 'inv-new', state: InventoryState.Uninspected }) },
      inventoryEvent: { create: vi.fn() },
      gRN: { update: vi.fn().mockResolvedValue({ ...GRNS.draftGRN, status: GRNStatus.Submitted }) },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));

    const result = await submitGRN(GRNS.draftGRN.id, USERS.admin.id);

    expect(mockTx.gRN.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: GRNStatus.Submitted }),
      })
    );
  });

  it('creates inventory records in Uninspected state on submission', async () => {
    const grnWithLines = { ...GRNS.draftGRN, shelfId: 'shelf-test-001', lines: [GRN_LINES.draftLine1] };
    prismaMock.gRN.findUnique.mockResolvedValue(grnWithLines);

    const createdRecord = { id: 'inv-new-001', state: InventoryState.Uninspected, quantity: 50 };
    const mockTx = {
      gRNLine: { update: vi.fn() },
      inventoryRecord: { create: vi.fn().mockResolvedValue(createdRecord) },
      inventoryEvent: { create: vi.fn() },
      gRN: { update: vi.fn().mockResolvedValue({ status: GRNStatus.Submitted }) },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));

    const result = await submitGRN(GRNS.draftGRN.id, USERS.admin.id);

    expect(mockTx.inventoryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: InventoryState.Uninspected }),
      })
    );
    expect(result.inventoryRecords).toHaveLength(1);
  });
});

describe('submitInspection', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('throws if GRN line is not found', async () => {
    prismaMock.gRNLine.findUnique.mockResolvedValue(null);
    await expect(
      submitInspection({
        grnLineId: 'non-existent',
        approvedQuantity: 10,
        rejectedQuantity: 0,
        inspectorUserId: USERS.inspector.id,
      })
    ).rejects.toThrow('GRN line not found');
  });

  it('throws if GRN is still in Draft status', async () => {
    prismaMock.gRNLine.findUnique.mockResolvedValue({
      ...GRN_LINES.draftLine1,
      grn: GRNS.draftGRN,
    });

    await expect(
      submitInspection({
        grnLineId: GRN_LINES.draftLine1.id,
        approvedQuantity: 10,
        rejectedQuantity: 0,
        inspectorUserId: USERS.inspector.id,
      })
    ).rejects.toThrow('GRN must be submitted');
  });

  it('creates approved records in Inspected state', async () => {
    prismaMock.gRNLine.findUnique.mockResolvedValue({
      ...GRN_LINES.submittedLine1,
      grn: GRNS.submittedGRN,
    });

    const inspectionRecord = { id: 'inspect-001', approvedQuantity: 28, rejectedQuantity: 2 };
    const approvedRecord = { id: 'inv-approved-001', state: InventoryState.Inspected, quantity: 28 };
    const damagedRecord = { id: 'inv-damaged-001', state: InventoryState.Damaged, quantity: 2 };
    const uninspectedRecord = { id: 'inv-uninspected-001', state: InventoryState.Uninspected, quantity: 30, floorId: 'floor-001', shelfId: 'shelf-001' };

    const mockTx = {
      inspectionRecord: { create: vi.fn().mockResolvedValue(inspectionRecord) },
      inventoryRecord: {
        findFirst: vi.fn().mockResolvedValue(uninspectedRecord),
        create: vi.fn().mockResolvedValue(damagedRecord),
        update: vi.fn().mockResolvedValue(approvedRecord),
      },
      inventoryEvent: { create: vi.fn() },
      gRNLine: { findMany: vi.fn().mockResolvedValue([
        { ...GRN_LINES.submittedLine1, inspectionRecords: [inspectionRecord] },
      ]) },
      gRN: { update: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));

    await submitInspection({
      grnLineId: GRN_LINES.submittedLine1.id,
      approvedQuantity: 28,
      rejectedQuantity: 2,
      damageClassification: 'Minor',
      inspectorUserId: USERS.inspector.id,
      remarks: 'Minor surface damage on 2 items',
    });

    // Should update existing record to Inspected with approved quantity
    expect(mockTx.inventoryRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: InventoryState.Inspected, quantity: 28 }),
      })
    );
    // Should create new Damaged record for rejected quantity
    expect(mockTx.inventoryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: InventoryState.Damaged, quantity: 2 }),
      })
    );
  });

  it('auto-transitions rejected items to Damaged state', async () => {
    prismaMock.gRNLine.findUnique.mockResolvedValue({
      ...GRN_LINES.submittedLine1,
      grn: GRNS.submittedGRN,
    });

    const uninspectedRecord = { id: 'inv-uninspected-002', state: InventoryState.Uninspected, quantity: 30, floorId: 'floor-001', shelfId: 'shelf-001' };

    const mockTx = {
      inspectionRecord: { create: vi.fn().mockResolvedValue({ id: 'inspect-002' }) },
      inventoryRecord: {
        findFirst: vi.fn().mockResolvedValue(uninspectedRecord),
        create: vi.fn().mockResolvedValue({ id: 'inv-dam-001', state: InventoryState.Damaged }),
        update: vi.fn().mockResolvedValue({ id: 'inv-uninspected-002', state: InventoryState.Damaged }),
      },
      inventoryEvent: { create: vi.fn() },
      gRNLine: { findMany: vi.fn().mockResolvedValue([{ inspectionRecords: [{ id: 'inspect-002' }] }]) },
      gRN: { update: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));

    await submitInspection({
      grnLineId: GRN_LINES.submittedLine1.id,
      approvedQuantity: 0,
      rejectedQuantity: 30,
      damageClassification: 'Major',
      inspectorUserId: USERS.inspector.id,
    });

    // Should update existing record to Damaged state
    expect(mockTx.inventoryRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: InventoryState.Damaged }),
      })
    );
    // No new records created (all rejected)
    expect(mockTx.inventoryRecord.create).not.toHaveBeenCalled();
  });

  it('updates GRN status to FullyInspected when all lines are inspected', async () => {
    prismaMock.gRNLine.findUnique.mockResolvedValue({
      ...GRN_LINES.submittedLine1,
      grn: GRNS.submittedGRN,
    });

    const inspectionRecord = { id: 'inspect-003' };
    const uninspectedRecord = { id: 'inv-uninspected-003', state: InventoryState.Uninspected, quantity: 30, floorId: 'floor-001', shelfId: 'shelf-001' };

    const mockTx = {
      inspectionRecord: { create: vi.fn().mockResolvedValue(inspectionRecord) },
      inventoryRecord: {
        findFirst: vi.fn().mockResolvedValue(uninspectedRecord),
        create: vi.fn().mockResolvedValue({ id: 'inv-new', state: InventoryState.Inspected }),
        update: vi.fn().mockResolvedValue({ id: 'inv-new', state: InventoryState.Inspected }),
      },
      inventoryEvent: { create: vi.fn() },
      gRNLine: { findMany: vi.fn().mockResolvedValue([
        { ...GRN_LINES.submittedLine1, inspectionRecords: [inspectionRecord] },
      ]) },
      gRN: { update: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));

    await submitInspection({
      grnLineId: GRN_LINES.submittedLine1.id,
      approvedQuantity: 30,
      rejectedQuantity: 0,
      inspectorUserId: USERS.inspector.id,
    });

    expect(mockTx.gRN.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: GRNStatus.FullyInspected }),
      })
    );
  });
});
