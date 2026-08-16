import { beforeEach, describe, expect, it, vi } from 'vitest';

const pgMock = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  // Real `pg.Pool` exposes `.query()` directly (checking out and releasing a
  // client internally) in addition to `.connect()` - posCloud.ts uses both,
  // so the mock needs to answer the same underlying `query` fn either way.
  const Pool = vi.fn(function MockPool(this: unknown) {
    return { connect, query };
  });
  return { Pool, connect, query, release };
});

vi.mock('pg', () => ({ Pool: pgMock.Pool }));

const POS_SCHEMA_TABLES = [
  'legacy_pos_records',
  'legacy_pos_record_versions',
  'pos_shifts',
  'pos_held_sales',
  'pos_sales',
  'pos_customers',
  'pos_credit_payments',
  'pos_returns',
  'pos_sync_events',
  'pos_sync_device_states',
  'pos_sync_conflicts',
];

function createStoredEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stored-cloud-event-001',
    aggregate_type: 'sale',
    aggregate_id: 'sale-001',
    event_type: 'SALE_COMPLETED',
    payload: { terminalId: 'till-01' },
    device_id: 'pos-001',
    terminal_id: 'till-01',
    sequence_num: 4,
    lamport: 4,
    vector_clock: { 'pos-001': 4 },
    conflict_policy: 'SERVER_WINS',
    state: 'CONFIRMED',
    created_at: new Date('2026-08-14T10:00:00.000Z'),
    applied_at: new Date('2026-08-14T10:00:00.000Z'),
    ...overrides,
  };
}

describe('posCloud sync playback', () => {
  beforeEach(() => {
    vi.resetModules();
    pgMock.Pool.mockClear();
    pgMock.connect.mockClear();
    pgMock.release.mockClear();
    pgMock.query.mockReset();
  });

  it('acknowledges the incoming event id when playback matches an existing device sequence', async () => {
    const duplicateRow = createStoredEvent();

    pgMock.query.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/i.test(sql)) {
        return { rows: POS_SCHEMA_TABLES.map((table_name) => ({ table_name })) };
      }
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) {
        return { rows: [] };
      }
      if (/WHERE id = \$1 OR \(device_id = \$2 AND sequence_num = \$3\)/i.test(sql)) {
        return { rows: [duplicateRow] };
      }
      if (/SELECT device_id, last_sequence_num FROM pos_sync_device_states/i.test(sql)) {
        return { rows: [{ device_id: 'pos-001', last_sequence_num: 4 }] };
      }
      if (/SELECT \* FROM pos_sync_events ORDER BY created_at ASC/i.test(sql)) {
        return { rows: [duplicateRow] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const { posSyncPlayback } = await import('../../services/posCloud');

    const result = await posSyncPlayback({
      deviceId: 'pos-001',
      terminalId: 'till-01',
      vectorClock: { 'pos-001': 4 },
      events: [
        {
          id: 'incoming-relay-event-001',
          aggregateType: 'sale',
          aggregateId: 'sale-001',
          eventType: 'SALE_COMPLETED',
          payload: { terminalId: 'till-01' },
          deviceId: 'pos-001',
          sequenceNum: 4,
          lamport: 4,
          vectorClock: { 'pos-001': 4 },
          conflictPolicy: 'SERVER_WINS',
          state: 'PENDING',
          createdAt: '2026-08-14T10:00:00.000Z',
        },
      ],
    });

    expect(result.acceptedEventIds).toEqual(['incoming-relay-event-001']);
    expect(result.serverVectorClock).toEqual({ 'pos-001': 4 });
  });

  it('projects customer snapshots and credit payments idempotently', async () => {
    const storedEvents: Record<string, unknown>[] = [];

    pgMock.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/information_schema\.tables/i.test(sql)) {
        return { rows: POS_SCHEMA_TABLES.map((table_name) => ({ table_name })) };
      }
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) {
        return { rows: [] };
      }
      if (/WHERE id = \$1 OR \(device_id = \$2 AND sequence_num = \$3\)/i.test(sql)) {
        return { rows: [] };
      }
      if (/WHERE aggregate_type = \$1 AND aggregate_id = \$2/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO pos_sync_events/i.test(sql)) {
        const row = createStoredEvent({
          id: params[0],
          aggregate_type: params[1],
          aggregate_id: params[2],
          event_type: params[3],
          payload: params[4],
          vector_clock: params[5],
          device_id: params[6],
          terminal_id: params[7],
          sequence_num: params[8],
          lamport: params[9],
          conflict_policy: params[10],
          state: params[11],
          applied_at: params[12],
        });
        storedEvents.push(row);
        return { rows: [row] };
      }
      if (/SELECT id FROM pos_credit_payments WHERE id = \$1/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO pos_customers/i.test(sql) || /INSERT INTO pos_credit_payments/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO pos_sync_device_states/i.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT device_id, last_sequence_num FROM pos_sync_device_states/i.test(sql)) {
        return { rows: [{ device_id: 'pos-001', last_sequence_num: 2 }] };
      }
      if (/SELECT \* FROM pos_sync_events ORDER BY created_at ASC/i.test(sql)) {
        return { rows: storedEvents };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const { posSyncPlayback } = await import('../../services/posCloud');
    const result = await posSyncPlayback({
      deviceId: 'pos-001',
      terminalId: 'till-01',
      vectorClock: {},
      events: [
        {
          id: 'customer-event-001',
          aggregateType: 'customer',
          aggregateId: 'customer-001',
          eventType: 'CUSTOMER_UPSERTED',
          payload: { code: 'C001', name: 'Acme Stores', tier: 'Wholesale', creditLimit: 50000 },
          deviceId: 'pos-001',
          sequenceNum: 1,
          lamport: 1,
          vectorClock: { 'pos-001': 1 },
          conflictPolicy: 'LAST_WRITE_WINS',
          state: 'PENDING',
          createdAt: '2026-08-14T10:00:00.000Z',
        },
        {
          id: 'payment-event-001',
          aggregateType: 'credit-payment',
          aggregateId: 'payment-001',
          eventType: 'CREDIT_PAYMENT_RECORDED',
          payload: { customerId: 'customer-001', amount: 1250, method: 'CASH', terminalId: 'till-01' },
          deviceId: 'pos-001',
          sequenceNum: 2,
          lamport: 2,
          vectorClock: { 'pos-001': 2 },
          conflictPolicy: 'SERVER_WINS',
          state: 'PENDING',
          createdAt: '2026-08-14T10:05:00.000Z',
        },
      ],
    });

    expect(result.acceptedEventIds).toEqual(['customer-event-001', 'payment-event-001']);
    const customerInsert = pgMock.query.mock.calls.find(([sql]) => /INSERT INTO pos_customers/i.test(sql));
    const paymentInsert = pgMock.query.mock.calls.find(([sql]) => /INSERT INTO pos_credit_payments/i.test(sql));
    expect(customerInsert?.[1]).toEqual(expect.arrayContaining(['customer-001', 'C001', 'Acme Stores', 50000]));
    expect(paymentInsert?.[1]).toEqual(expect.arrayContaining(['payment-001', 'customer-001', 1250, 'CASH']));
  });

  it('keeps applying independent events in a batch after one event is rejected', async () => {
    const storedEvents: Record<string, unknown>[] = [];

    pgMock.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/information_schema\.tables/i.test(sql)) {
        return { rows: POS_SCHEMA_TABLES.map((table_name) => ({ table_name })) };
      }
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) {
        return { rows: [] };
      }
      if (/WHERE id = \$1 OR \(device_id = \$2 AND sequence_num = \$3\)/i.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT last_vector_clock FROM pos_shifts WHERE id = \$1/i.test(sql)) {
        return { rows: [] };
      }
      if (/FROM pos_sync_events\s+WHERE aggregate_type = \$1 AND aggregate_id = \$2/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO pos_sync_events/i.test(sql)) {
        const row = {
          id: params[0],
          aggregate_type: params[1],
          aggregate_id: params[2],
          event_type: params[3],
          payload: params[4],
          vector_clock: params[5],
          device_id: params[6],
          terminal_id: params[7],
          sequence_num: params[8],
          lamport: params[9],
          conflict_policy: params[10],
          state: params[11],
          created_at: new Date('2026-08-14T10:00:00.000Z'),
          applied_at: params[12],
        };
        storedEvents.push(row);
        return { rows: [row] };
      }
      if (/INSERT INTO pos_shifts/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO pos_sync_device_states/i.test(sql)) {
        return { rows: [] };
      }
      if (/FROM pos_sync_conflicts WHERE remote_event_id = \$1/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO pos_sync_conflicts/i.test(sql)) {
        const row = {
          id: params[0],
          aggregate_type: params[1],
          aggregate_id: params[2],
          local_event_id: null,
          remote_event_id: params[3],
          policy: 'SYNC_ERROR',
          status: 'OPEN',
          detail: params[4],
          created_at: new Date('2026-08-14T10:05:00.000Z'),
          resolved_at: null,
        };
        return { rows: [row] };
      }
      if (/SELECT device_id, last_sequence_num FROM pos_sync_device_states/i.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT \* FROM pos_sync_events ORDER BY created_at ASC/i.test(sql)) {
        return { rows: storedEvents };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const { posSyncPlayback } = await import('../../services/posCloud');

    // A batch that mixes two unrelated, valid shift events with one
    // credit-payment event carrying an invalid (negative) amount. The bad
    // event must be rejected and recorded as a conflict without rolling
    // back or skipping the valid shift events around it.
    const result = await posSyncPlayback({
      deviceId: 'pos-77',
      terminalId: 'till-77',
      vectorClock: {},
      events: [
        {
          id: 'event-shift-1',
          aggregateType: 'shift',
          aggregateId: 'shift-ok-1',
          eventType: 'SHIFT_OPENED',
          payload: { terminalId: 'till-77', branchId: 'b1', cashierId: 'cashier-1', openingFloat: 100 },
          deviceId: 'pos-77',
          sequenceNum: 1,
          lamport: 1,
          vectorClock: { 'pos-77': 1 },
          conflictPolicy: 'LAST_WRITE_WINS',
          state: 'PENDING',
          createdAt: '2026-08-14T09:59:00.000Z',
        },
        {
          id: 'event-payment-bad',
          aggregateType: 'credit-payment',
          aggregateId: 'payment-bad-1',
          eventType: 'CREDIT_PAYMENT_RECORDED',
          payload: { customerId: 'customer-001', amount: -50 },
          deviceId: 'pos-77',
          sequenceNum: 2,
          lamport: 2,
          vectorClock: { 'pos-77': 2 },
          conflictPolicy: 'SERVER_WINS',
          state: 'PENDING',
          createdAt: '2026-08-14T09:59:30.000Z',
        },
        {
          id: 'event-shift-2',
          aggregateType: 'shift',
          aggregateId: 'shift-ok-2',
          eventType: 'SHIFT_OPENED',
          payload: { terminalId: 'till-78', branchId: 'b1', cashierId: 'cashier-2', openingFloat: 50 },
          deviceId: 'pos-77',
          sequenceNum: 3,
          lamport: 3,
          vectorClock: { 'pos-77': 3 },
          conflictPolicy: 'LAST_WRITE_WINS',
          state: 'PENDING',
          createdAt: '2026-08-14T10:00:00.000Z',
        },
      ],
    });

    expect(result.acceptedEventIds).toEqual(['event-shift-1', 'event-shift-2']);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      remoteEventId: 'event-payment-bad',
      policy: 'SYNC_ERROR',
      status: 'OPEN',
    });
    const shiftInserts = pgMock.query.mock.calls.filter(([sql]) => /INSERT INTO pos_shifts/i.test(sql));
    expect(shiftInserts).toHaveLength(2);
  });
});
