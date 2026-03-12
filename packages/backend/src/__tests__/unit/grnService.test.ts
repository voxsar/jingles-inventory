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
        { skuId: SKUS.widgetBox.id, expectedQuantity: 50, batchReference: 'BATCH-001' },
        { skuId: SKUS.widgetPiece.id, expectedQuantity: 100, batchReference: 'BATCH-002' },
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

  it('transitions GRN status to Submitted', async () => {
    const grnWithLines = { ...GRNS.draftGRN, lines: [GRN_LINES.draftLine1] };
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
    const grnWithLines = { ...GRNS.draftGRN, lines: [GRN_LINES.draftLine1] };
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

    const mockTx = {
      inspectionRecord: { create: vi.fn().mockResolvedValue(inspectionRecord) },
      inventoryRecord: { create: vi.fn()
        .mockResolvedValueOnce(approvedRecord)
        .mockResolvedValueOnce(damagedRecord) },
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

    expect(mockTx.inventoryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: InventoryState.Inspected, quantity: 28 }),
      })
    );
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

    const mockTx = {
      inspectionRecord: { create: vi.fn().mockResolvedValue({ id: 'inspect-002' }) },
      inventoryRecord: {
        create: vi.fn().mockResolvedValue({ id: 'inv-dam-001', state: InventoryState.Damaged }),
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

    expect(mockTx.inventoryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: InventoryState.Damaged }),
      })
    );
    // No approved record created
    expect(mockTx.inventoryRecord.create).toHaveBeenCalledTimes(1);
  });

  it('updates GRN status to FullyInspected when all lines are inspected', async () => {
    prismaMock.gRNLine.findUnique.mockResolvedValue({
      ...GRN_LINES.submittedLine1,
      grn: GRNS.submittedGRN,
    });

    const inspectionRecord = { id: 'inspect-003' };
    const mockTx = {
      inspectionRecord: { create: vi.fn().mockResolvedValue(inspectionRecord) },
      inventoryRecord: { create: vi.fn().mockResolvedValue({ id: 'inv-new', state: InventoryState.Inspected }) },
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
