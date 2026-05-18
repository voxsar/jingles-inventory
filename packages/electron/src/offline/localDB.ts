import fs from 'fs';
import Database from 'better-sqlite3';
import type { ReplicaMutationEvent, ReplicaTable } from '../sync/replicaEvents';
import { REPLICA_TABLES } from '../backend/replicaTables';
import {
  getDesktopDatabasePath,
  getDesktopReplicaSchemaSqlPath,
  getDesktopRuntimeRoot,
} from '../backend/runtimePaths';

let db: Database.Database;
const tableColumnCache = new Map<string, string[]>();
const tablePrimaryKeyCache = new Map<string, string[]>();

type InventoryFilters = {
  state?: string;
  skuId?: string;
  floorId?: string;
  shelfId?: string;
  boxId?: string;
  locationId?: string;
};

type UpsertOptions = {
  markDirty?: boolean;
};

export function getDB(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initLocalDB() first.');
  return db;
}

export function initLocalDB(): void {
  getDesktopRuntimeRoot();
  const dbPath = getDesktopDatabasePath();

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  bootstrapReplicaSchema();
  createAppTables();
  runMigrations();
}

function bootstrapReplicaSchema(): void {
  const database = getDB();
  const schemaSqlPath = getDesktopReplicaSchemaSqlPath();

  if (!fs.existsSync(schemaSqlPath)) {
    throw new Error(
      `[Electron] SQLite replica schema not found at ${schemaSqlPath}. Run npm run build --workspace=packages/backend first.`
    );
  }

  const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
  if (!schemaSql.trim()) {
    throw new Error(`[Electron] SQLite replica schema file is empty at ${schemaSqlPath}.`);
  }

  database.exec(schemaSql);
}

function createAppTables(): void {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_responses (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS request_sync_queue (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      content_type TEXT,
      body TEXT,
      files TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      last_error TEXT,
      attempt_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_cached_responses_updated_at ON cached_responses(updated_at);
    CREATE INDEX IF NOT EXISTS idx_request_sync_queue_status ON request_sync_queue(status, created_at);
  `);
}

function runMigrations(): void {
  const database = getDB();
  ensureColumnExists(database, 'skus', 'category', 'TEXT');
  ensureColumnExists(database, 'skus', 'synced_at', 'TEXT');

  ensureColumnExists(database, 'inventory_records', 'location_id', 'TEXT');
  ensureColumnExists(database, 'inventory_records', 'synced_at', 'TEXT');
  ensureColumnExists(database, 'inventory_records', 'dirty', 'INTEGER DEFAULT 0');

  ensureColumnExists(database, 'grns', 'synced_at', 'TEXT');
  ensureColumnExists(database, 'grns', 'dirty', 'INTEGER DEFAULT 0');
  ensureColumnExists(database, 'sync_queue', 'retry_count', 'INTEGER DEFAULT 0');
}

function ensureColumnExists(
  database: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  tableColumnCache.delete(tableName);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getTableColumns(tableName: string) {
  const cached = tableColumnCache.get(tableName);
  if (cached) {
    return cached;
  }

  const columns = getDB()
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all() as Array<{ name: string }>;
  const names = columns.map((column) => column.name);
  tableColumnCache.set(tableName, names);
  return names;
}

function getTablePrimaryKeys(tableName: string) {
  const cached = tablePrimaryKeyCache.get(tableName);
  if (cached) {
    return cached;
  }

  const columns = getDB()
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all() as Array<{ name: string; pk: number }>;
  const keyColumns = columns
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  tablePrimaryKeyCache.set(tableName, keyColumns);
  return keyColumns;
}

function normalizeReplicaValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    return JSON.stringify(value);
  }

  return value;
}

function buildInsertStatement(tableName: string, columns: string[]) {
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  const placeholders = columns.map((column) => `@${column}`).join(', ');
  return getDB().prepare(
    `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`
  );
}

function buildUpsertStatement(
  tableName: string,
  columns: string[],
  primaryKeys: string[]
) {
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  const placeholders = columns.map((column) => `@${column}`).join(', ');
  const updateColumns = columns.filter((column) => !primaryKeys.includes(column));
  const conflictClause =
    primaryKeys.length === 0
      ? ''
      : updateColumns.length === 0
        ? ` ON CONFLICT (${primaryKeys.map((column) => `"${column}"`).join(', ')}) DO NOTHING`
        : ` ON CONFLICT (${primaryKeys
            .map((column) => `"${column}"`)
            .join(', ')}) DO UPDATE SET ${updateColumns
            .map((column) => `"${column}" = excluded."${column}"`)
            .join(', ')}`;

  return getDB().prepare(
    `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})${conflictClause}`
  );
}

function buildReplicaPayload(tableName: ReplicaTable, row: Record<string, unknown>) {
  const tableColumns = new Set(getTableColumns(tableName));
  const payload = Object.fromEntries(
    Object.entries(row)
      .filter(([columnName]) => tableColumns.has(columnName))
      .map(([columnName, value]) => [columnName, normalizeReplicaValue(value)])
  ) as Record<string, unknown>;

  const importNow = new Date().toISOString();
  if (tableColumns.has('dirty') && payload.dirty === undefined) {
    payload.dirty = 0;
  }
  if (tableColumns.has('synced_at') && payload.synced_at === undefined) {
    payload.synced_at = importNow;
  }

  return payload;
}

function getReplicaKeyPayload(tableName: ReplicaTable, row: Record<string, unknown>) {
  const primaryKeys = getTablePrimaryKeys(tableName);
  if (primaryKeys.length === 0) {
    throw new Error(`Replica table ${tableName} does not define a primary key.`);
  }

  const keys = Object.fromEntries(
    primaryKeys.map((columnName) => [columnName, row[columnName]])
  );

  const missingKey = primaryKeys.find((columnName) => keys[columnName] === undefined);
  if (missingKey) {
    throw new Error(`Replica change for ${tableName} is missing primary key ${missingKey}.`);
  }

  return keys;
}

export function replaceReplicaSnapshot(snapshot: Partial<Record<string, unknown[]>>) {
  const database = getDB();
  const insertStatementCache = new Map<string, Database.Statement>();
  const importNow = new Date().toISOString();

  database.exec('PRAGMA foreign_keys = OFF');

  try {
    const transaction = database.transaction((incomingSnapshot: Partial<Record<string, unknown[]>>) => {
      for (const tableName of [...REPLICA_TABLES].reverse()) {
        database.prepare(`DELETE FROM "${tableName}"`).run();
      }

      for (const tableName of REPLICA_TABLES) {
        const rows = incomingSnapshot[tableName];
        if (!Array.isArray(rows) || rows.length === 0) {
          continue;
        }

        const tableColumns = new Set(getTableColumns(tableName));
        let statement = insertStatementCache.get(tableName);

        for (const row of rows) {
          if (!isPlainObject(row)) {
            continue;
          }

          const payload = Object.fromEntries(
            Object.entries(row)
              .filter(([columnName]) => tableColumns.has(columnName))
              .map(([columnName, value]) => [columnName, normalizeReplicaValue(value)])
          );
          const payloadColumns = Object.keys(payload);
          if (payloadColumns.length === 0) {
            continue;
          }

          if (!statement) {
            statement = buildInsertStatement(tableName, payloadColumns);
            insertStatementCache.set(tableName, statement);
          }

          statement.run(payload);
        }
      }

      database
        .prepare(`UPDATE skus SET synced_at = ?, category = COALESCE(category, '')`)
        .run(importNow);
      database
        .prepare(`UPDATE inventory_records SET dirty = 0, synced_at = ?`)
        .run(importNow);
      database
        .prepare(`UPDATE grns SET dirty = 0, synced_at = ?`)
        .run(importNow);
    });

    transaction(snapshot);
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}

export function applyReplicaMutation(change: ReplicaMutationEvent) {
  const database = getDB();

  if (!isPlainObject(change.row)) {
    throw new Error(`Replica mutation for ${change.table} did not include a row payload.`);
  }

  const keyPayload = getReplicaKeyPayload(change.table, change.row);

  const transaction = database.transaction(() => {
    if (change.action === 'delete') {
      const whereClause = Object.keys(keyPayload)
        .map((columnName) => `"${columnName}" = @${columnName}`)
        .join(' AND ');
      database.prepare(`DELETE FROM "${change.table}" WHERE ${whereClause}`).run(keyPayload);
      return;
    }

    const payload = buildReplicaPayload(change.table, change.row);
    const payloadColumns = Object.keys(payload);
    if (payloadColumns.length === 0) {
      return;
    }

    const statement = buildUpsertStatement(
      change.table,
      payloadColumns,
      getTablePrimaryKeys(change.table)
    );
    statement.run(payload);
  });

  transaction();
}

function normalizeInventoryRecordPayload(record: any, markDirty: boolean) {
  const now = new Date().toISOString();

  return {
    id: record.id,
    sku_id: record.sku_id ?? record.skuId,
    variant_id: record.variant_id ?? record.variantId ?? null,
    batch_id: record.batch_id ?? record.batchId ?? null,
    location_id:
      record.location_id ??
      record.locationId ??
      record.box_id ??
      record.boxId ??
      record.shelf_id ??
      record.shelfId ??
      record.floor_id ??
      record.floorId ??
      null,
    floor_id: record.floor_id ?? record.floorId ?? null,
    shelf_id: record.shelf_id ?? record.shelfId ?? null,
    box_id: record.box_id ?? record.boxId ?? null,
    quantity: typeof record.quantity === 'number' ? record.quantity : Number(record.quantity ?? 0),
    state: record.state,
    terminal_id: record.terminal_id ?? record.terminalId ?? null,
    user_id: record.user_id ?? record.userId ?? null,
    version: record.version ?? 1,
    created_at: record.created_at ?? record.createdAt ?? now,
    updated_at: record.updated_at ?? record.updatedAt ?? now,
    synced_at: markDirty ? null : record.synced_at ?? record.syncedAt ?? now,
    dirty: markDirty ? 1 : 0,
  };
}

function normalizeSKUPayload(sku: any) {
  return {
    id: sku.id,
    sku_code: sku.sku_code ?? sku.skuCode,
    name: sku.name,
    description: sku.description ?? null,
    category: sku.category ?? sku.categoryName ?? null,
    category_id: sku.category_id ?? sku.categoryId ?? null,
    vendor_id: sku.vendor_id ?? sku.vendorId ?? null,
    unit_of_measure: sku.unit_of_measure ?? sku.unitOfMeasure,
    unit_of_measure_id: sku.unit_of_measure_id ?? sku.unitOfMeasureId ?? null,
    conversion_rules:
      typeof sku.conversion_rules === 'string'
        ? sku.conversion_rules
        : sku.conversionRules
          ? JSON.stringify(sku.conversionRules)
          : null,
    dimensions:
      typeof sku.dimensions === 'string'
        ? sku.dimensions
        : sku.dimensions
          ? JSON.stringify(sku.dimensions)
          : null,
    is_fragile: sku.is_fragile ?? (sku.isFragile ? 1 : 0),
    max_stack_height: sku.max_stack_height ?? sku.maxStackHeight ?? null,
    low_stock_threshold: sku.low_stock_threshold ?? sku.lowStockThreshold ?? null,
    is_active: sku.is_active ?? (sku.isActive === false ? 0 : 1),
    updated_at: sku.updated_at ?? sku.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeGRNPayload(grn: any, markDirty: boolean) {
  const now = new Date().toISOString();

  return {
    id: grn.id,
    supplier_id: grn.supplier_id ?? grn.supplierId,
    floor_id: grn.floor_id ?? grn.floorId ?? null,
    shelf_id: grn.shelf_id ?? grn.shelfId ?? null,
    invoice_reference: grn.invoice_reference ?? grn.invoiceReference ?? null,
    supplier_invoice_date: grn.supplier_invoice_date ?? grn.supplierInvoiceDate ?? null,
    expected_delivery_date: grn.expected_delivery_date ?? grn.expectedDeliveryDate ?? null,
    delivery_date: grn.delivery_date ?? grn.deliveryDate ?? null,
    status: grn.status ?? 'Draft',
    notes: grn.notes ?? null,
    created_by: grn.created_by ?? grn.createdBy ?? null,
    created_at: grn.created_at ?? grn.createdAt ?? now,
    updated_at: grn.updated_at ?? grn.updatedAt ?? now,
    synced_at: markDirty ? null : grn.synced_at ?? grn.syncedAt ?? now,
    dirty: markDirty ? 1 : 0,
  };
}

function parseCachedPayload<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// Inventory Records CRUD
export function getInventoryRecords(filters: InventoryFilters = {}) {
  const database = getDB();
  let query = `
    SELECT ir.*, s.sku_code, s.name as sku_name
    FROM inventory_records ir
    LEFT JOIN skus s ON ir.sku_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.state) { query += ' AND ir.state = ?'; params.push(filters.state); }
  if (filters.skuId) { query += ' AND ir.sku_id = ?'; params.push(filters.skuId); }
  if (filters.floorId) { query += ' AND ir.floor_id = ?'; params.push(filters.floorId); }
  if (filters.shelfId) { query += ' AND ir.shelf_id = ?'; params.push(filters.shelfId); }
  if (filters.boxId) { query += ' AND ir.box_id = ?'; params.push(filters.boxId); }
  if (filters.locationId) { query += ' AND ir.location_id = ?'; params.push(filters.locationId); }

  query += ' ORDER BY ir.updated_at DESC';
  return database.prepare(query).all(...params);
}

export function upsertInventoryRecord(record: any, options: UpsertOptions = {}) {
  const database = getDB();
  const payload = normalizeInventoryRecordPayload(record, options.markDirty ?? true);
  const stmt = database.prepare(`
    INSERT INTO inventory_records (
      id,
      sku_id,
      variant_id,
      batch_id,
      location_id,
      floor_id,
      shelf_id,
      box_id,
      quantity,
      state,
      terminal_id,
      user_id,
      version,
      created_at,
      updated_at,
      synced_at,
      dirty
    )
    VALUES (
      @id,
      @sku_id,
      @variant_id,
      @batch_id,
      @location_id,
      @floor_id,
      @shelf_id,
      @box_id,
      @quantity,
      @state,
      @terminal_id,
      @user_id,
      @version,
      @created_at,
      @updated_at,
      @synced_at,
      @dirty
    )
    ON CONFLICT(id) DO UPDATE SET
      variant_id = excluded.variant_id,
      batch_id = excluded.batch_id,
      location_id = excluded.location_id,
      floor_id = excluded.floor_id,
      shelf_id = excluded.shelf_id,
      box_id = excluded.box_id,
      quantity = excluded.quantity,
      state = excluded.state,
      terminal_id = excluded.terminal_id,
      user_id = excluded.user_id,
      version = excluded.version,
      updated_at = excluded.updated_at,
      synced_at = excluded.synced_at,
      dirty = excluded.dirty
  `);
  return stmt.run(payload);
}

// SKUs CRUD
export function getSKUs() {
  return getDB().prepare('SELECT * FROM skus WHERE is_active = 1 ORDER BY name').all();
}

export function upsertSKU(sku: any) {
  const database = getDB();
  const payload = normalizeSKUPayload(sku);
  const stmt = database.prepare(`
    INSERT INTO skus (
      id,
      sku_code,
      name,
      description,
      category,
      category_id,
      vendor_id,
      unit_of_measure,
      unit_of_measure_id,
      conversion_rules,
      dimensions,
      is_fragile,
      max_stack_height,
      low_stock_threshold,
      is_active,
      updated_at
    )
    VALUES (
      @id,
      @sku_code,
      @name,
      @description,
      @category,
      @category_id,
      @vendor_id,
      @unit_of_measure,
      @unit_of_measure_id,
      @conversion_rules,
      @dimensions,
      @is_fragile,
      @max_stack_height,
      @low_stock_threshold,
      @is_active,
      @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      category_id = excluded.category_id,
      vendor_id = excluded.vendor_id,
      unit_of_measure = excluded.unit_of_measure,
      unit_of_measure_id = excluded.unit_of_measure_id,
      conversion_rules = excluded.conversion_rules,
      dimensions = excluded.dimensions,
      is_fragile = excluded.is_fragile,
      max_stack_height = excluded.max_stack_height,
      low_stock_threshold = excluded.low_stock_threshold,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);
  return stmt.run(payload);
}

// GRNs CRUD
export function getGRNs(filters: { status?: string; floorId?: string } = {}) {
  const database = getDB();
  let query = 'SELECT * FROM grns WHERE 1=1';
  const params: any[] = [];
  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  if (filters.floorId) { query += ' AND floor_id = ?'; params.push(filters.floorId); }
  query += ' ORDER BY created_at DESC';
  return database.prepare(query).all(...params);
}

export function upsertGRN(grn: any, options: UpsertOptions = {}) {
  const database = getDB();
  const payload = normalizeGRNPayload(grn, options.markDirty ?? true);
  const stmt = database.prepare(`
    INSERT INTO grns (
      id,
      supplier_id,
      floor_id,
      shelf_id,
      invoice_reference,
      supplier_invoice_date,
      expected_delivery_date,
      delivery_date,
      status,
      notes,
      created_by,
      created_at,
      updated_at,
      dirty,
      synced_at
    )
    VALUES (
      @id,
      @supplier_id,
      @floor_id,
      @shelf_id,
      @invoice_reference,
      @supplier_invoice_date,
      @expected_delivery_date,
      @delivery_date,
      @status,
      @notes,
      @created_by,
      @created_at,
      @updated_at,
      @dirty,
      @synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      supplier_id = excluded.supplier_id,
      floor_id = excluded.floor_id,
      shelf_id = excluded.shelf_id,
      invoice_reference = excluded.invoice_reference,
      supplier_invoice_date = excluded.supplier_invoice_date,
      expected_delivery_date = excluded.expected_delivery_date,
      delivery_date = excluded.delivery_date,
      status = excluded.status,
      notes = excluded.notes,
      created_by = excluded.created_by,
      updated_at = excluded.updated_at,
      dirty = excluded.dirty,
      synced_at = excluded.synced_at
  `);
  return stmt.run(payload);
}

// Sync Queue CRUD
export function getSyncQueue() {
  return getDB().prepare("SELECT * FROM sync_queue WHERE status IN ('Pending', 'Failed') ORDER BY created_at ASC").all();
}

export function addToSyncQueue(operation: any) {
  const database = getDB();
  const stmt = database.prepare(`
    INSERT INTO sync_queue (id, client_id, operation, payload, status, created_at)
    VALUES (@id, @client_id, @operation, @payload, 'Pending', datetime('now'))
  `);
  return stmt.run({ ...operation, payload: typeof operation.payload === 'string' ? operation.payload : JSON.stringify(operation.payload) });
}

export function markSyncProcessed(id: string, status: 'Processed' | 'Failed' | 'Conflict', conflictNotes?: string) {
  const database = getDB();
  database.prepare(`
    UPDATE sync_queue SET status = ?, processed_at = datetime('now'), conflict_notes = ? WHERE id = ?
  `).run(status, conflictNotes ?? null, id);
}

export function clearProcessedQueue() {
  getDB().prepare("DELETE FROM sync_queue WHERE status = 'Processed'").run();
}

export function getDirtyRecords() {
  return getDB().prepare('SELECT * FROM inventory_records WHERE dirty = 1').all();
}

export function markRecordSynced(id: string) {
  getDB().prepare("UPDATE inventory_records SET dirty = 0, synced_at = datetime('now') WHERE id = ?").run(id);
}

export function getPendingRequestSyncQueue() {
  return getDB()
    .prepare(`
      SELECT *
      FROM request_sync_queue
      WHERE status = 'Pending'
      ORDER BY created_at ASC
    `)
    .all();
}

export function markRequestSyncProcessed(id: string) {
  getDB()
    .prepare(`
      UPDATE request_sync_queue
      SET status = 'Processed',
          processed_at = datetime('now'),
          last_error = NULL
      WHERE id = ?
    `)
    .run(id);
}

export function markRequestSyncFailed(id: string, error: string, keepPending = false) {
  getDB()
    .prepare(`
      UPDATE request_sync_queue
      SET status = ?,
          processed_at = CASE WHEN ? THEN processed_at ELSE datetime('now') END,
          last_error = ?,
          attempt_count = attempt_count + 1
      WHERE id = ?
    `)
    .run(keepPending ? 'Pending' : 'Failed', keepPending ? 1 : 0, error, id);
}

export function clearProcessedRequestSyncQueue() {
  getDB().prepare(`DELETE FROM request_sync_queue WHERE status = 'Processed'`).run();
}

// Config key-value store (replaces localStorage for main-process persistence)
export function getConfig(key: string): string | null {
  const row = getDB().prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setConfig(key: string, value: string): void {
  getDB().prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function deleteConfig(key: string): void {
  getDB().prepare('DELETE FROM config WHERE key = ?').run(key);
}

export function getCachedResponse<T = unknown>(key: string): T | null {
  const row = getDB()
    .prepare('SELECT payload FROM cached_responses WHERE key = ?')
    .get(key) as { payload: string } | undefined;

  if (!row) {
    return null;
  }

  return parseCachedPayload<T>(row.payload);
}

export function setCachedResponse(key: string, payload: unknown): void {
  getDB().prepare(`
    INSERT INTO cached_responses (key, payload, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(payload));
}

export function clearCachedResponse(key: string): void {
  getDB().prepare('DELETE FROM cached_responses WHERE key = ?').run(key);
}

export function clearCachedResponsesByPrefix(prefix: string): void {
  getDB().prepare('DELETE FROM cached_responses WHERE key LIKE ?').run(`${prefix}%`);
}

