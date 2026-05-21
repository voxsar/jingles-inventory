import { randomUUID } from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { Pool } from 'pg';

type VectorClock = Record<string, number>;

type SyncEventType =
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'CASH_DECLARED'
  | 'HELD_SALE_SAVED'
  | 'HELD_SALE_RECALLED'
  | 'SALE_COMPLETED'
  | 'SALE_VOIDED'
  | 'RETURN_CREATED';

type SyncEventState = 'PENDING' | 'CONFIRMED' | 'FAILED';
type SyncConflictPolicy = 'LAST_WRITE_WINS' | 'SERVER_WINS';
type SyncConflictStatus = 'OPEN' | 'RESOLVED';

type SyncEvent = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: SyncEventType;
  payload: Record<string, unknown>;
  deviceId: string;
  sequenceNum: number;
  lamport: number;
  vectorClock: VectorClock;
  conflictPolicy: SyncConflictPolicy;
  state: SyncEventState;
  createdAt: string;
  appliedAt?: string;
};

type SyncConflict = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  localEventId?: string;
  remoteEventId?: string;
  policy: SyncConflictPolicy;
  status: SyncConflictStatus;
  detail?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
};

type SyncPlaybackRequest = {
  deviceId: string;
  terminalId: string;
  vectorClock: VectorClock;
  events: SyncEvent[];
};

type SyncPlaybackResponse = {
  acceptedEventIds: string[];
  remoteEvents: SyncEvent[];
  serverVectorClock: VectorClock;
  conflicts: SyncConflict[];
};

type SyncConfirmRequest = {
  deviceId: string;
  terminalId: string;
  vectorClock: VectorClock;
};

type SharedCategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
};

type SharedSkuRow = {
  id: string;
  sku_code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  unit_of_measure: string | null;
  selling_price: number | null;
  wholesale_price: number | null;
  bulk_price: number | null;
  batch_pricing: unknown;
  barcode: string | null;
  stock_on_hand: number | string | null;
};

type SharedSaleLine = {
  id?: string;
  uid?: string;
  productId: string;
  sku: string;
  quantity: number;
  name?: string;
};

type SaleCompletedPayload = {
  receiptNumber: string;
  terminalId?: string | null;
  branchId?: string | null;
  cashierId: string;
  customerId?: string | null;
  shiftId?: string | null;
  heldSaleId?: string | null;
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  total?: number;
  marginTotal?: number;
  lines: SharedSaleLine[];
  payments: unknown[];
};

type ReturnLinePayload = {
  saleLineId: string;
  productId: string;
  quantity: number;
  refundAmount: number;
};

type ReturnCreatedPayload = {
  saleId: string;
  terminalId?: string | null;
  cashierId: string;
  reason?: string | null;
  lines: ReturnLinePayload[];
};

type PosCloudSaleRow = {
  receipt_number: string;
  terminal_id: string;
  lines: SharedSaleLine[];
  reason: string | null;
};

type PosCatalogSnapshot = {
  generatedAt: string;
  categories: Array<{
    id: string;
    name: string;
    icon: string;
    sortOrder: number;
  }>;
  products: Array<{
    id: string;
    sku: string;
    barcode?: string;
    name: string;
    categoryId: string;
    subcategory: string;
    packSize: number;
    unitLabel: string;
    stockOnHand: number;
    description?: string;
    priceTiers: Array<{
      id: string;
      label: string;
      price: number;
      priority: number;
      minQty?: number;
      isDefault?: boolean;
    }>;
  }>;
};

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const SHELF_READY_STATE = 'ShelfReady';
const POS_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS pos_shifts (
      id TEXT PRIMARY KEY,
      terminal_id TEXT NOT NULL,
      branch_id TEXT,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      opening_float DOUBLE PRECISION NOT NULL DEFAULT 0,
      closing_float DOUBLE PRECISION,
      notes TEXT,
      opening_declaration JSONB,
      closing_declaration JSONB,
      synced BOOLEAN NOT NULL DEFAULT TRUE,
      last_vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pos_held_sales (
      id TEXT PRIMARY KEY,
      hold_number TEXT NOT NULL UNIQUE,
      terminal_id TEXT NOT NULL,
      branch_id TEXT,
      cashier_id TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT,
      status TEXT NOT NULL DEFAULT 'HELD',
      subtotal DOUBLE PRECISION NOT NULL,
      discount_total DOUBLE PRECISION NOT NULL DEFAULT 0,
      total DOUBLE PRECISION NOT NULL,
      notes TEXT,
      lines JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pos_sales (
      id TEXT PRIMARY KEY,
      receipt_number TEXT NOT NULL UNIQUE,
      terminal_id TEXT NOT NULL,
      branch_id TEXT,
      user_id TEXT NOT NULL,
      customer_id TEXT,
      shift_id TEXT,
      held_sale_id TEXT,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      subtotal DOUBLE PRECISION NOT NULL,
      discount_total DOUBLE PRECISION NOT NULL DEFAULT 0,
      tax_total DOUBLE PRECISION NOT NULL DEFAULT 0,
      total DOUBLE PRECISION NOT NULL,
      margin_total DOUBLE PRECISION NOT NULL DEFAULT 0,
      lines JSONB NOT NULL DEFAULT '[]'::jsonb,
      payments JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_device_id TEXT,
      source_sequence_num INTEGER,
      synced BOOLEAN NOT NULL DEFAULT TRUE,
      last_vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pos_returns (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      reason TEXT,
      total_refund DOUBLE PRECISION NOT NULL,
      lines JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_device_id TEXT,
      source_sequence_num INTEGER,
      last_vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pos_sync_events (
      id TEXT PRIMARY KEY,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      device_id TEXT NOT NULL,
      terminal_id TEXT,
      sequence_num INTEGER NOT NULL,
      lamport INTEGER NOT NULL,
      conflict_policy TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_at TIMESTAMPTZ
    )
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS pos_sync_events_device_sequence_idx ON pos_sync_events(device_id, sequence_num)`,
  `CREATE INDEX IF NOT EXISTS pos_sync_events_aggregate_idx ON pos_sync_events(aggregate_type, aggregate_id)`,
  `
    CREATE TABLE IF NOT EXISTS pos_sync_device_states (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      terminal_id TEXT,
      last_sequence_num INTEGER NOT NULL DEFAULT 0,
      vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      confirmed_vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      online BOOLEAN NOT NULL DEFAULT FALSE,
      last_error TEXT,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sync_at TIMESTAMPTZ
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pos_sync_conflicts (
      id TEXT PRIMARY KEY,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      local_event_id TEXT,
      remote_event_id TEXT,
      policy TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `,
];

let pool: Pool | null = null;
let schemaReady = false;

function getPool() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 4,
    });
  }

  return pool;
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function normalizeClock(value: unknown): VectorClock {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as VectorClock;
}

function compareVectorClocks(left: VectorClock, right: VectorClock): 'equal' | 'lt' | 'gt' | 'concurrent' {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let leftGreater = false;
  let rightGreater = false;

  for (const key of keys) {
    const a = left[key] ?? 0;
    const b = right[key] ?? 0;
    if (a > b) {
      leftGreater = true;
    }
    if (a < b) {
      rightGreater = true;
    }
  }

  if (!leftGreater && !rightGreater) {
    return 'equal';
  }
  if (leftGreater && !rightGreater) {
    return 'gt';
  }
  if (!leftGreater && rightGreater) {
    return 'lt';
  }

  return 'concurrent';
}

function compareEventOrder(
  leftSequence: number,
  leftDeviceId: string,
  rightSequence: number,
  rightDeviceId: string,
) {
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return leftDeviceId.localeCompare(rightDeviceId);
}

function resolveConflictPolicy(eventType: SyncEventType): SyncConflictPolicy {
  switch (eventType) {
    case 'SALE_COMPLETED':
    case 'SALE_VOIDED':
    case 'RETURN_CREATED':
    case 'SHIFT_CLOSED':
      return 'SERVER_WINS';
    default:
      return 'LAST_WRITE_WINS';
  }
}

function eventWins(
  incoming: Pick<SyncEvent, 'deviceId' | 'sequenceNum' | 'conflictPolicy'>,
  current: Pick<SyncEvent, 'deviceId' | 'sequenceNum'>,
) {
  if (incoming.conflictPolicy === 'SERVER_WINS') {
    const incomingServer = incoming.deviceId.startsWith('server:');
    const currentServer = current.deviceId.startsWith('server:');
    if (incomingServer !== currentServer) {
      return incomingServer;
    }
  }

  return compareEventOrder(
    incoming.sequenceNum,
    incoming.deviceId,
    current.sequenceNum,
    current.deviceId,
  ) >= 0;
}

function buildCategoryIcon(name: string) {
  const tokens = name
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return 'CT';
  }

  if (tokens.length === 1) {
    return tokens[0]!.slice(0, 2).toUpperCase();
  }

  return `${tokens[0]![0] ?? ''}${tokens[1]![0] ?? ''}`.toUpperCase();
}

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function normalizeSharedSaleLine(value: unknown): SharedSaleLine | null {
  const record = asObject(value);
  const productId = asString(record.productId);
  const sku = asString(record.sku, productId);
  const quantity = normalizeNumber(record.quantity, Number.NaN);

  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    id: asOptionalString(record.id),
    uid: asOptionalString(record.uid),
    productId,
    sku,
    quantity,
    name: asOptionalString(record.name),
  };
}

function parseSaleCompletedPayload(value: unknown): SaleCompletedPayload {
  const record = asObject(value);

  return {
    receiptNumber: asString(record.receiptNumber),
    terminalId: asOptionalString(record.terminalId) ?? null,
    branchId: asOptionalString(record.branchId) ?? null,
    cashierId: asString(record.cashierId),
    customerId: asOptionalString(record.customerId) ?? null,
    shiftId: asOptionalString(record.shiftId) ?? null,
    heldSaleId: asOptionalString(record.heldSaleId) ?? null,
    subtotal: normalizeNumber(record.subtotal, 0),
    discountTotal: normalizeNumber(record.discountTotal, 0),
    taxTotal: normalizeNumber(record.taxTotal, 0),
    total: normalizeNumber(record.total, 0),
    marginTotal: normalizeNumber(record.marginTotal, 0),
    lines: Array.isArray(record.lines)
      ? record.lines
          .map((line) => normalizeSharedSaleLine(line))
          .filter((line): line is SharedSaleLine => line != null)
      : [],
    payments: Array.isArray(record.payments) ? record.payments : [],
  };
}

function parseReturnLinePayload(value: unknown): ReturnLinePayload | null {
  const record = asObject(value);
  const saleLineId = asString(record.saleLineId);
  const productId = asString(record.productId);
  const quantity = normalizeNumber(record.quantity, Number.NaN);
  const refundAmount = normalizeNumber(record.refundAmount, 0);

  if (!saleLineId || !productId || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    saleLineId,
    productId,
    quantity,
    refundAmount,
  };
}

function parseReturnCreatedPayload(value: unknown): ReturnCreatedPayload {
  const record = asObject(value);

  return {
    saleId: asString(record.saleId),
    terminalId: asOptionalString(record.terminalId) ?? null,
    cashierId: asString(record.cashierId),
    reason: asOptionalString(record.reason) ?? null,
    lines: Array.isArray(record.lines)
      ? record.lines
          .map((line) => parseReturnLinePayload(line))
          .filter((line): line is ReturnLinePayload => line != null)
      : [],
  };
}

function buildPriceTiers(row: SharedSkuRow) {
  const tiers: PosCatalogSnapshot['products'][number]['priceTiers'] = [];

  if (Number.isFinite(row.selling_price)) {
    tiers.push({
      id: `${row.id}-retail`,
      label: 'Retail',
      price: Number(row.selling_price),
      priority: 0,
      minQty: 0,
      isDefault: true,
    });
  }

  if (Number.isFinite(row.wholesale_price)) {
    tiers.push({
      id: `${row.id}-wholesale`,
      label: 'Wholesale',
      price: Number(row.wholesale_price),
      priority: 1,
      minQty: 0,
    });
  }

  if (Number.isFinite(row.bulk_price)) {
    tiers.push({
      id: `${row.id}-bulk`,
      label: 'Bulk',
      price: Number(row.bulk_price),
      priority: 2,
      minQty: 0,
    });
  }

  if (Array.isArray(row.batch_pricing)) {
    row.batch_pricing.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const minQty = normalizeNumber((entry as Record<string, unknown>).minQty, 0);
      const price = normalizeNumber((entry as Record<string, unknown>).price, Number.NaN);
      if (!Number.isFinite(price)) {
        return;
      }

      tiers.push({
        id: `${row.id}-qty-${index}`,
        label: minQty > 0 ? `Qty ${minQty}+` : 'Retail',
        price,
        priority: 10 + index,
        minQty,
      });
    });
  }

  if (tiers.length === 0) {
    tiers.push({
      id: `${row.id}-retail`,
      label: 'Retail',
      price: 0,
      priority: 0,
      minQty: 0,
      isDefault: true,
    });
  }

  return tiers
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return (left.minQty ?? 0) - (right.minQty ?? 0);
    })
    .map((tier, index) => ({
      ...tier,
      isDefault: index === 0 ? true : tier.isDefault,
    }));
}

function resolveRootCategory(
  categoryId: string | null,
  categoriesById: Map<string, SharedCategoryRow>,
) {
  if (!categoryId) {
    return {
      categoryId: 'uncategorized',
      subcategory: '',
    };
  }

  const current = categoriesById.get(categoryId);
  if (!current) {
    return {
      categoryId: 'uncategorized',
      subcategory: '',
    };
  }

  let root = current;
  while (root.parent_id && categoriesById.has(root.parent_id)) {
    root = categoriesById.get(root.parent_id)!;
  }

  return {
    categoryId: root.id,
    subcategory: root.id === current.id ? '' : current.name,
  };
}

export async function ensurePosCloudSchema() {
  if (schemaReady) {
    return;
  }

  const client = await getPool().connect();
  try {
    for (const statement of POS_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function getPosCatalogSnapshot(): Promise<PosCatalogSnapshot> {
  await ensurePosCloudSchema();
  const inventory = getPool();

  const [categoriesResult, skuResult] = await Promise.all([
    inventory.query<SharedCategoryRow>(
      `
        SELECT id, name, parent_id, sort_order
        FROM categories
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, name ASC
      `,
    ),
    inventory.query<SharedSkuRow>(
      `
        WITH shelf_ready_stock AS (
          SELECT sku_id, COALESCE(SUM(quantity), 0) AS stock_on_hand
          FROM inventory_records
          WHERE state = $1
          GROUP BY sku_id
        ),
        preferred_barcodes AS (
          SELECT DISTINCT ON (sku_id) sku_id, barcode
          FROM product_barcodes
          ORDER BY sku_id, is_default DESC, created_at ASC
        )
        SELECT
          s.id,
          s.sku_code,
          s.name,
          s.description,
          s.category_id,
          s.unit_of_measure,
          s.selling_price,
          s.wholesale_price,
          s.bulk_price,
          s.batch_pricing,
          pb.barcode,
          COALESCE(sr.stock_on_hand, 0) AS stock_on_hand
        FROM skus s
        LEFT JOIN preferred_barcodes pb ON pb.sku_id = s.id
        LEFT JOIN shelf_ready_stock sr ON sr.sku_id = s.id
        WHERE s.is_active = TRUE
        ORDER BY s.sku_code ASC
      `,
      [SHELF_READY_STATE],
    ),
  ]);

  const categoriesById = new Map(categoriesResult.rows.map((category) => [category.id, category]));
  const categoryListById = new Map(
    categoriesResult.rows.map((category) => [
      category.id,
      {
        id: category.id,
        name: category.name,
        icon: buildCategoryIcon(category.name),
        sortOrder: category.sort_order ?? 0,
      },
    ]),
  );

  const products = skuResult.rows.map((row) => {
    const categoryMeta = resolveRootCategory(row.category_id, categoriesById);
    return {
      id: row.id,
      sku: row.sku_code,
      barcode: row.barcode ?? undefined,
      name: row.name,
      categoryId: categoryMeta.categoryId,
      subcategory: categoryMeta.subcategory,
      packSize: 1,
      unitLabel: row.unit_of_measure?.trim() || 'pcs',
      stockOnHand: normalizeNumber(row.stock_on_hand),
      description: row.description ?? undefined,
      priceTiers: buildPriceTiers(row),
    };
  });

  const categories: PosCatalogSnapshot['categories'] = [];
  const usedCategoryIds = new Set<string>();
  for (const product of products) {
    if (usedCategoryIds.has(product.categoryId)) {
      continue;
    }

    if (product.categoryId === 'uncategorized') {
      categories.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        icon: 'UN',
        sortOrder: 9999,
      });
      usedCategoryIds.add(product.categoryId);
      continue;
    }

    const category = categoryListById.get(product.categoryId);
    if (category) {
      categories.push(category);
      usedCategoryIds.add(product.categoryId);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    categories,
    products,
  };
}

async function recordSharedInventoryChanges(
  client: PoolClient,
  input: {
    aggregateId: string;
    aggregateType?: string;
    changes: Array<{
      tableName: 'inventory_records' | 'inventory_events';
      rowId: string;
      action: 'upsert' | 'delete';
    }>;
  },
) {
  if (input.changes.length === 0) {
    return null;
  }

  const sequenceResult = await client.query<{ seq: number }>(
    `
      INSERT INTO sync_server_sequence (operation_id, aggregate_type, aggregate_id)
      VALUES ($1, $2, $3)
      RETURNING seq
    `,
    [null, input.aggregateType ?? 'inventory_record', input.aggregateId],
  );

  const seq = sequenceResult.rows[0]?.seq ?? null;
  if (seq == null) {
    return null;
  }

  const values: Array<string | number> = [];
  const placeholders = input.changes.map((change, index) => {
    const offset = index * 4;
    values.push(seq, change.tableName, change.rowId, change.action);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
  });

  await client.query(
    `
      INSERT INTO sync_server_changes (seq, table_name, row_id, action)
      VALUES ${placeholders.join(', ')}
    `,
    values,
  );

  return seq;
}

async function applySharedInventorySale(
  input: {
    aggregateId: string;
    receiptNumber: string;
    terminalId?: string | null;
    lines: SharedSaleLine[];
  },
) {
  await withTransaction(async (client) => {
    for (const line of input.lines) {
      const requestedQuantity = normalizeNumber(line.quantity);
      if (requestedQuantity <= 0) {
        continue;
      }

      const recordResult = await client.query<{ id: string; quantity: number | string }>(
        `
          SELECT id, quantity
          FROM inventory_records
          WHERE sku_id = $1
            AND state = $2
            AND quantity > 0
          ORDER BY updated_at ASC, created_at ASC
          FOR UPDATE
        `,
        [line.productId, SHELF_READY_STATE],
      );

      const totalBefore = recordResult.rows.reduce(
        (sum, row) => sum + normalizeNumber(row.quantity),
        0,
      );
      if (totalBefore < requestedQuantity) {
        throw new Error(`Insufficient ShelfReady stock for ${line.sku}`);
      }

      let remaining = requestedQuantity;
      const changedRecordIds: string[] = [];

      for (const row of recordResult.rows) {
        if (remaining <= 0) {
          break;
        }

        const currentQuantity = normalizeNumber(row.quantity);
        const delta = Math.min(remaining, currentQuantity);
        const afterQuantity = currentQuantity - delta;

        await client.query(
          `
            UPDATE inventory_records
            SET quantity = $1,
                source_event_id = $2,
                terminal_id = $3,
                version = version + 1,
                updated_at = NOW()
            WHERE id = $4
          `,
          [afterQuantity, input.aggregateId, input.terminalId ?? null, row.id],
        );

        changedRecordIds.push(row.id);
        remaining -= delta;
      }

      const eventId = `${input.aggregateId}-${line.productId}-sale`;
      await client.query(
        `
          INSERT INTO inventory_events (
            id,
            event_type,
            parent_entity_id,
            quantity_delta,
            before_quantity,
            after_quantity,
            notes,
            terminal_id
          )
          VALUES ($1, 'MANUAL_ADJUSTMENT', $2, $3, NULL, NULL, $4, $5)
        `,
        [
          eventId,
          changedRecordIds[0] ?? line.productId,
          requestedQuantity * -1,
          `POS sale ${input.receiptNumber}`,
          input.terminalId ?? null,
        ],
      );

      await recordSharedInventoryChanges(client, {
        aggregateId: input.aggregateId,
        aggregateType: 'inventory_record',
        changes: [
          ...changedRecordIds.map((rowId) => ({
            tableName: 'inventory_records' as const,
            rowId,
            action: 'upsert' as const,
          })),
          {
            tableName: 'inventory_events' as const,
            rowId: eventId,
            action: 'upsert' as const,
          },
        ],
      });
    }
  });
}

async function applySharedInventoryIncrease(
  input: {
    aggregateId: string;
    terminalId?: string | null;
    reason?: string | null;
    lines: SharedSaleLine[];
  },
) {
  await withTransaction(async (client) => {
    for (const line of input.lines) {
      const quantity = normalizeNumber(line.quantity);
      if (quantity <= 0) {
        continue;
      }

      const recordId = `${input.aggregateId}-${line.productId}-restock`;
      await client.query(
        `
          INSERT INTO inventory_records (
            id,
            sku_id,
            quantity,
            state,
            terminal_id,
            version,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE
          SET quantity = inventory_records.quantity + EXCLUDED.quantity,
              terminal_id = EXCLUDED.terminal_id,
              version = inventory_records.version + 1,
              updated_at = NOW()
        `,
        [recordId, line.productId, quantity, SHELF_READY_STATE, input.terminalId ?? null],
      );

      const eventId = `${input.aggregateId}-${line.productId}-restock-event`;
      await client.query(
        `
          INSERT INTO inventory_events (
            id,
            event_type,
            parent_entity_id,
            quantity_delta,
            before_quantity,
            after_quantity,
            notes,
            terminal_id
          )
          VALUES ($1, 'MANUAL_ADJUSTMENT', $2, $3, NULL, NULL, $4, $5)
        `,
        [
          eventId,
          recordId,
          quantity,
          input.reason ?? 'POS stock restored',
          input.terminalId ?? null,
        ],
      );

      await recordSharedInventoryChanges(client, {
        aggregateId: input.aggregateId,
        aggregateType: 'inventory_record',
        changes: [
          {
            tableName: 'inventory_records',
            rowId: recordId,
            action: 'upsert',
          },
          {
            tableName: 'inventory_events',
            rowId: eventId,
            action: 'upsert',
          },
        ],
      });
    }
  });
}

async function applySharedInventoryVoid(
  input: {
    aggregateId: string;
    terminalId?: string | null;
    reason?: string | null;
    lines: SharedSaleLine[];
  },
) {
  await applySharedInventoryIncrease(input);
}

async function applySharedInventoryReturn(
  input: {
    aggregateId: string;
    terminalId?: string | null;
    reason?: string | null;
    lines: SharedSaleLine[];
  },
) {
  await applySharedInventoryIncrease(input);
}

async function getServerVectorClock(client: PoolClient | Pool = getPool()) {
  const rows = (await client.query<{ device_id: string; last_sequence_num: number }>(
    `SELECT device_id, last_sequence_num FROM pos_sync_device_states`,
  )).rows;

  return rows.reduce<VectorClock>((clock, row) => {
    if (row.last_sequence_num > 0) {
      clock[row.device_id] = row.last_sequence_num;
    }
    return clock;
  }, {});
}

async function getAggregateClock(client: PoolClient, aggregateType: string, aggregateId: string) {
  let tableName = '';
  switch (aggregateType) {
    case 'shift':
      tableName = 'pos_shifts';
      break;
    case 'held-sale':
      tableName = 'pos_held_sales';
      break;
    case 'sale':
      tableName = 'pos_sales';
      break;
    case 'return':
      tableName = 'pos_returns';
      break;
    default:
      return {};
  }

  const row = (await client.query<{ last_vector_clock: unknown }>(
    `SELECT last_vector_clock FROM ${tableName} WHERE id = $1 LIMIT 1`,
    [aggregateId],
  )).rows[0];

  return normalizeClock(row?.last_vector_clock);
}

function toStoredEventDto(row: QueryResultRow): SyncEvent {
  return {
    id: row.id as string,
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as string,
    eventType: row.event_type as SyncEventType,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    deviceId: row.device_id as string,
    sequenceNum: row.sequence_num as number,
    lamport: row.lamport as number,
    vectorClock: normalizeClock(row.vector_clock),
    conflictPolicy: row.conflict_policy as SyncConflictPolicy,
    state: row.state as SyncEventState,
    createdAt: (row.created_at as Date).toISOString(),
    appliedAt: row.applied_at ? (row.applied_at as Date).toISOString() : undefined,
  };
}

function toConflictDto(row: QueryResultRow): SyncConflict {
  return {
    id: row.id as string,
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as string,
    localEventId: (row.local_event_id as string | null) ?? undefined,
    remoteEventId: (row.remote_event_id as string | null) ?? undefined,
    policy: row.policy as SyncConflictPolicy,
    status: row.status as SyncConflictStatus,
    detail: (row.detail as Record<string, unknown> | null) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
    resolvedAt: row.resolved_at ? (row.resolved_at as Date).toISOString() : undefined,
  };
}

async function getLatestAggregateEvent(client: PoolClient, aggregateType: string, aggregateId: string) {
  const rows = (await client.query(
    `
      SELECT *
      FROM pos_sync_events
      WHERE aggregate_type = $1 AND aggregate_id = $2
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [aggregateType, aggregateId],
  )).rows;

  if (rows.length === 0) {
    return null;
  }

  return rows
    .map(toStoredEventDto)
    .sort((left, right) =>
      compareEventOrder(right.sequenceNum, right.deviceId, left.sequenceNum, left.deviceId),
    )[0] ?? null;
}

async function recordConflict(
  client: PoolClient,
  incoming: SyncEvent,
  existing: SyncEvent,
): Promise<SyncConflict> {
  const row = (await client.query(
    `
      INSERT INTO pos_sync_conflicts (
        id,
        aggregate_type,
        aggregate_id,
        local_event_id,
        remote_event_id,
        policy,
        status,
        detail
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7)
      RETURNING *
    `,
    [
      randomUUID(),
      incoming.aggregateType,
      incoming.aggregateId,
      existing.id,
      incoming.id,
      incoming.conflictPolicy,
      {
        relation: 'concurrent',
        localVectorClock: existing.vectorClock,
        remoteVectorClock: incoming.vectorClock,
      },
    ],
  )).rows[0];

  return toConflictDto(row);
}

async function updateDeviceState(
  client: PoolClient,
  deviceId: string,
  terminalId: string | null | undefined,
  sequenceNum: number,
  vectorClock: VectorClock,
) {
  await client.query(
    `
      INSERT INTO pos_sync_device_states (
        id,
        device_id,
        terminal_id,
        last_sequence_num,
        vector_clock,
        confirmed_vector_clock,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, NOW())
      ON CONFLICT (device_id) DO UPDATE
      SET terminal_id = EXCLUDED.terminal_id,
          last_sequence_num = GREATEST(pos_sync_device_states.last_sequence_num, EXCLUDED.last_sequence_num),
          vector_clock = EXCLUDED.vector_clock,
          last_seen_at = NOW()
    `,
    [`pos-sync-device-${deviceId}`, deviceId, terminalId ?? null, sequenceNum, vectorClock],
  );
}

async function applyShiftOpenedEvent(client: PoolClient, event: SyncEvent) {
  const payload = event.payload;
  await client.query(
    `
      INSERT INTO pos_shifts (
        id,
        terminal_id,
        branch_id,
        user_id,
        status,
        opening_float,
        notes,
        opening_declaration,
        synced,
        last_vector_clock,
        opened_at
      )
      VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, TRUE, $8, NOW())
      ON CONFLICT (id) DO UPDATE
      SET terminal_id = EXCLUDED.terminal_id,
          branch_id = EXCLUDED.branch_id,
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          opening_float = EXCLUDED.opening_float,
          notes = EXCLUDED.notes,
          opening_declaration = EXCLUDED.opening_declaration,
          synced = TRUE,
          last_vector_clock = EXCLUDED.last_vector_clock
    `,
    [
      event.aggregateId,
      payload.terminalId,
      payload.branchId ?? null,
      payload.cashierId,
      payload.openingFloat ?? 0,
      payload.notes ?? null,
      payload.declaration ?? null,
      event.vectorClock,
    ],
  );
}

async function applyShiftClosedEvent(client: PoolClient, event: SyncEvent) {
  const payload = event.payload;
  await client.query(
    `
      UPDATE pos_shifts
      SET status = 'CLOSED',
          closing_float = $1,
          notes = $2,
          closing_declaration = $3,
          synced = TRUE,
          last_vector_clock = $4,
          closed_at = NOW()
      WHERE id = $5
    `,
    [
      payload.closingFloat ?? 0,
      payload.notes ?? null,
      payload.declaration ?? null,
      event.vectorClock,
      payload.shiftId,
    ],
  );
}

async function applyHeldSaleSavedEvent(client: PoolClient, event: SyncEvent) {
  const payload = event.payload;
  await client.query(
    `
      INSERT INTO pos_held_sales (
        id,
        hold_number,
        terminal_id,
        branch_id,
        cashier_id,
        customer_id,
        customer_name,
        status,
        subtotal,
        discount_total,
        total,
        lines,
        last_vector_clock,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL, 'HELD', $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (id) DO UPDATE
      SET hold_number = EXCLUDED.hold_number,
          terminal_id = EXCLUDED.terminal_id,
          branch_id = EXCLUDED.branch_id,
          cashier_id = EXCLUDED.cashier_id,
          customer_id = EXCLUDED.customer_id,
          status = EXCLUDED.status,
          subtotal = EXCLUDED.subtotal,
          discount_total = EXCLUDED.discount_total,
          total = EXCLUDED.total,
          lines = EXCLUDED.lines,
          last_vector_clock = EXCLUDED.last_vector_clock,
          updated_at = NOW()
    `,
    [
      event.aggregateId,
      payload.holdNumber,
      payload.terminalId,
      payload.branchId ?? null,
      payload.cashierId,
      payload.customerId ?? null,
      payload.subtotal ?? 0,
      payload.discountTotal ?? 0,
      payload.total ?? 0,
      payload.lines ?? [],
      event.vectorClock,
    ],
  );
}

async function applyHeldSaleRecalledEvent(client: PoolClient, event: SyncEvent) {
  await client.query(
    `
      UPDATE pos_held_sales
      SET status = 'RECALLED',
          last_vector_clock = $1,
          updated_at = NOW()
      WHERE id = $2
    `,
    [event.vectorClock, event.payload.heldSaleId],
  );
}

async function applySaleCompletedEvent(client: PoolClient, event: SyncEvent) {
  const payload = parseSaleCompletedPayload(event.payload);
  const existing = (await client.query(`SELECT id FROM pos_sales WHERE id = $1 LIMIT 1`, [event.aggregateId])).rows[0];
  if (existing) {
    return;
  }

  await client.query(
    `
      INSERT INTO pos_sales (
        id,
        receipt_number,
        terminal_id,
        branch_id,
        user_id,
        customer_id,
        shift_id,
        held_sale_id,
        status,
        subtotal,
        discount_total,
        tax_total,
        total,
        margin_total,
        lines,
        payments,
        source_device_id,
        source_sequence_num,
        synced,
        last_vector_clock,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9, $10, $11, $12, $13, $14, $15, $16, $17, TRUE, $18, NOW(), NOW()
      )
    `,
    [
      event.aggregateId,
      payload.receiptNumber,
      payload.terminalId,
      payload.branchId ?? null,
      payload.cashierId,
      payload.customerId ?? null,
      payload.shiftId ?? null,
      payload.heldSaleId ?? null,
      payload.subtotal ?? 0,
      payload.discountTotal ?? 0,
      payload.taxTotal ?? 0,
      payload.total ?? 0,
      payload.marginTotal ?? 0,
      payload.lines ?? [],
      payload.payments ?? [],
      event.deviceId,
      event.sequenceNum,
      event.vectorClock,
    ],
  );

  if (payload.heldSaleId) {
    await client.query(
      `
        UPDATE pos_held_sales
        SET status = 'RECALLED',
            last_vector_clock = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [event.vectorClock, payload.heldSaleId],
    );
  }

  await applySharedInventorySale({
    aggregateId: event.aggregateId,
    receiptNumber: payload.receiptNumber,
    terminalId: payload.terminalId,
    lines: payload.lines.map((line) => ({
      productId: line.productId,
      sku: line.sku,
      quantity: line.quantity,
      name: line.name,
    })),
  });
}

async function getSaleRow(client: PoolClient, saleId: string) {
  const row = (await client.query(
    `SELECT receipt_number, terminal_id, lines, status FROM pos_sales WHERE id = $1 LIMIT 1`,
    [saleId],
  )).rows[0];

  if (!row) {
    return null;
  }

  return {
    receipt_number: row.receipt_number as string,
    terminal_id: row.terminal_id as string,
    lines: (row.lines ?? []) as SharedSaleLine[],
    status: row.status as string,
  };
}

async function applySaleVoidedEvent(client: PoolClient, event: SyncEvent) {
  const sale = await getSaleRow(client, String(event.payload.saleId));
  if (!sale || sale.status === 'VOIDED') {
    return;
  }

  await client.query(
    `
      UPDATE pos_sales
      SET status = 'VOIDED',
          synced = TRUE,
          last_vector_clock = $1,
          updated_at = NOW()
      WHERE id = $2
    `,
    [event.vectorClock, event.payload.saleId],
  );

  await applySharedInventoryVoid({
    aggregateId: String(event.payload.saleId),
    terminalId: sale.terminal_id,
    reason: (event.payload.reason as string | undefined) ?? null,
    lines: sale.lines,
  });
}

async function applyReturnCreatedEvent(client: PoolClient, event: SyncEvent) {
  const payload = parseReturnCreatedPayload(event.payload);
  const existing = (await client.query(`SELECT id FROM pos_returns WHERE id = $1 LIMIT 1`, [event.aggregateId])).rows[0];
  if (existing) {
    return;
  }

  const sale = await getSaleRow(client, String(payload.saleId));
  const lines = payload.lines;
  const totalRefund = lines.reduce(
    (sum, line) => sum + normalizeNumber(line.refundAmount),
    0,
  );

  await client.query(
    `
      INSERT INTO pos_returns (
        id,
        sale_id,
        user_id,
        terminal_id,
        reason,
        total_refund,
        lines,
        source_device_id,
        source_sequence_num,
        last_vector_clock
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      event.aggregateId,
      payload.saleId,
      payload.cashierId,
      payload.terminalId,
      payload.reason ?? null,
      totalRefund,
      lines,
      event.deviceId,
      event.sequenceNum,
      event.vectorClock,
    ],
  );

  if (sale) {
    await client.query(
      `
        UPDATE pos_sales
        SET status = 'REFUNDED',
            synced = TRUE,
            last_vector_clock = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [event.vectorClock, payload.saleId],
    );
  }

  await applySharedInventoryReturn({
    aggregateId: event.aggregateId,
    terminalId: payload.terminalId,
    reason: payload.reason ?? null,
    lines: lines.map((line) => {
      const matchedSaleLine = sale?.lines.find(
        (entry) => entry.id === line.saleLineId || entry.uid === line.saleLineId,
      );
      return {
        productId: line.productId,
        sku: matchedSaleLine?.sku ?? line.productId,
        quantity: line.quantity,
        name: matchedSaleLine?.name,
      };
    }),
  });
}

async function applyProjectionEvent(client: PoolClient, event: SyncEvent) {
  switch (event.eventType) {
    case 'SHIFT_OPENED':
      await applyShiftOpenedEvent(client, event);
      return;
    case 'SHIFT_CLOSED':
      await applyShiftClosedEvent(client, event);
      return;
    case 'HELD_SALE_SAVED':
      await applyHeldSaleSavedEvent(client, event);
      return;
    case 'HELD_SALE_RECALLED':
      await applyHeldSaleRecalledEvent(client, event);
      return;
    case 'SALE_COMPLETED':
      await applySaleCompletedEvent(client, event);
      return;
    case 'SALE_VOIDED':
      await applySaleVoidedEvent(client, event);
      return;
    case 'RETURN_CREATED':
      await applyReturnCreatedEvent(client, event);
      return;
    default:
      return;
  }
}

async function appendEvent(client: PoolClient, event: SyncEvent) {
  const duplicate = (await client.query(
    `
      SELECT *
      FROM pos_sync_events
      WHERE id = $1 OR (device_id = $2 AND sequence_num = $3)
      LIMIT 1
    `,
    [event.id, event.deviceId, event.sequenceNum],
  )).rows[0];

  if (duplicate) {
    return { storedEvent: toStoredEventDto(duplicate), applied: duplicate.applied_at != null };
  }

  const aggregateClock = await getAggregateClock(client, event.aggregateType, event.aggregateId);
  const relation = compareVectorClocks(event.vectorClock, aggregateClock);
  const latestEvent = await getLatestAggregateEvent(client, event.aggregateType, event.aggregateId);

  let applyEvent = relation !== 'lt' && relation !== 'equal';
  let conflict: SyncConflict | undefined;

  if (relation === 'concurrent' && latestEvent) {
    conflict = await recordConflict(client, event, latestEvent);
    applyEvent = eventWins(event, latestEvent);
  }

  const stored = (await client.query(
    `
      INSERT INTO pos_sync_events (
        id,
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        vector_clock,
        device_id,
        terminal_id,
        sequence_num,
        lamport,
        conflict_policy,
        state,
        applied_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
    [
      event.id,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      event.payload,
      event.vectorClock,
      event.deviceId,
      (event.payload.terminalId as string | undefined) ?? null,
      event.sequenceNum,
      event.lamport ?? event.sequenceNum,
      event.conflictPolicy,
      applyEvent ? 'CONFIRMED' : 'PENDING',
      applyEvent ? new Date() : null,
    ],
  )).rows[0];

  if (applyEvent) {
    await applyProjectionEvent(client, event);
  }

  await updateDeviceState(client, event.deviceId, stored.terminal_id as string | null, event.sequenceNum, event.vectorClock);
  return { storedEvent: toStoredEventDto(stored), applied: applyEvent, conflict };
}

export async function posSyncHandshake(vectorClock: VectorClock) {
  await ensurePosCloudSchema();
  const clientClock = vectorClock ?? {};
  const [serverVectorClock, allEvents, conflictResult] = await Promise.all([
    getServerVectorClock(),
    getPool().query(`SELECT device_id, sequence_num FROM pos_sync_events`),
    getPool().query(`SELECT COUNT(*)::int AS count FROM pos_sync_conflicts WHERE status = 'OPEN'`),
  ]);

  const pendingRemoteCount = allEvents.rows.filter((event) =>
    Number(event.sequence_num) > (clientClock[String(event.device_id)] ?? 0),
  ).length;

  return {
    serverVectorClock,
    pendingRemoteCount,
    conflictCount: conflictResult.rows[0]?.count ?? 0,
  };
}

export async function posSyncPlayback(input: SyncPlaybackRequest): Promise<SyncPlaybackResponse> {
  await ensurePosCloudSchema();
  return withTransaction(async (client) => {
    const acceptedEventIds: string[] = [];
    const conflicts: SyncConflict[] = [];

    const sortedIncoming = [...(input.events ?? [])].sort((left, right) =>
      compareEventOrder(left.sequenceNum, left.deviceId, right.sequenceNum, right.deviceId),
    );

    for (const event of sortedIncoming) {
      const normalizedEvent: SyncEvent = {
        ...event,
        conflictPolicy: event.conflictPolicy ?? resolveConflictPolicy(event.eventType),
        state: event.state ?? 'PENDING',
      };

      const result = await appendEvent(client, normalizedEvent);
      acceptedEventIds.push(result.storedEvent.id);
      if (result.conflict) {
        conflicts.push(result.conflict);
      }
    }

    const serverVectorClock = await getServerVectorClock(client);
    const remoteEventsRows = (await client.query(
      `SELECT * FROM pos_sync_events ORDER BY created_at ASC`,
    )).rows;

    const remoteEvents = remoteEventsRows
      .map(toStoredEventDto)
      .filter((event) => event.sequenceNum > (input.vectorClock[event.deviceId] ?? 0));

    return {
      acceptedEventIds,
      remoteEvents,
      serverVectorClock,
      conflicts,
    };
  });
}

export async function posSyncConfirm(input: SyncConfirmRequest) {
  await ensurePosCloudSchema();
  return withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO pos_sync_device_states (
          id,
          device_id,
          terminal_id,
          confirmed_vector_clock,
          online,
          last_error,
          last_seen_at,
          last_sync_at
        )
        VALUES ($1, $2, $3, $4, TRUE, NULL, NOW(), NOW())
        ON CONFLICT (device_id) DO UPDATE
        SET terminal_id = EXCLUDED.terminal_id,
            confirmed_vector_clock = EXCLUDED.confirmed_vector_clock,
            online = TRUE,
            last_error = NULL,
            last_seen_at = NOW(),
            last_sync_at = NOW()
      `,
      [`pos-sync-device-${input.deviceId}`, input.deviceId, input.terminalId, input.vectorClock],
    );

    return getServerVectorClock(client);
  });
}
