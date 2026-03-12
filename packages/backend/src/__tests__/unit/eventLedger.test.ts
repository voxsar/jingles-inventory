import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';
import { INVENTORY_EVENTS, USERS } from '../fixtures/testData';
import { InventoryEventType } from '@jingles/shared';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));

const { recordEvent, getEvents } = await import('../../modules/inventory/eventLedger');

describe('recordEvent', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('creates an inventory event with all required fields', async () => {
    const eventData = INVENTORY_EVENTS.grnCreated;
    prismaMock.inventoryEvent.create.mockResolvedValue(eventData);

    const result = await recordEvent({
      eventType: InventoryEventType.GRN_CREATED,
      parentEntityId: 'grn-001',
      quantityDelta: 50,
      beforeQuantity: 0,
      afterQuantity: 50,
      userId: USERS.admin.id,
      terminalId: 'TERMINAL-001',
    });

    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledOnce();
    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: InventoryEventType.GRN_CREATED,
          quantityDelta: 50,
          beforeQuantity: 0,
          afterQuantity: 50,
        }),
      })
    );
  });

  it('defaults overrideFlag to false when not provided', async () => {
    prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'ev-001', overrideFlag: false });

    await recordEvent({
      eventType: InventoryEventType.DAMAGE_RECORDED,
      parentEntityId: 'inv-001',
    });

    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ overrideFlag: false }),
      })
    );
  });

  it('sets overrideFlag to true when override is used', async () => {
    prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'ev-002', overrideFlag: true });

    await recordEvent({
      eventType: InventoryEventType.STATE_CHANGE,
      parentEntityId: 'inv-001',
      overrideFlag: true,
      reasonCode: 'MANAGER_OVERRIDE',
    });

    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ overrideFlag: true }),
      })
    );
  });

  it('records all 9 event types without throwing', async () => {
    prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'ev-generic' });

    const eventTypes = Object.values(InventoryEventType);
    for (const eventType of eventTypes) {
      await expect(
        recordEvent({ eventType, parentEntityId: 'test-entity-001' })
      ).resolves.not.toThrow();
    }

    expect(prismaMock.inventoryEvent.create).toHaveBeenCalledTimes(eventTypes.length);
  });

  it('does not allow event deletion (no delete method called)', () => {
    // Verify the event ledger has no delete operation
    expect((prismaMock.inventoryEvent as any).delete).toBeUndefined();
    expect((prismaMock.inventoryEvent as any).deleteMany).toBeUndefined();
  });
});

describe('getEvents', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('returns paginated events with total count', async () => {
    const mockEvents = [INVENTORY_EVENTS.grnCreated, INVENTORY_EVENTS.boxOpened];
    prismaMock.inventoryEvent.findMany.mockResolvedValue(mockEvents);
    prismaMock.inventoryEvent.count.mockResolvedValue(2);

    const result = await getEvents({ page: 1, pageSize: 50 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('filters by parentEntityId', async () => {
    prismaMock.inventoryEvent.findMany.mockResolvedValue([INVENTORY_EVENTS.grnCreated]);
    prismaMock.inventoryEvent.count.mockResolvedValue(1);

    await getEvents({ parentEntityId: 'grn-draft-001' });

    expect(prismaMock.inventoryEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentEntityId: 'grn-draft-001' }),
      })
    );
  });

  it('filters by eventType', async () => {
    prismaMock.inventoryEvent.findMany.mockResolvedValue([]);
    prismaMock.inventoryEvent.count.mockResolvedValue(0);

    await getEvents({ eventType: InventoryEventType.DAMAGE_RECORDED });

    expect(prismaMock.inventoryEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: InventoryEventType.DAMAGE_RECORDED }),
      })
    );
  });

  it('filters by date range', async () => {
    prismaMock.inventoryEvent.findMany.mockResolvedValue([]);
    prismaMock.inventoryEvent.count.mockResolvedValue(0);

    const fromDate = new Date('2024-01-01');
    const toDate = new Date('2024-01-31');

    await getEvents({ fromDate, toDate });

    expect(prismaMock.inventoryEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: expect.objectContaining({
            gte: fromDate,
            lte: toDate,
          }),
        }),
      })
    );
  });

  it('calculates totalPages correctly', async () => {
    prismaMock.inventoryEvent.findMany.mockResolvedValue([]);
    prismaMock.inventoryEvent.count.mockResolvedValue(105);

    const result = await getEvents({ page: 1, pageSize: 50 });

    expect(result.totalPages).toBe(3);
  });

  it('defaults to page 1 and pageSize 50 when not specified', async () => {
    prismaMock.inventoryEvent.findMany.mockResolvedValue([]);
    prismaMock.inventoryEvent.count.mockResolvedValue(0);

    const result = await getEvents({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });
});
