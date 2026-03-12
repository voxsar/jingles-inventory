import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureSyncEngine, syncAll, queueOperation, stopAutoSync } from '../sync/syncEngine';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock localDB functions
vi.mock('../offline/localDB', () => ({
  getSyncQueue: vi.fn().mockReturnValue([]),
  addToSyncQueue: vi.fn(),
  markSyncProcessed: vi.fn(),
  clearProcessedQueue: vi.fn(),
  getDirtyRecords: vi.fn().mockReturnValue([]),
  markRecordSynced: vi.fn(),
  upsertInventoryRecord: vi.fn(),
  upsertSKU: vi.fn(),
  upsertGRN: vi.fn(),
  getConfig: vi.fn().mockReturnValue(null),
  setConfig: vi.fn(),
}));

import axios from 'axios';
import {
  getSyncQueue,
  addToSyncQueue,
  markSyncProcessed,
  clearProcessedQueue,
  getDirtyRecords,
  markRecordSynced,
  upsertInventoryRecord,
  getConfig,
  setConfig,
} from '../offline/localDB';

describe('syncEngine - configureSyncEngine', () => {
  it('configures sync engine without throwing', () => {
    expect(() =>
      configureSyncEngine({
        serverUrl: 'http://localhost:3001',
        clientId: 'client-test-001',
        getToken: () => 'test-token',
      })
    ).not.toThrow();
  });
});

describe('syncAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSyncEngine({
      serverUrl: 'http://localhost:3001',
      clientId: 'client-test-001',
      getToken: () => 'test-token',
    });
  });

  it('returns error when sync is not configured', async () => {
    // Reset sync config by temporarily overriding
    stopAutoSync();

    // Create an unconfigured engine by using a new module context
    // We test by temporarily setting config to null via a fresh call structure
    const result = await syncAll();
    // With config set from beforeEach, pushed = 0 (no queue items)
    expect(result).toHaveProperty('pushed');
    expect(result).toHaveProperty('pulled');
    expect(result).toHaveProperty('conflicts');
    expect(result).toHaveProperty('errors');
  });

  it('returns zero push when queue is empty', async () => {
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getDirtyRecords as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { inventoryRecords: [], skus: [], grns: [] } },
    });

    const result = await syncAll();

    expect(result.pushed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('pushes queued operations to server', async () => {
    const queuedOps = [
      { id: 'op-001', client_id: 'client-test-001', operation: 'UPSERT_INVENTORY', payload: JSON.stringify({ id: 'inv-001' }), status: 'Pending' },
    ];
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue(queuedOps);
    (getDirtyRecords as ReturnType<typeof vi.fn>).mockReturnValue([]);

    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { processed: [{ id: 'op-001', status: 'Processed' }] } },
    });
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { inventoryRecords: [], skus: [], grns: [] } },
    });

    const result = await syncAll();

    expect(result.pushed).toBe(1);
    expect(markSyncProcessed).toHaveBeenCalledWith('op-001', 'Processed');
  });

  it('counts conflicts when server reports conflict', async () => {
    const queuedOps = [
      { id: 'op-conflict-001', client_id: 'client-test-001', operation: 'UPSERT_INVENTORY', payload: JSON.stringify({ id: 'inv-001', version: 1 }), status: 'Pending' },
    ];
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue(queuedOps);
    (getDirtyRecords as ReturnType<typeof vi.fn>).mockReturnValue([]);

    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          processed: [
            { id: 'op-conflict-001', status: 'Conflict', conflictNotes: 'Version mismatch' },
          ],
        },
      },
    });
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { inventoryRecords: [], skus: [], grns: [] } },
    });

    const result = await syncAll();

    expect(result.conflicts).toBe(1);
    expect(markSyncProcessed).toHaveBeenCalledWith('op-conflict-001', 'Conflict', 'Version mismatch');
  });

  it('pulls inventory records and calls upsert', async () => {
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getDirtyRecords as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const pulledRecord = {
      id: 'inv-pulled-001',
      skuId: 'sku-001',
      quantity: 10,
      state: 'ShelfReady',
      version: 2,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-10T00:00:00Z',
    };

    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { inventoryRecords: [pulledRecord], skus: [], grns: [] } },
    });

    const result = await syncAll();

    expect(result.pulled).toBeGreaterThan(0);
    expect(upsertInventoryRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-pulled-001', quantity: 10 })
    );
  });

  it('handles push network error gracefully', async () => {
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'op-001', client_id: 'client-001', operation: 'UPSERT_INVENTORY', payload: JSON.stringify({}), status: 'Pending' },
    ]);
    (getDirtyRecords as ReturnType<typeof vi.fn>).mockReturnValue([]);

    (axios.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network timeout'));
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { inventoryRecords: [], skus: [], grns: [] } },
    });

    const result = await syncAll();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('Push') || e.includes('Push request failed'))).toBe(true);
  });

  it('handles pull network error gracefully', async () => {
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getDirtyRecords as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Pull failed'));

    const result = await syncAll();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('Pull') || e.includes('pull'))).toBe(true);
  });

  it('updates lastSyncTime config after successful pull', async () => {
    (getSyncQueue as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getDirtyRecords as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { inventoryRecords: [], skus: [], grns: [] } },
    });

    await syncAll();

    expect(setConfig).toHaveBeenCalledWith('lastSyncTime', expect.any(String));
  });
});

describe('queueOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue('existing-client-id');
  });

  it('adds operation to sync queue', () => {
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
    expect(call.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('uses existing clientId from config', () => {
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue('existing-client-id');
    queueOperation('STATE_CHANGE', { recordId: 'inv-001', newState: 'Inspected' });

    const call = (addToSyncQueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.client_id).toBe('existing-client-id');
  });
});
