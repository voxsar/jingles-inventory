import { beforeEach, describe, expect, it, vi } from 'vitest';

const pgMock = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const Pool = vi.fn(function MockPool(this: unknown) {
    return { connect };
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
});
