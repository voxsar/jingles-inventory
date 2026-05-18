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
  getPendingRequestSyncQueue: vi.fn().mockReturnValue([]),
  getSyncQueue: vi.fn().mockReturnValue([]),
  markRequestSyncFailed: vi.fn(),
  markRequestSyncProcessed: vi.fn(),
  markSyncProcessed: vi.fn(),
  replaceReplicaSnapshot: vi.fn(),
  setConfig: vi.fn(),
}));

import {
  addToSyncQueue,
  applyReplicaMutation,
  getConfig,
  getPendingRequestSyncQueue,
  getSyncQueue,
  markRequestSyncFailed,
  markRequestSyncProcessed,
  replaceReplicaSnapshot,
  setConfig,
} from '../offline/localDB';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('syncEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopAutoSync();
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          users: [{ id: 'user-001', email: 'admin@test.com', role: 'Admin', password_hash: '' }],
          skus: [{ id: 'sku-001', sku_code: 'SKU-001' }],
        },
      }),
    });

    const result = await syncAll();

    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(2);
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
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { users: [], vendors: [] } }),
      });

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
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { processed: [{ id: 'legacy-001', status: 'Processed' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { users: [] } }),
      });

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
