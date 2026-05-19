import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureSyncEngine,
  getSyncHealth,
  getSyncOutbox,
  processRealtimeSyncEvent,
  resolveSyncConflict,
  stopAutoSync,
  subscribeSyncHealth,
  syncAll,
} from '../sync/syncEngine';

vi.mock('../offline/localDB', () => ({
  FAILED_PERMANENT_STATUS: 'failed_permanent',
  applyReplicaMutation: vi.fn(),
  clearProcessedRequestSyncQueue: vi.fn(),
  deleteInventoryRecord: vi.fn(),
  getConfig: vi.fn().mockReturnValue(null),
  getPendingSyncConflicts: vi.fn().mockReturnValue([]),
  getPendingSyncConflictDetailById: vi.fn(),
  getPendingSyncConflictDetails: vi.fn().mockReturnValue([]),
  getPendingSyncOperationLogs: vi.fn().mockReturnValue([]),
  getPendingRequestSyncQueue: vi.fn().mockReturnValue([]),
  getSyncOutboxSummary: vi.fn().mockReturnValue({
    pending: 0,
    conflicts: 0,
    failedPermanent: 0,
  }),
  insertPendingSyncConflict: vi.fn(),
  markRequestSyncFailed: vi.fn(),
  markRequestSyncProcessed: vi.fn(),
  markSyncConflictResolved: vi.fn(),
  markSyncOperationLogConflict: vi.fn(),
  markSyncOperationLogFailed: vi.fn(),
  markSyncOperationLogProcessed: vi.fn(),
  pruneFailedPermanentOutbox: vi.fn().mockReturnValue(0),
  replaceReplicaSnapshot: vi.fn(),
  setConfig: vi.fn(),
  upsertInventoryRecord: vi.fn(),
}));

import {
  FAILED_PERMANENT_STATUS,
  applyReplicaMutation,
  deleteInventoryRecord,
  getConfig,
  getPendingSyncConflicts,
  getPendingSyncConflictDetailById,
  getPendingSyncConflictDetails,
  getPendingSyncOperationLogs,
  getPendingRequestSyncQueue,
  getSyncOutboxSummary,
  insertPendingSyncConflict,
  markRequestSyncFailed,
  markRequestSyncProcessed,
  markSyncConflictResolved,
  markSyncOperationLogConflict,
  markSyncOperationLogFailed,
  markSyncOperationLogProcessed,
  pruneFailedPermanentOutbox,
  replaceReplicaSnapshot,
  setConfig,
  upsertInventoryRecord,
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

function createHtmlResponse(html: string, status = 500) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(html),
    json: vi.fn().mockRejectedValue(new Error('Response body is not JSON')),
  };
}

describe('syncEngine', () => {
  beforeEach(() => {
    stopAutoSync();
    fetchMock.mockReset();
    (applyReplicaMutation as ReturnType<typeof vi.fn>).mockReset();
    (deleteInventoryRecord as ReturnType<typeof vi.fn>).mockReset();
    (getConfig as ReturnType<typeof vi.fn>).mockReset();
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>).mockReset();
    (getPendingSyncConflicts as ReturnType<typeof vi.fn>).mockReset();
    (getPendingSyncConflictDetailById as ReturnType<typeof vi.fn>).mockReset();
    (getPendingSyncConflictDetails as ReturnType<typeof vi.fn>).mockReset();
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>).mockReset();
    (getSyncOutboxSummary as ReturnType<typeof vi.fn>).mockReset();
    (insertPendingSyncConflict as ReturnType<typeof vi.fn>).mockReset();
    (markRequestSyncFailed as ReturnType<typeof vi.fn>).mockReset();
    (markRequestSyncProcessed as ReturnType<typeof vi.fn>).mockReset();
    (markSyncConflictResolved as ReturnType<typeof vi.fn>).mockReset();
    (markSyncOperationLogConflict as ReturnType<typeof vi.fn>).mockReset();
    (markSyncOperationLogFailed as ReturnType<typeof vi.fn>).mockReset();
    (markSyncOperationLogProcessed as ReturnType<typeof vi.fn>).mockReset();
    (pruneFailedPermanentOutbox as ReturnType<typeof vi.fn>).mockReset();
    (replaceReplicaSnapshot as ReturnType<typeof vi.fn>).mockReset();
    (setConfig as ReturnType<typeof vi.fn>).mockReset();
    (upsertInventoryRecord as ReturnType<typeof vi.fn>).mockReset();

    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getPendingSyncConflicts as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getPendingSyncConflictDetails as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getSyncOutboxSummary as ReturnType<typeof vi.fn>).mockReturnValue({
      pending: 0,
      conflicts: 0,
      failedPermanent: 0,
    });
    (pruneFailedPermanentOutbox as ReturnType<typeof vi.fn>).mockReturnValue(0);

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

  it('returns pending sync conflicts in the outbox snapshot', () => {
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'op-002', status: 'Pending' },
    ]);
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'req-001', status: 'Pending' },
    ]);
    (getPendingSyncConflictDetails as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 'conflict-001',
        operation_id: 'op-001',
        client_id: 'desktop-001',
        aggregate_type: 'inventory_record',
        aggregate_id: 'inv-001',
        status: 'Pending',
        local_payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
        server_payload: JSON.stringify({ id: 'inv-001', quantity: 12, version: 5 }),
        resolution_payload: null,
        created_at: '2026-05-19T09:00:00.000Z',
        resolved_at: null,
        operation_type: 'inventory.update',
        operation_status: 'Conflict',
        operation_base_version: 3,
        operation_payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
        operation_last_error: 'Version conflict',
        operation_conflict_data: JSON.stringify({
          code: 'version_mismatch',
          message: 'Version conflict',
        }),
      },
    ]);

    const snapshot = getSyncOutbox();

    expect(snapshot.summary).toEqual({
      syncOperationCount: 1,
      requestQueueCount: 1,
      conflictCount: 1,
      totalCount: 3,
    });
    expect(snapshot.conflicts[0]).toMatchObject({
      id: 'conflict-001',
      aggregateId: 'inv-001',
      conflictCode: 'version_mismatch',
      conflictMessage: 'Version conflict',
      localPayload: { id: 'inv-001', quantity: 8 },
      serverPayload: { id: 'inv-001', quantity: 12, version: 5 },
    });
  });

  it('returns a sync health snapshot with outbox counts and cursor lag', () => {
    (getConfig as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'syncV2Cursor') {
        return '4';
      }

      if (key === 'syncV2LastServerSeq') {
        return '9';
      }

      return null;
    });
    (getSyncOutboxSummary as ReturnType<typeof vi.fn>).mockReturnValue({
      pending: 3,
      conflicts: 2,
      failedPermanent: 1,
    });
    configureSyncEngine({
      serverUrl: 'http://localhost:3001',
      clientId: 'client-test-001',
      getToken: () => 'test-token',
    });

    const health = getSyncHealth();

    expect(health).toMatchObject({
      pendingCount: 3,
      conflictCount: 2,
      failedPermanentCount: 1,
      cursorLag: 5,
      localCursor: 4,
      latestServerSeq: 9,
      running: false,
    });
  });

  it('publishes sync health updates while a sync run is active', async () => {
    let resolveLogFetch: ((value: unknown) => void) | undefined;
    fetchMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveLogFetch = resolve;
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ data: { users: [] } }));

    const listener = vi.fn();
    const unsubscribe = subscribeSyncHealth(listener);

    const syncPromise = syncAll({ forcePull: true });
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        running: true,
        progress: expect.objectContaining({
          label: expect.any(String),
          percent: expect.any(Number),
        }),
      })
    );

    resolveLogFetch?.(
      createJsonResponse({
        data: {
          changes: [],
          lastServerSeq: 0,
          hasMore: false,
        },
      })
    );

    await syncPromise;

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        running: false,
        lastSuccessfulSyncAt: expect.any(String),
        progress: null,
      })
    );

    unsubscribe();
  });

  it('keeps the local version by replaying the change and marking the conflict processed', async () => {
    (getPendingSyncConflictDetailById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'conflict-001',
      operation_id: 'op-001',
      client_id: 'desktop-001',
      aggregate_type: 'inventory_record',
      aggregate_id: 'inv-001',
      status: 'Pending',
      local_payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
      server_payload: JSON.stringify({ id: 'inv-001', quantity: 12, version: 5 }),
      resolution_payload: null,
      created_at: '2026-05-19T09:00:00.000Z',
      resolved_at: null,
      operation_type: 'inventory.update',
      operation_status: 'Conflict',
      operation_base_version: 3,
      operation_payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
      operation_last_error: 'Version conflict',
      operation_conflict_data: JSON.stringify({
        code: 'version_mismatch',
        message: 'Version conflict',
      }),
    });

    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 'inv-001' } }))
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { id: 'inv-001', quantity: 8, version: 6 },
        })
      );

    const result = await resolveSyncConflict('conflict-001', 'keep_local');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/inventory/inv-001',
      expect.objectContaining({
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/api/inventory/inv-001',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(upsertInventoryRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-001', version: 6 }),
      { markDirty: false }
    );
    expect(markSyncOperationLogProcessed).toHaveBeenCalledWith('op-001', null);
    expect(markSyncConflictResolved).toHaveBeenCalledWith(
      'conflict-001',
      expect.objectContaining({
        resolution: 'keep_local',
        operationStatus: 'Processed',
      })
    );
    expect(result).toEqual({
      conflictId: 'conflict-001',
      operationId: 'op-001',
      resolution: 'keep_local',
      operationStatus: 'Processed',
      aggregateId: 'inv-001',
    });
  });

  it('keeps the server version by refreshing the entity and marking the op failed permanent', async () => {
    (getPendingSyncConflictDetailById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'conflict-001',
      operation_id: 'op-001',
      client_id: 'desktop-001',
      aggregate_type: 'inventory_record',
      aggregate_id: 'inv-001',
      status: 'Pending',
      local_payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
      server_payload: JSON.stringify({ id: 'inv-001', quantity: 12, version: 5 }),
      resolution_payload: null,
      created_at: '2026-05-19T09:00:00.000Z',
      resolved_at: null,
      operation_type: 'inventory.update',
      operation_status: 'Conflict',
      operation_base_version: 3,
      operation_payload: JSON.stringify({ id: 'inv-001', quantity: 8 }),
      operation_last_error: 'Version conflict',
      operation_conflict_data: JSON.stringify({
        code: 'version_mismatch',
        message: 'Version conflict',
      }),
    });

    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
        data: { id: 'inv-001', quantity: 12, version: 5 },
      })
    );

    const result = await resolveSyncConflict('conflict-001', 'keep_server');

    expect(upsertInventoryRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-001', quantity: 12 }),
      { markDirty: false }
    );
    expect(deleteInventoryRecord).not.toHaveBeenCalled();
    expect(markSyncOperationLogFailed).toHaveBeenCalledWith(
      'op-001',
      'Resolved by keeping the server version.',
      'permanent'
    );
    expect(markSyncConflictResolved).toHaveBeenCalledWith(
      'conflict-001',
      expect.objectContaining({
        resolution: 'keep_server',
        operationStatus: FAILED_PERMANENT_STATUS,
      })
    );
    expect(result).toEqual({
      conflictId: 'conflict-001',
      operationId: 'op-001',
      resolution: 'keep_server',
      operationStatus: FAILED_PERMANENT_STATUS,
      aggregateId: 'inv-001',
    });
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

  it('falls back to snapshot-only sync when the host does not expose /api/sync/log', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createHtmlResponse(
          '<!DOCTYPE html><html><body><pre>Cannot GET /api/sync/log</pre></body></html>',
          404
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            users: [{ id: 'user-001', email: 'admin@test.com', role: 'Admin', password_hash: '' }],
            skus: [{ id: 'sku-001', sku_code: 'SKU-001' }],
          },
        })
      );

    const result = await syncAll({ forcePull: true });

    expect(result.errors).toEqual([]);
    expect(result.pulled).toBe(2);
    expect(replaceReplicaSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        users: expect.any(Array),
        skus: expect.any(Array),
      })
    );
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
    expect(markRequestSyncFailed).toHaveBeenCalledWith('req-001', 'Network timeout', 'retry');
    expect(replaceReplicaSnapshot).not.toHaveBeenCalled();
  });

  it('marks non-retryable request replay failures as failed_permanent and still pulls', async () => {
    (getPendingRequestSyncQueue as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          id: 'req-001',
          method: 'POST',
          path: '/api/vendors',
          content_type: 'application/json',
          body: JSON.stringify({ name: '' }),
          files: JSON.stringify([]),
        },
      ])
      .mockReturnValueOnce([]);

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({ error: 'Vendor name is required' }, 400)
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

    expect(markRequestSyncFailed).toHaveBeenCalledWith(
      'req-001',
      'HTTP 400: Vendor name is required',
      'permanent'
    );
    expect(result.errors.some((error) => error.includes('Vendor name is required'))).toBe(true);
    expect(replaceReplicaSnapshot).toHaveBeenCalled();
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

  it('marks terminal sync-v2 failures as failed_permanent and still pulls when the queue is clear', async () => {
    (getPendingSyncOperationLogs as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([
        {
          id: 'op-001',
          client_id: 'client-test-001',
          op_type: 'inventory.update',
          aggregate_id: 'inv-001',
          idempotency_key: 'idem-001',
          payload: JSON.stringify({ id: 'inv-001', quantity: -1 }),
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
                status: 'Failed',
                error: 'Quantity must be non-negative',
              },
            ],
          },
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

    expect(markSyncOperationLogFailed).toHaveBeenCalledWith(
      'op-001',
      'Quantity must be non-negative',
      'permanent'
    );
    expect(result.errors.some((error) => error.includes('Quantity must be non-negative'))).toBe(true);
    expect(replaceReplicaSnapshot).toHaveBeenCalled();
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

  it('applies status_options delta rows through the sync-v2 cursor pull', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            changes: [
              {
                seq: 15,
                table: 'status_options',
                action: 'upsert',
                row: {
                  id: 'status-001',
                  entity_type: 'inventory',
                  value: 'ShelfReady',
                  label: 'Shelf Ready',
                  special_key: 'INVENTORY_SHELF_READY',
                  server_seq: 15,
                  deleted_at: null,
                },
                emittedAt: '2026-05-18T12:15:00.000Z',
              },
            ],
            lastServerSeq: 15,
            hasMore: false,
          },
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ data: { users: [] } }));

    await syncAll();

    expect(applyReplicaMutation).toHaveBeenCalledWith({
      type: 'replica.mutation',
      table: 'status_options',
      action: 'upsert',
      row: {
        id: 'status-001',
        entity_type: 'inventory',
        value: 'ShelfReady',
        label: 'Shelf Ready',
        special_key: 'INVENTORY_SHELF_READY',
        server_seq: 15,
        deleted_at: null,
      },
      emittedAt: '2026-05-18T12:15:00.000Z',
    });
    expect(setConfig).toHaveBeenCalledWith('syncV2Cursor', '15');
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
