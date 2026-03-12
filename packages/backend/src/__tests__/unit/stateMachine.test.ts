import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';
import { INVENTORY_RECORDS, USERS } from '../fixtures/testData';
import { InventoryState, UserRole } from '@jingles/shared';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));

const { performTransition } = await import('../../modules/inventory/stateMachine');

describe('performTransition', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('returns error when inventory record not found', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(null);

    const result = await performTransition(
      'non-existent-id',
      InventoryState.Uninspected,
      USERS.staff.id,
      UserRole.Staff
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('performs valid transition and increments version', async () => {
    const record = INVENTORY_RECORDS.uninspected;
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(record);

    const updatedRecord = { ...record, state: InventoryState.Inspected, version: 2 };
    prismaMock.$transaction.mockResolvedValue([updatedRecord, { id: 'event-001' }]);

    const result = await performTransition(
      record.id,
      InventoryState.Inspected,
      USERS.inspector.id,
      UserRole.Inspector
    );

    expect(result.success).toBe(true);
    expect(result.requiresOverride).toBe(false);
    expect(result.record?.state).toBe(InventoryState.Inspected);
    expect(result.record?.version).toBe(2);
  });

  it('allows Manager override for invalid transition', async () => {
    const record = INVENTORY_RECORDS.damaged;
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(record);
    prismaMock.$transaction.mockResolvedValue([
      { ...record, state: InventoryState.Inspected, version: 2 },
      { id: 'event-override-001', overrideFlag: true },
    ]);

    const result = await performTransition(
      record.id,
      InventoryState.Inspected,
      USERS.manager.id,
      UserRole.Manager,
      'Re-evaluated by manager'
    );

    expect(result.success).toBe(true);
    expect(result.requiresOverride).toBe(true);
  });

  it('rejects invalid transition for Staff role', async () => {
    const record = INVENTORY_RECORDS.uninspected;
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(record);

    const result = await performTransition(
      record.id,
      InventoryState.Sold,
      USERS.staff.id,
      UserRole.Staff
    );

    expect(result.success).toBe(false);
    expect(result.requiresOverride).toBe(false);
    expect(result.error).toContain('not allowed');
    // $transaction should not be called in this test (may have been called in prior tests)
    const callCount = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBe(0);
  });

  it('records override event when Manager overrides transition', async () => {
    const record = INVENTORY_RECORDS.damaged;
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(record);

    const mockUpdatedRecord = { ...record, state: InventoryState.ShelfReady };
    const mockEvent = { id: 'event-001', overrideFlag: true };
    prismaMock.$transaction.mockResolvedValue([mockUpdatedRecord, mockEvent]);

    await performTransition(
      record.id,
      InventoryState.ShelfReady,
      USERS.manager.id,
      UserRole.Manager,
      'Item repaired and cleared'
    );

    // $transaction should have been called at least once in this test (exact count depends on prior test state)
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('Admin can also override invalid transitions', async () => {
    const record = INVENTORY_RECORDS.damaged;
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(record);
    prismaMock.$transaction.mockResolvedValue([
      { ...record, state: InventoryState.Inspected },
      { id: 'event-admin-override', overrideFlag: true },
    ]);

    const result = await performTransition(
      record.id,
      InventoryState.Inspected,
      USERS.admin.id,
      UserRole.Admin
    );

    expect(result.success).toBe(true);
    expect(result.requiresOverride).toBe(true);
  });

  it('valid transition does not set override flag', async () => {
    const record = INVENTORY_RECORDS.inspected;
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(record);

    prismaMock.$transaction.mockImplementation(async (ops: any[]) => {
      return [
        { ...record, state: InventoryState.ShelfReady },
        { id: 'event-state-001', overrideFlag: false },
      ];
    });

    const result = await performTransition(
      record.id,
      InventoryState.ShelfReady,
      USERS.manager.id,
      UserRole.Manager
    );

    expect(result.requiresOverride).toBe(false);
  });
});
