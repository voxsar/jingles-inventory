import path from 'path';
import { app } from 'electron';
import Database from 'better-sqlite3';

let db: Database.Database;

export function getDB(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initLocalDB() first.');
  return db;
}

export function initLocalDB(): void {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'jingles-inventory.sqlite');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
}

function createTables(): void {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      vendor_id TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skus (
      id TEXT PRIMARY KEY,
      sku_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      vendor_id TEXT,
      unit_of_measure TEXT NOT NULL,
      conversion_rules TEXT,
      dimensions TEXT,
      is_fragile INTEGER DEFAULT 0,
      max_stack_height REAL,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      floor TEXT NOT NULL,
      section TEXT NOT NULL,
      shelf TEXT NOT NULL,
      zone TEXT,
      capacity_cubic_cm REAL,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_records (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL,
      batch_id TEXT,
      location_id TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      source_event_id TEXT,
      terminal_id TEXT,
      user_id TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT,
      dirty INTEGER DEFAULT 0,
      FOREIGN KEY (sku_id) REFERENCES skus(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      parent_entity_id TEXT,
      quantity_delta INTEGER,
      before_quantity INTEGER,
      after_quantity INTEGER,
      reason_code TEXT,
      user_id TEXT,
      terminal_id TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      override_flag INTEGER DEFAULT 0,
      metadata TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS grns (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      invoice_reference TEXT,
      supplier_invoice_date TEXT,
      expected_delivery_date TEXT,
      delivery_date TEXT,
      status TEXT DEFAULT 'Draft',
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      dirty INTEGER DEFAULT 0,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS grn_lines (
      id TEXT PRIMARY KEY,
      grn_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      expected_quantity INTEGER NOT NULL,
      received_quantity INTEGER DEFAULT 0,
      batch_reference TEXT,
      notes TEXT,
      FOREIGN KEY (grn_id) REFERENCES grns(id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      conflict_flag INTEGER DEFAULT 0,
      conflict_notes TEXT,
      retry_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_records(sku_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_state ON inventory_records(state);
    CREATE INDEX IF NOT EXISTS idx_inventory_dirty ON inventory_records(dirty);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    CREATE INDEX IF NOT EXISTS idx_grns_status ON grns(status);
  `);
}

// Inventory Records CRUD
export function getInventoryRecords(filters: { state?: string; skuId?: string; locationId?: string } = {}) {
  const database = getDB();
  let query = 'SELECT ir.*, s.sku_code, s.name as sku_name FROM inventory_records ir LEFT JOIN skus s ON ir.sku_id = s.id WHERE 1=1';
  const params: any[] = [];

  if (filters.state) { query += ' AND ir.state = ?'; params.push(filters.state); }
  if (filters.skuId) { query += ' AND ir.sku_id = ?'; params.push(filters.skuId); }
  if (filters.locationId) { query += ' AND ir.location_id = ?'; params.push(filters.locationId); }

  query += ' ORDER BY ir.updated_at DESC';
  return database.prepare(query).all(...params);
}

export function upsertInventoryRecord(record: any) {
  const database = getDB();
  const stmt = database.prepare(`
    INSERT INTO inventory_records (id, sku_id, batch_id, location_id, quantity, state, terminal_id, user_id, version, created_at, updated_at, dirty)
    VALUES (@id, @sku_id, @batch_id, @location_id, @quantity, @state, @terminal_id, @user_id, @version, @created_at, @updated_at, 1)
    ON CONFLICT(id) DO UPDATE SET
      quantity = excluded.quantity,
      state = excluded.state,
      location_id = excluded.location_id,
      version = excluded.version,
      updated_at = excluded.updated_at,
      dirty = 1
  `);
  return stmt.run(record);
}

// SKUs CRUD
export function getSKUs() {
  return getDB().prepare('SELECT * FROM skus WHERE is_active = 1 ORDER BY name').all();
}

export function upsertSKU(sku: any) {
  const database = getDB();
  const stmt = database.prepare(`
    INSERT INTO skus (id, sku_code, name, description, category, vendor_id, unit_of_measure, conversion_rules, dimensions, is_fragile, max_stack_height, is_active, updated_at)
    VALUES (@id, @sku_code, @name, @description, @category, @vendor_id, @unit_of_measure, @conversion_rules, @dimensions, @is_fragile, @max_stack_height, @is_active, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      unit_of_measure = excluded.unit_of_measure,
      conversion_rules = excluded.conversion_rules,
      dimensions = excluded.dimensions,
      is_fragile = excluded.is_fragile,
      max_stack_height = excluded.max_stack_height,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);
  return stmt.run(sku);
}

// GRNs CRUD
export function getGRNs(filters: { status?: string } = {}) {
  const database = getDB();
  let query = 'SELECT * FROM grns WHERE 1=1';
  const params: any[] = [];
  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  query += ' ORDER BY created_at DESC';
  return database.prepare(query).all(...params);
}

export function upsertGRN(grn: any) {
  const database = getDB();
  const stmt = database.prepare(`
    INSERT INTO grns (id, supplier_id, invoice_reference, status, notes, created_by, created_at, updated_at, dirty)
    VALUES (@id, @supplier_id, @invoice_reference, @status, @notes, @created_by, @created_at, @updated_at, 1)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      dirty = 1
  `);
  return stmt.run(grn);
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

