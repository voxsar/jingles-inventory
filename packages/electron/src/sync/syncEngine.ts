import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  getSyncQueue,
  addToSyncQueue,
  markSyncProcessed,
  clearProcessedQueue,
  getDirtyRecords,
  markRecordSynced,
  upsertInventoryRecord,
  upsertSKU,
  upsertGRN,
  getConfig,
  setConfig,
} from '../offline/localDB';

interface SyncConfig {
  serverUrl: string;
  clientId: string;
  getToken: () => string | null;
}

let syncConfig: SyncConfig | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function configureSyncEngine(config: SyncConfig) {
  syncConfig = config;
}

export function startAutoSync(intervalMs = 30000) {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    // isOnline check is handled by the caller; always attempt sync on interval
    await syncAll();
  }, intervalMs);
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function syncAll(): Promise<{ pushed: number; pulled: number; conflicts: number; errors: string[] }> {
  const result = { pushed: 0, pulled: 0, conflicts: 0, errors: [] as string[] };

  if (!syncConfig) {
    result.errors.push('Sync not configured');
    return result;
  }

  try {
    const pushResult = await pushChanges();
    result.pushed = pushResult.pushed;
    result.conflicts = pushResult.conflicts;
    result.errors.push(...pushResult.errors);
  } catch (err: any) {
    result.errors.push(`Push failed: ${err.message}`);
  }

  try {
    const pullResult = await pullChanges();
    result.pulled = pullResult.pulled;
    result.errors.push(...pullResult.errors);
  } catch (err: any) {
    result.errors.push(`Pull failed: ${err.message}`);
  }

  return result;
}

async function pushChanges(): Promise<{ pushed: number; conflicts: number; errors: string[] }> {
  if (!syncConfig) return { pushed: 0, conflicts: 0, errors: ['Not configured'] };

  const result = { pushed: 0, conflicts: 0, errors: [] as string[] };
  const token = syncConfig.getToken();
  if (!token) { result.errors.push('Not authenticated'); return result; }

  // Push queued operations
  const queuedOps = getSyncQueue();
  if (queuedOps.length > 0) {
    try {
      const response = await axios.post(
        `${syncConfig.serverUrl}/api/sync/push`,
        { clientId: syncConfig.clientId, operations: queuedOps.map((op: any) => ({ ...op, payload: JSON.parse(op.payload) })) },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const processed = response.data.data?.processed ?? [];
      for (const item of processed) {
        if (item.status === 'Processed') {
          markSyncProcessed(item.id, 'Processed');
          result.pushed++;
        } else if (item.status === 'Conflict') {
          markSyncProcessed(item.id, 'Conflict', item.conflictNotes);
          result.conflicts++;
        } else {
          markSyncProcessed(item.id, 'Failed');
          result.errors.push(`Operation ${item.id} failed: ${item.error ?? 'Unknown'}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`Push request failed: ${err.message}`);
    }
  }

  // Push dirty inventory records
  const dirtyRecords = getDirtyRecords();
  for (const record of dirtyRecords as any[]) {
    try {
      await axios.post(
        `${syncConfig.serverUrl}/api/sync/push`,
        {
          clientId: syncConfig.clientId,
          operations: [{ operation: 'UPSERT_INVENTORY', payload: record }],
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      markRecordSynced(record.id);
      result.pushed++;
    } catch (err: any) {
      result.errors.push(`Failed to sync record ${record.id}: ${err.message}`);
    }
  }

  clearProcessedQueue();
  return result;
}

async function pullChanges(): Promise<{ pulled: number; errors: string[] }> {
  if (!syncConfig) return { pulled: 0, errors: ['Not configured'] };

  const result = { pulled: 0, errors: [] as string[] };
  const token = syncConfig.getToken();
  if (!token) { result.errors.push('Not authenticated'); return result; }

  const lastSync = getConfig('lastSyncTime');

  try {
    const response = await axios.get(
      `${syncConfig.serverUrl}/api/sync/pull`,
      {
        params: { clientId: syncConfig.clientId, since: lastSync },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const { inventoryRecords, skus, grns } = response.data.data;

    for (const record of (inventoryRecords ?? []) as any[]) {
      upsertInventoryRecord({
        id: record.id,
        sku_id: record.skuId,
        batch_id: record.batchId,
        location_id: record.locationId,
        quantity: record.quantity,
        state: record.state,
        terminal_id: record.terminalId,
        user_id: record.userId,
        version: record.version,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      });
      result.pulled++;
    }

    for (const sku of (skus ?? []) as any[]) {
      upsertSKU({
        id: sku.id,
        sku_code: sku.skuCode,
        name: sku.name,
        description: sku.description,
        category: sku.category,
        vendor_id: sku.vendorId,
        unit_of_measure: sku.unitOfMeasure,
        conversion_rules: sku.conversionRules ? JSON.stringify(sku.conversionRules) : null,
        dimensions: sku.dimensions ? JSON.stringify(sku.dimensions) : null,
        is_fragile: sku.isFragile ? 1 : 0,
        max_stack_height: sku.maxStackHeight,
        is_active: sku.isActive ? 1 : 0,
        updated_at: sku.updatedAt,
      });
    }

    for (const grn of (grns ?? []) as any[]) {
      upsertGRN({
        id: grn.id,
        supplier_id: grn.supplierId,
        invoice_reference: grn.invoiceReference,
        status: grn.status,
        notes: grn.notes,
        created_by: grn.createdBy,
        created_at: grn.createdAt,
        updated_at: grn.updatedAt,
      });
    }

    setConfig('lastSyncTime', new Date().toISOString());
  } catch (err: any) {
    result.errors.push(`Pull request failed: ${err.message}`);
  }

  return result;
}

export function queueOperation(operation: string, payload: any) {
  const clientId = getConfig('clientId') ?? uuidv4();
  setConfig('clientId', clientId);

  addToSyncQueue({
    id: uuidv4(),
    client_id: clientId,
    operation,
    payload,
  });
}
