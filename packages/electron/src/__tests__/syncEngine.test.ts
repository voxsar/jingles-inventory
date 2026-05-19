import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureSyncEngine,
  processRealtimeSyncEvent,
  queueOperation,
  stopAutoSync,
  syncAll,
} from '../sync/syncEngine';

vi.mock('../offline/localDB', () => ({
  addToSyncQueue: vi.fn(),
  applyReplicaMutation: vi.fn(),
  clearProcessedQueue: vi.fn(),
  clearProcessedRequestSyncQueue: vi.fn(),
  getConfig: vi.fn().mockReturnValue(null),
  getPendingSyncConflicts: vi.fn().mockReturnValue([]),
  getPendingSyncOperationLogs: vi.fn().mockReturnValue([]),
  getPendingRequestSyncQueue: vi.fn().mockReturnValue([]),
  getSyncQueue: vi.fn().mockReturnValue([]),
  insertPendingSyncConflict: vi.fn(),
  markRequestSyncFailed: vi.fn(),
  markRequestSyncProcessed: vi.fn(),
  markSyncOperationLogConflict: vi.fn(),
  markSyncOperationLogFailed: vi.fn(),
  markSyncOperationLogProcessed: vi.fn(),
  markSyncProcessed: vi.fn(),
  replaceReplicaSnapshot: vi.fn(),
  setConfig: vi.fn(),
}));

import {
  addToSyncQueue,
  applyReplicaMutation,
  getConfig,
  getPendingSyncConflicts,
  getPendingSyncOperationLogs,
  getPendingRequestSyncQueue,
  getSyncQueue,
  insertPendingSyncConflict,
  markRequestSyncFailed,
  markRequestSyncProcessed,
  markSyncOperationLogConflict,
  markSyncOperationLogProcessed,
  replaceReplicaSnapshot,
  setConfig,
} from '../offline/localDB';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
    json: vi.fn().mockResolvedValue(payload),
  };
}

function createEmptyResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(''),
    json: vi.fn().mockResolvedValue(null),
  };
}

describe('syncEngine', () => {
  beforeEach(() => {
    stopAutoSync();
    fetchMock.mockReset();
    (applyReplicaMutation as ReturnType<typeof vi.fn>).mockReset();
    (getConfig as ReturnType<typeof vi.fn>).mockReset();
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>).mockReset();
    (getPendingSyncConflicts as ReturnType<typeof vi.fn>).mockReset();
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReset();
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>).mockReset();
    (insertPendingSyncConflict as ReturnType<typeof vi.fn>).mockReset();
    (markRequestSyncFailed as ReturnType<typeof vi.fn>).mockReset();
    (markRequestSyncProcessed as ReturnType<typeof vi.fn>).mockReset();
    (markSyncOperationLogConflict as ReturnType<typeof vi.fn>).mockReset();
    (markSyncOperationLogProcessed as ReturnType<typeof vi.fn>).mockReset();
    (replaceReplicaSnapshot as ReturnType<typeof vi.fn>).mockReset();
    (setConfig as ReturnType<typeof vi.fn>).mockReset();

    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getPendingSyncConflicts as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([]);

    configureSyncEngine({
      serverUrl: 'http://localhost:3001',
      clientId: 'client-test-001',
      getToken: () => 'test-token',
    });
  });

  it('configures sync engine without throwing', () => {
    expect(() =>
      configureSyncEngine({
        serverUrl: 'http://localhost:3001',
        clientId: 'client-test-001',
        getToken: () => 'test-token',
      })
    ).not.toThrow();
  });

  it('pulls a full replica snapshot when there are no pending local requests', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            changes: [],
            lastServerSeq: 0,
            hasMore: false,
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            users: [{ id: 'user-001', email: 'admin@test.com', role: 'Admin', password_hash: '' }],
            skus: [{ id: 'sku-001', sku_code: 'SKU-001' }],
          },
        })
      );

    const result = await syncAll();

    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/sync/log?sinceSeq=0&limit=200',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(replaceReplicaSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        users: expect.any(Array),
        skus: expect.any(Array),
      })
    );
    expect(setConfig).toHaveBeenCalledWith('lastSyncTime', expect.any(String));
  });

  it('replays pending request sync entries before pulling the replica snapshot', async () => {
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          id: 'req-001',
          method: 'POST',
          path: '/api/vendors',
          content_type: 'application/json',
          body: JSON.stringify({ name: 'Vendor A' }),
          files: JSON.stringify([]),
        },
      ])
      .mockReturnValueOnce([]);

    fetchMock
      .mockResolvedValueOnce(createEmptyResponse())
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            changes: [],
            lastServerSeq: 0,
            hasMore: false,
          },
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ data: { users: [], vendors: [] } }));

    const result = await syncAll();

    expect(result.pushed).toBe(1);
    expect(markRequestSyncProcessed).toHaveBeenCalledWith('req-001');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/vendors',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/api/sync/log?sinceSeq=0&limit=200',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(replaceReplicaSnapshot).toHaveBeenCalled();
  });

  it('blocks the replica pull when a pending request cannot be synced yet', async () => {
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          id: 'req-001',
          method: 'POST',
          path: '/api/vendors',
          content_type: 'application/json',
          body: JSON.stringify({ name: 'Vendor A' }),
          files: JSON.stringify([]),
        },
      ])
      .mockReturnValueOnce([
        {
          id: 'req-001',
          method: 'POST',
          path: '/api/vendors',
          content_type: 'application/json',
          body: JSON.stringify({ name: 'Vendor A' }),
          files: JSON.stringify([]),
        },
      ]);

    fetchMock.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await syncAll();

    expect(result.errors.some((error) => error.includes('pending sync'))).toBe(true);
    expect(markRequestSyncFailed).toHaveBeenCalledWith('req-001', 'Network timeout', true);
    expect(replaceReplicaSnapshot).not.toHaveBeenCalled();
  });

  it('processes legacy sync_queue operations for backwards compatibility', async () => {
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 'legacy-001',
        client_id: 'client-test-001',
        operation: 'UPSERT_INVENTORY',
        payload: JSON.stringify({ id: 'inv-001' }),
        status: 'Pending',
      },
    ]);

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: { processed: [{ id: 'legacy-001', status: 'Processed' }] },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            changes: [],
            lastServerSeq: 0,
            hasMore: false,
          },
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ data: { users: [] } }));

    const result = await syncAll();

    expect(result.pushed).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/sync/push',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('pushes sync-v2 operation log entries and marks them processed', async () => {
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          id: 'op-001',
          client_id: 'client-test-001',
          op_type: 'inventory.update',
          aggregate_id: 'inv-001',
          idempotency_key: 'idem-001',
          payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
          base_version: 3,
          status: 'Pending',
        },
      ])
      .mockReturnValueOnce([]);

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            processed: [
              {
                clientOperationId: 'op-001',
                idempotencyKey: 'idem-001',
                status: 'Applied',
                serverSeq: 7,
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            changes: [],
            lastServerSeq: 7,
            hasMore: false,
          },
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ data: { users: [] } }));

    const result = await syncAll();

    expect(result.pushed).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/sync/push-ops',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(markSyncOperationLogProcessed).toHaveBeenCalledWith('op-001', 7);
  });

  it('records sync-v2 conflicts locally and blocks the pull until resolved', async () => {
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          id: 'op-001',
          client_id: 'client-test-001',
          op_type: 'inventory.update',
          aggregate_id: 'inv-001',
          idempotency_key: 'idem-001',
          payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
          base_version: 3,
          status: 'Pending',
        },
      ])
      .mockReturnValueOnce([]);
    (getPendingSyncConflicts as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ id: 'conflict-001', operation_id: 'op-001', status: 'Pending' }]);

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          data: {
            processed: [
              {
                clientOperationId: 'op-001',
                idempotencyKey: 'idem-001',
                status: 'Conflict',
                conflict: {
                  message: 'Version conflict',
                  serverRecord: { id: 'inv-001', quantity: 12, version: 5 },
                },
              },
            ],
          },
        },
        409
      )
    );

    const result = await syncAll();

    expect(result.conflicts).toBe(1);
    expect(result.errors.some((error) => error.includes('pending sync'))).toBe(true);
    expect(markSyncOperationLogConflict).toHaveBeenCalledWith(
      'op-001',
      expect.objectContaining({
        message: 'Version conflict',
      })
    );
    expect(insertPendingSyncConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        operation_id: 'op-001',
        aggregate_id: 'inv-001',
      })
    );
    expect(replaceReplicaSnapshot).not.toHaveBeenCalled();
  });

  it('applies sync-v2 delta log rows before the snapshot pull', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            changes: [
              {
                seq: 11,
                table: 'inventory_records',
                action: 'upsert',
                row: { id: 'inv-001', quantity: 8 },
                emittedAt: '2026-05-18T12:10:00.000Z',
              },
            ],
            lastServerSeq: 11,
            hasMore: false,
          },
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ data: { users: [] } }));

    await syncAll();

    expect(applyReplicaMutation).toHaveBeenCalledWith({
      type: 'replica.mutation',
      table: 'inventory_records',
      action: 'upsert',
      row: { id: 'inv-001', quantity: 8 },
      emittedAt: '2026-05-18T12:10:00.000Z',
    });
    expect(setConfig).toHaveBeenCalledWith('syncV2Cursor', '11');
  });

  it('applies realtime replica mutation events directly to the local replica', () => {
    const realtimeEvent = {
      type: 'replica.mutation' as const,
      table: 'vendors' as const,
      action: 'upsert' as const,
      row: {
        id: 'vendor-001',
        name: 'Vendor A',
      },
      emittedAt: '2026-05-18T12:00:00.000Z',
    };

    processRealtimeSyncEvent(realtimeEvent);

    expect(applyReplicaMutation).toHaveBeenCalledWith(realtimeEvent);
    expect(setConfig).toHaveBeenCalledWith('lastSyncTime', '2026-05-18T12:00:00.000Z');
  });
});

describe('queueOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue('existing-client-id');
  });

  it('adds operation to the legacy sync queue', () => {
    queueOperation('UPSERT_INVENTORY', { id: 'inv-001', quantity: 5 });

    expect(addToSyncQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'UPSERT_INVENTORY',
      })
    );
  });

  it('generates a UUID for each queued operation', () => {
    queueOperation('BOX_OPEN', { skuId: 'sku-001' });

    const call = (addToSyncQueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('uses the existing clientId from config', () => {
    queueOperation('STATE_CHANGE', { recordId: 'inv-001', newState: 'Inspected' });

    const call = (addToSyncQueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.client_id).toBe('existing-client-id');
  });
});
