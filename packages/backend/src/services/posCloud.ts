import { createHash, randomUUID } from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { Pool } from 'pg';
import type { LegacySyncPosRecord } from '@jingles/shared';

type VectorClock = Record<string, number>;

type SyncEventType =
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'CASH_DECLARED'
  | 'HELD_SALE_SAVED'
  | 'HELD_SALE_RECALLED'
  | 'SALE_COMPLETED'
  | 'SALE_VOIDED'
  | 'RETURN_CREATED'
  | 'CUSTOMER_UPSERTED'
  | 'CREDIT_PAYMENT_RECORDED';

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
  barcodes: string[] | null;
  stock_on_hand: number | string | null;
  stock_by_branch: Record<string, number> | null;
};

type SharedVariantRow = {
  sku_id: string;
  variant_id: string;
  variant_code: string;
  variant_name: string | null;
  barcodes: string[] | null;
  variant_stock_on_hand: number | string | null;
  stock_by_branch: Record<string, number> | null;
  selling_price: number | null;
  wholesale_price: number | null;
  bulk_price: number | null;
  attribute_id: string | null;
  attribute_name: string | null;
  attribute_type: string | null;
  attribute_sort_order: number | null;
  value_id: string | null;
  value_display_name: string | null;
  value_represented_value: string | null;
  value_sort_order: number | null;
};

type SharedSaleLine = {
  id?: string;
  uid?: string;
  productId: string;
  sku: string;
  quantity: number;
  name?: string;
  variantId?: string | null;
  variantCode?: string | null;
  variantName?: string | null;
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
  branch_id: string | null;
  lines: SharedSaleLine[];
  reason: string | null;
};

type PosCatalogSnapshot = {
  generatedAt: string;
  branches: Array<{ id: string; code: string; name: string }>;
  users: Array<{ id: string; code: string; email: string; name: string; initials: string; role: 'CASHIER' | 'MANAGER' }>;
  customers: Array<{
    id: string; code: string; name: string; tier: string; email?: string;
    phone?: string; notes?: string; creditLimit: number;
  }>;
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
    barcodes?: string[];
    name: string;
    categoryId: string;
    subcategory: string;
    packSize: number;
    unitLabel: string;
    stockOnHand: number;
    stockByBranch: Record<string, number>;
    description?: string;
    priceTiers: Array<{
      id: string;
      label: string;
      price: number;
      priority: number;
      minQty?: number;
      isDefault?: boolean;
    }>;
    variants?: Array<{
      id: string;
      productId: string;
      variantCode: string;
      barcodes?: string[];
      name?: string;
      stockOnHand: number;
      stockByBranch: Record<string, number>;
      priceTiers?: Array<{ id: string; label: string; price: number; priority: number; minQty?: number; isDefault?: boolean }>;
      attributes: Array<{
        attributeId: string;
        attributeName: string;
        attributeType?: string;
        valueId: string;
        value: string;
        representedValue?: string;
        sortOrder?: number;
      }>;
    }>;
    pricingRules: Array<Record<string, unknown>>;
  }>;
};

type PricingOverlayRow = {
  id: string; name: string; type: string; value: number; applies_to: Record<string, string[]>;
  conditions: Record<string, unknown> | null; priority: number; stackable: boolean;
  valid_from: Date | null; valid_to: Date | null;
};

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const SHELF_READY_STATE = 'ShelfReady';
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
    case 'CREDIT_PAYMENT_RECORDED':
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
    variantId: asOptionalString(record.variantId) ?? null,
    variantCode: asOptionalString(record.variantCode) ?? null,
    variantName: asOptionalString(record.variantName) ?? null,
  };
}

function buildProductVariants(rows: SharedVariantRow[]) {
  type CatalogVariant = NonNullable<PosCatalogSnapshot['products'][number]['variants']>[number];
  const bySku = new Map<string, Map<string, CatalogVariant>>();
  for (const row of rows) {
    const variants = bySku.get(row.sku_id) ?? new Map<string, CatalogVariant>();
    const variant: CatalogVariant = variants.get(row.variant_id) ?? {
      id: row.variant_id,
      productId: row.sku_id,
      variantCode: row.variant_code,
      barcodes: row.barcodes ?? [],
      name: row.variant_name ?? undefined,
      stockOnHand: normalizeNumber(row.variant_stock_on_hand),
      stockByBranch: row.stock_by_branch ?? {},
      priceTiers: buildPriceTiers({
        id: row.variant_id,
        selling_price: row.selling_price,
        wholesale_price: row.wholesale_price,
        bulk_price: row.bulk_price,
        batch_pricing: [],
      } as SharedSkuRow),
      attributes: [],
    };
    if (row.attribute_id && row.value_id && !variant.attributes.some((item) => item.attributeId === row.attribute_id)) {
      variant.attributes.push({
        attributeId: row.attribute_id,
        attributeName: row.attribute_name ?? row.attribute_id,
        attributeType: row.attribute_type ?? undefined,
        valueId: row.value_id,
        value: row.value_display_name ?? row.value_represented_value ?? row.value_id,
        representedValue: row.value_represented_value ?? undefined,
        sortOrder: row.attribute_sort_order ?? row.value_sort_order ?? 0,
      });
    }
    variants.set(row.variant_id, variant);
    bySku.set(row.sku_id, variants);
  }
  return new Map(Array.from(bySku, ([skuId, variants]) => [skuId, Array.from(variants.values())]));
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
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [POS_SCHEMA_TABLES],
    );
    const found = new Set(rows.map((row) => row.table_name));
    const missing = POS_SCHEMA_TABLES.filter((tableName) => !found.has(tableName));
    if (missing.length > 0) {
      throw new Error(`POS cloud schema is missing tables: ${missing.join(', ')}. Run Prisma migrations before accepting POS sync traffic.`);
    }
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function upsertLegacyPosRecords(records: LegacySyncPosRecord[], syncRunId: string) {
	if (records.length === 0) return { created: 0, updated: 0, unchanged: 0 };
	await ensurePosCloudSchema();
	const client = await getPool().connect();
	try {
		await client.query('BEGIN');
		const incoming = records.map((record) => ({
			source_table: record.sourceTable,
			source_id: record.sourceId,
			payload: record.data,
		}));
		const changed = await client.query<{ source_table: string; source_id: string; created: boolean }>(
			`WITH incoming AS (
				SELECT source_table, source_id, payload
				FROM jsonb_to_recordset($1::jsonb)
					AS row(source_table text, source_id text, payload jsonb)
			)
			INSERT INTO legacy_pos_records (source_table, source_id, payload)
			SELECT source_table, source_id, payload FROM incoming
			ON CONFLICT (source_table, source_id) DO UPDATE
			SET payload = EXCLUDED.payload, last_synced_at = NOW()
			WHERE legacy_pos_records.payload IS DISTINCT FROM EXCLUDED.payload
			RETURNING source_table, source_id, (xmax = 0) AS created`,
			[JSON.stringify(incoming)],
		);
		const changedKeys = new Set(changed.rows.map((row) => `${row.source_table}\u0000${row.source_id}`));
		const versions = records
			.filter((record) => changedKeys.has(`${record.sourceTable}\u0000${record.sourceId}`))
			.map((record) => {
				const payload = JSON.stringify(record.data);
				return {
					id: randomUUID(), source_table: record.sourceTable, source_id: record.sourceId,
					payload: record.data, content_hash: createHash('sha256').update(payload).digest('hex'),
					sync_run_id: syncRunId,
				};
			});
		if (versions.length > 0) {
			await client.query(
				`INSERT INTO legacy_pos_record_versions
					(id, source_table, source_id, payload, content_hash, sync_run_id)
				 SELECT id, source_table, source_id, payload, content_hash, sync_run_id
				 FROM jsonb_to_recordset($1::jsonb)
					AS row(id text, source_table text, source_id text, payload jsonb, content_hash text, sync_run_id text)
				 ON CONFLICT (source_table, source_id, content_hash) DO NOTHING`,
				[JSON.stringify(versions)],
			);
		}
		await client.query('COMMIT');
		const created = changed.rows.filter((row) => row.created).length;
		return {
			created,
			updated: changed.rows.length - created,
			unchanged: records.length - changed.rows.length,
		};
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

export async function listLegacyPosRecords(args: { sourceTable?: string; page?: number; pageSize?: number }) {
	await ensurePosCloudSchema();
	const page = Math.max(1, args.page ?? 1);
	const pageSize = Math.min(500, Math.max(1, args.pageSize ?? 100));
	const offset = (page - 1) * pageSize;
	const values: unknown[] = [];
	const where = args.sourceTable ? 'WHERE source_table = $1' : '';
	if (args.sourceTable) values.push(args.sourceTable.toLowerCase());
	const limitIndex = values.length + 1;
	const offsetIndex = values.length + 2;
	const inventory = getPool();
	const [items, total, tables] = await Promise.all([
		inventory.query(
			`SELECT source_table, source_id, payload, first_synced_at, last_synced_at
			 FROM legacy_pos_records ${where}
			 ORDER BY source_table, source_id LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
			[...values, pageSize, offset],
		),
		inventory.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM legacy_pos_records ${where}`, values),
		inventory.query<{ source_table: string; count: string }>(
			`SELECT source_table, COUNT(*)::text AS count FROM legacy_pos_records GROUP BY source_table ORDER BY source_table`,
		),
	]);
	return {
		page,
		pageSize,
		total: Number(total.rows[0]?.count ?? 0),
		tables: tables.rows.map((row) => ({ sourceTable: row.source_table, count: Number(row.count) })),
		items: items.rows,
	};
}

export async function getLegacyTableRows(sourceTables: string[]): Promise<Record<string, Array<Record<string, unknown>>>> {
	await ensurePosCloudSchema();
	const normalized = Array.from(new Set(sourceTables.map((table) => table.toLowerCase())));
	if (normalized.length === 0) return {};
	const result = await getPool().query<{ source_table: string; payload: Record<string, unknown> }>(
		`SELECT source_table, payload FROM legacy_pos_records
		 WHERE source_table = ANY($1::text[]) ORDER BY source_table, source_id`,
		[normalized],
	);
	const rows: Record<string, Array<Record<string, unknown>>> = {};
	for (const item of result.rows) {
		(rows[item.source_table] ??= []).push(item.payload);
	}
	return rows;
}

export async function mergePosReferenceData(input: {
  customers?: Array<Record<string, unknown>>;
}) {
  await ensurePosCloudSchema();
  const customers = Array.isArray(input.customers) ? input.customers : [];
  if (customers.length === 0) return;
  await withTransaction(async (client) => {
    for (const customer of customers) {
      const id = typeof customer.id === 'string' ? customer.id.trim() : '';
      const name = typeof customer.name === 'string' ? customer.name.trim() : '';
      if (!id || !name) continue;
      await client.query(
        `INSERT INTO pos_customers (id, code, name, tier, email, phone, notes, credit_limit, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name,
           tier=EXCLUDED.tier, email=EXCLUDED.email, phone=EXCLUDED.phone,
           notes=EXCLUDED.notes, credit_limit=EXCLUDED.credit_limit, updated_at=NOW()`,
        [
          id,
          typeof customer.code === 'string' && customer.code.trim() ? customer.code.trim() : null,
          name,
          typeof customer.tier === 'string' && customer.tier.trim() ? customer.tier.trim() : 'Retail',
          typeof customer.email === 'string' && customer.email.trim() ? customer.email.trim() : null,
          typeof customer.phone === 'string' && customer.phone.trim() ? customer.phone.trim() : null,
          typeof customer.notes === 'string' && customer.notes.trim() ? customer.notes.trim() : null,
          Number.isFinite(Number(customer.creditLimit)) ? Math.max(0, Number(customer.creditLimit)) : 0,
        ],
      );
    }
  });
}

export async function getPosCatalogSnapshot(): Promise<PosCatalogSnapshot> {
  await ensurePosCloudSchema();
  const inventory = getPool();

  const [categoriesResult, skuResult, variantResult, branchesResult, usersResult, customersResult, overlaysResult] = await Promise.all([
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
          SELECT ir.sku_id, COALESCE(SUM(ir.branch_qty), 0) AS stock_on_hand,
            COALESCE(jsonb_object_agg(ir.branch_id, ir.branch_qty) FILTER (WHERE ir.branch_id IS NOT NULL), '{}'::jsonb) AS stock_by_branch
          FROM (
            SELECT records.sku_id, floors.branch_id, SUM(records.quantity) AS branch_qty
            FROM inventory_records records LEFT JOIN floors ON floors.id = records.floor_id
            WHERE records.state = $1 GROUP BY records.sku_id, floors.branch_id
          ) ir
          GROUP BY ir.sku_id
        ),
        preferred_barcodes AS (
          SELECT DISTINCT ON (sku_id) sku_id, barcode
          FROM product_barcodes
          ORDER BY sku_id, is_default DESC, created_at ASC
        ),
        all_barcodes AS (
          SELECT sku_id, array_agg(barcode ORDER BY is_default DESC, created_at ASC) AS barcodes
          FROM product_barcodes
          GROUP BY sku_id
        )
        SELECT
          s.id,
          s.sku_code,
          s.name,
          s.description,
          s.category_id,
          s.unit_of_measure,
          COALESCE(latest.selling_price, s.selling_price) AS selling_price,
          COALESCE(latest.wholesale_price, s.wholesale_price) AS wholesale_price,
          COALESCE(latest.bulk_price, s.bulk_price) AS bulk_price,
          s.batch_pricing,
          pb.barcode,
          COALESCE(ab.barcodes, ARRAY[]::text[]) AS barcodes,
          COALESCE(sr.stock_on_hand, 0) AS stock_on_hand,
          COALESCE(sr.stock_by_branch, '{}'::jsonb) AS stock_by_branch
        FROM skus s
        LEFT JOIN preferred_barcodes pb ON pb.sku_id = s.id
        LEFT JOIN all_barcodes ab ON ab.sku_id = s.id
        LEFT JOIN shelf_ready_stock sr ON sr.sku_id = s.id
        LEFT JOIN LATERAL (
          SELECT selling_price, wholesale_price, bulk_price FROM batches
          WHERE sku_id = s.id AND variant_id IS NULL AND is_active = TRUE
          ORDER BY created_at DESC LIMIT 1
        ) latest ON TRUE
        WHERE s.is_active = TRUE
        ORDER BY s.sku_code ASC
      `,
      [SHELF_READY_STATE],
    ),
    inventory.query<SharedVariantRow>(
      `
        WITH variant_stock AS (
          SELECT ir.variant_id, SUM(ir.branch_qty) AS stock_on_hand,
            COALESCE(jsonb_object_agg(ir.branch_id, ir.branch_qty) FILTER (WHERE ir.branch_id IS NOT NULL), '{}'::jsonb) AS stock_by_branch
          FROM (
            SELECT records.variant_id, floors.branch_id, SUM(records.quantity) AS branch_qty
            FROM inventory_records records LEFT JOIN floors ON floors.id = records.floor_id
            WHERE records.state = $1 AND records.variant_id IS NOT NULL
            GROUP BY records.variant_id, floors.branch_id
          ) ir GROUP BY ir.variant_id
        )
        SELECT v.sku_id, v.id AS variant_id, v.variant_code, v.name AS variant_name,
          COALESCE(vb.barcodes, ARRAY[]::text[]) AS barcodes,
          COALESCE(vs.stock_on_hand, 0) AS variant_stock_on_hand,
          COALESCE(vs.stock_by_branch, '{}'::jsonb) AS stock_by_branch,
          COALESCE(bp.selling_price, s.selling_price) AS selling_price,
          COALESCE(bp.wholesale_price, s.wholesale_price) AS wholesale_price,
          COALESCE(bp.bulk_price, s.bulk_price) AS bulk_price,
          a.id AS attribute_id, a.name AS attribute_name, a.type AS attribute_type,
          a.sort_order AS attribute_sort_order, av.id AS value_id,
          av.display_name AS value_display_name, av.represented_value AS value_represented_value,
          av.sort_order AS value_sort_order
        FROM sku_variants v
        INNER JOIN skus s ON s.id = v.sku_id
        LEFT JOIN variant_stock vs ON vs.variant_id = v.id
        LEFT JOIN LATERAL (
          SELECT array_agg(barcode ORDER BY is_default DESC, created_at ASC) AS barcodes
          FROM product_barcodes
          WHERE variant_id = v.id
        ) vb ON TRUE
        LEFT JOIN LATERAL (
          SELECT selling_price, wholesale_price, bulk_price FROM batches
          WHERE sku_id = v.sku_id AND variant_id = v.id AND is_active = TRUE
          ORDER BY created_at DESC LIMIT 1
        ) bp ON TRUE
        LEFT JOIN sku_variant_values svv ON svv.variant_id = v.id
        LEFT JOIN attributes a ON a.id = svv.attribute_id
        LEFT JOIN attribute_values av ON av.id = svv.attribute_value_id
        WHERE s.is_active = TRUE AND v.is_active = TRUE
        ORDER BY v.variant_code, COALESCE(a.sort_order, 0), COALESCE(av.sort_order, 0)
      `,
      [SHELF_READY_STATE],
    ),
    inventory.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM branches WHERE is_active = TRUE ORDER BY code`,
    ),
    inventory.query<{ id: string; email: string; role: string; access_scope: string; is_salesman: boolean; name: string | null }>(
      `SELECT id, email, role, access_scope, is_salesman, name FROM users WHERE is_active = TRUE AND access_scope IN ('CASHIER','BOTH','ADMIN') ORDER BY email`,
    ),
    inventory.query<{
      id: string; code: string | null; name: string; tier: string; email: string | null;
      phone: string | null; notes: string | null; credit_limit: number;
    }>(`SELECT id, code, name, tier, email, phone, notes, credit_limit FROM pos_customers ORDER BY name`),
    inventory.query<PricingOverlayRow>(
      `SELECT id, name, type, value, applies_to, conditions, priority, stackable, valid_from, valid_to
       FROM pricing_overlays WHERE status = 'active' AND (valid_from IS NULL OR valid_from <= NOW()) AND (valid_to IS NULL OR valid_to >= NOW())
       ORDER BY priority DESC`,
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
  const variantsByProduct = buildProductVariants(variantResult.rows);

  const products = skuResult.rows.map((row) => {
    const categoryMeta = resolveRootCategory(row.category_id, categoriesById);
    return {
      id: row.id,
      sku: row.sku_code,
      barcode: row.barcode ?? undefined,
      barcodes: row.barcodes ?? [],
      name: row.name,
      categoryId: categoryMeta.categoryId,
      subcategory: categoryMeta.subcategory,
      packSize: 1,
      unitLabel: row.unit_of_measure?.trim() || 'pcs',
      stockOnHand: normalizeNumber(row.stock_on_hand),
      stockByBranch: row.stock_by_branch ?? {},
      description: row.description ?? undefined,
      priceTiers: buildPriceTiers(row),
      variants: variantsByProduct.get(row.id) ?? [],
      pricingRules: overlaysResult.rows
        .filter((overlay) => {
          const target = overlay.applies_to ?? {};
          return (!target.skuIds?.length && !target.categoryIds?.length && !target.variantIds?.length)
            || target.skuIds?.includes(row.id)
            || (target.variantIds?.some((id) => (variantsByProduct.get(row.id) ?? []).some((variant) => variant.id === id)) ?? false)
            || (row.category_id != null && target.categoryIds?.includes(row.category_id));
        })
        .map((overlay) => ({
          id: overlay.id, name: overlay.name, type: overlay.type, value: overlay.value,
          priority: overlay.priority, stackable: overlay.stackable,
          ...(overlay.applies_to ?? {}), ...(overlay.conditions ?? {}),
          validFrom: overlay.valid_from?.toISOString(), validTo: overlay.valid_to?.toISOString(),
        })),
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
    branches: branchesResult.rows,
    users: usersResult.rows.map((user) => {
      const name = user.name?.trim() || user.email.split('@')[0]!.replace(/[._-]+/g, ' ');
      return { id: user.id, code: `INV-${user.id.slice(0, 8).toUpperCase()}`, email: user.email,
        name, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase(),
        role: user.access_scope === 'ADMIN' ? 'MANAGER' as const : 'CASHIER' as const,
        accessScope: user.access_scope as 'CASHIER' | 'BOTH' | 'ADMIN', isSalesman: user.is_salesman };
    }),
    customers: customersResult.rows.map((customer) => ({
      id: customer.id,
      code: customer.code ?? customer.id,
      name: customer.name,
      tier: customer.tier,
      email: customer.email ?? undefined,
      phone: customer.phone ?? undefined,
      notes: customer.notes ?? undefined,
      creditLimit: Number(customer.credit_limit) || 0,
    })),
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
    const offset = index * 5;
    values.push(randomUUID(), seq, change.tableName, change.rowId, change.action);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
  });

  await client.query(
    `
      INSERT INTO sync_server_changes (id, seq, table_name, row_id, action)
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
    branchId?: string | null;
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
          SELECT ir.id, ir.quantity
          FROM inventory_records ir
          LEFT JOIN floors f ON f.id = ir.floor_id
          WHERE ir.sku_id = $1
            AND ir.state = $2
            AND (($3::text IS NULL AND ir.variant_id IS NULL) OR ir.variant_id = $3)
            AND ($4::text IS NULL OR f.branch_id = $4)
            AND quantity > 0
          ORDER BY ir.updated_at ASC, ir.created_at ASC
          FOR UPDATE
        `,
        [line.productId, SHELF_READY_STATE, line.variantId ?? null, input.branchId ?? null],
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

      const lineScope = line.variantId ?? 'base';
      const eventId = `${input.aggregateId}-${line.productId}-${lineScope}-sale`;
      await client.query(
        `
          INSERT INTO inventory_events (
            id,
            event_type,
            parent_entity_id,
            quantity_delta,
            before_quantity,
            after_quantity,
            reason_code,
            terminal_id,
            metadata
          )
          VALUES ($1, 'MANUAL_ADJUSTMENT', $2, $3, NULL, NULL, 'POS_SALE', $4, $5)
        `,
        [
          eventId,
          changedRecordIds[0] ?? line.productId,
          requestedQuantity * -1,
          input.terminalId ?? null,
          {
            source: 'POS',
            receiptNumber: input.receiptNumber,
            sku: line.sku,
          },
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
    branchId?: string | null;
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

      const lineScope = line.variantId ?? 'base';
      const recordId = `${input.aggregateId}-${line.productId}-${lineScope}-restock`;
      const floor = input.branchId
        ? (await client.query<{ id: string }>(
            `SELECT id FROM floors WHERE branch_id = $1 AND is_active = TRUE ORDER BY sort_order, created_at LIMIT 1`,
            [input.branchId],
          )).rows[0]
        : undefined;
      await client.query(
        `
          INSERT INTO inventory_records (
            id,
            sku_id,
            variant_id,
            floor_id,
            quantity,
            state,
            terminal_id,
            version,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE
          SET quantity = inventory_records.quantity + EXCLUDED.quantity,
              terminal_id = EXCLUDED.terminal_id,
              version = inventory_records.version + 1,
              updated_at = NOW()
        `,
        [recordId, line.productId, line.variantId ?? null, floor?.id ?? null, quantity, SHELF_READY_STATE, input.terminalId ?? null],
      );

      const eventId = `${input.aggregateId}-${line.productId}-${lineScope}-restock-event`;
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
    branchId?: string | null;
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
    branchId?: string | null;
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
      JSON.stringify(payload.lines ?? []),
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

async function redeemSaleVouchers(client: PoolClient, event: SyncEvent, payload: SaleCompletedPayload) {
  const grouped = new Map<string, number>();
  for (const rawPayment of payload.payments) {
    const payment = asObject(rawPayment);
    if (asOptionalString(payment.method) !== 'GIFT') continue;
    const code = asOptionalString(payment.reference)?.trim();
    const amount = normalizeNumber(payment.amount);
    if (!code || amount <= 0) throw new Error('Gift-voucher payments require a code and a positive amount');
    grouped.set(code, (grouped.get(code) ?? 0) + amount);
  }

  for (const [code, amount] of grouped) {
    const voucher = (await client.query<any>(`
      SELECT id, current_balance, status, expires_at, activated_at
      FROM voucher_codes WHERE code = $1 FOR UPDATE
    `, [code])).rows[0];
    if (!voucher) throw new Error(`Voucher ${code} was not found`);
    if (String(voucher.status).toLowerCase() !== 'active') throw new Error(`Voucher ${code} is ${voucher.status}`);
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) throw new Error(`Voucher ${code} has expired`);
    const before = normalizeNumber(voucher.current_balance);
    if (amount > before) throw new Error(`Voucher ${code} has insufficient balance`);
    const after = Math.round((before - amount) * 100) / 100;
    await client.query(`
      UPDATE voucher_codes SET current_balance = $1, status = $2,
        activated_at = COALESCE(activated_at, NOW()), fully_redeemed_at = CASE WHEN $1 <= 0 THEN NOW() ELSE NULL END,
        updated_at = NOW() WHERE id = $3
    `, [after, after <= 0 ? 'redeemed' : 'active', voucher.id]);
    await client.query(`
      INSERT INTO voucher_redemptions (
        id, voucher_code_id, code, redeemed_amount, balance_before, balance_after,
        order_id, invoice_number, branch_id, applied_to_items, redeemed_by, redeemed_at, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
    `, [randomUUID(), voucher.id, code, amount, before, after, event.aggregateId, payload.receiptNumber,
      payload.branchId ?? null, JSON.stringify(payload.lines), payload.cashierId ?? null, `POS ${payload.terminalId}`]);
  }
}

async function refundSaleVouchers(client: PoolClient, saleId: string, refundId: string, requestedAmount?: number) {
  const balances = await client.query<any>(`
    SELECT voucher_code_id, code, SUM(redeemed_amount) AS net_redeemed
    FROM voucher_redemptions WHERE order_id = $1 GROUP BY voucher_code_id, code HAVING SUM(redeemed_amount) > 0
    ORDER BY code
  `, [saleId]);
  let remaining = requestedAmount == null ? Number.POSITIVE_INFINITY : Math.max(0, requestedAmount);
  for (const row of balances.rows) {
    if (remaining <= 0) break;
    const voucher = (await client.query<any>(`SELECT id, current_balance, initial_value FROM voucher_codes WHERE id=$1 FOR UPDATE`, [row.voucher_code_id])).rows[0];
    if (!voucher) continue;
    const amount = Math.min(normalizeNumber(row.net_redeemed), remaining);
    const before = normalizeNumber(voucher.current_balance);
    const after = Math.min(normalizeNumber(voucher.initial_value), Math.round((before + amount) * 100) / 100);
    const restored = after - before;
    if (restored <= 0) continue;
    await client.query(`UPDATE voucher_codes SET current_balance=$1,status='active',fully_redeemed_at=NULL,updated_at=NOW() WHERE id=$2`, [after, voucher.id]);
    await client.query(`
      INSERT INTO voucher_redemptions (id,voucher_code_id,code,redeemed_amount,balance_before,balance_after,order_id,applied_to_items,redeemed_at,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)
    `, [randomUUID(), voucher.id, row.code, -restored, before, after, saleId, JSON.stringify([]), `Voucher refund ${refundId}`]);
    remaining -= restored;
  }
}

async function applySaleCompletedEvent(client: PoolClient, event: SyncEvent) {
  const payload = parseSaleCompletedPayload(event.payload);
  const existing = (await client.query(`SELECT id FROM pos_sales WHERE id = $1 LIMIT 1`, [event.aggregateId])).rows[0];
  if (existing) {
    return;
  }

  await redeemSaleVouchers(client, event, payload);

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
      JSON.stringify(payload.lines ?? []),
      JSON.stringify(payload.payments ?? []),
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

  try {
    await applySharedInventorySale({
      aggregateId: event.aggregateId,
      receiptNumber: payload.receiptNumber,
      terminalId: payload.terminalId,
      branchId: payload.branchId,
      lines: payload.lines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        quantity: line.quantity,
        name: line.name,
        variantId: line.variantId ?? null,
        variantCode: line.variantCode ?? null,
        variantName: line.variantName ?? null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inventory adjustment failed';
    if (!message.startsWith('Insufficient ShelfReady stock')) {
      throw error;
    }

    // A stock reconciliation problem must not discard an otherwise valid POS
    // sale or block every later event from this workstation. Keep the sale,
    // acknowledge the event, and surface the stock discrepancy for review.
    await client.query(
      `
        INSERT INTO pos_sync_conflicts (
          id, aggregate_type, aggregate_id, local_event_id, remote_event_id,
          policy, status, detail
        )
        VALUES ($1, 'inventory', $2, NULL, $3, 'MANUAL', 'OPEN', $4)
        ON CONFLICT (id) DO UPDATE SET detail = EXCLUDED.detail, status = 'OPEN'
      `,
      [
        `${event.id}-inventory-shortage`,
        event.aggregateId,
        event.id,
        {
          reason: 'INSUFFICIENT_SHELF_READY_STOCK',
          message,
          receiptNumber: payload.receiptNumber,
          terminalId: payload.terminalId ?? null,
          branchId: payload.branchId ?? null,
          lines: payload.lines,
        },
      ],
    );
  }
}

async function applyCustomerUpsertedEvent(client: PoolClient, event: SyncEvent) {
  const payload = event.payload;
  const name = typeof payload.name === 'string' && payload.name.trim()
    ? payload.name.trim()
    : event.aggregateId;
  const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

  await client.query(
    `
      INSERT INTO pos_customers (
        id, code, name, tier, email, phone, notes, credit_limit,
        source_device_id, source_sequence_num, last_vector_clock, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
      SET code = EXCLUDED.code,
          name = EXCLUDED.name,
          tier = EXCLUDED.tier,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          notes = EXCLUDED.notes,
          credit_limit = EXCLUDED.credit_limit,
          source_device_id = EXCLUDED.source_device_id,
          source_sequence_num = EXCLUDED.source_sequence_num,
          last_vector_clock = EXCLUDED.last_vector_clock,
          updated_at = NOW()
    `,
    [
      event.aggregateId,
      optionalText(payload.code),
      name,
      optionalText(payload.tier) ?? 'Retail',
      optionalText(payload.email),
      optionalText(payload.phone),
      optionalText(payload.notes),
      Math.max(0, normalizeNumber(payload.creditLimit, 0)),
      event.deviceId,
      event.sequenceNum,
      event.vectorClock,
    ],
  );
}

async function applyCreditPaymentRecordedEvent(client: PoolClient, event: SyncEvent) {
  const payload = event.payload;
  const customerId = typeof payload.customerId === 'string' ? payload.customerId.trim() : '';
  const amount = normalizeNumber(payload.amount, Number.NaN);
  if (!customerId) {
    throw new Error('A credit payment requires a customer');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('A credit payment requires a positive amount');
  }

  const existing = (await client.query(
    `SELECT id FROM pos_credit_payments WHERE id = $1 LIMIT 1`,
    [event.aggregateId],
  )).rows[0];
  if (existing) {
    return;
  }

  await client.query(
    `
      INSERT INTO pos_credit_payments (
        id, customer_id, amount, method, note, terminal_id, user_id, shift_id,
        source_device_id, source_sequence_num, last_vector_clock, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      event.aggregateId,
      customerId,
      amount,
      typeof payload.method === 'string' && payload.method.trim() ? payload.method.trim() : 'CASH',
      typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim() : null,
      typeof payload.terminalId === 'string' && payload.terminalId.trim() ? payload.terminalId.trim() : null,
      typeof payload.userId === 'string' && payload.userId.trim() ? payload.userId.trim() : null,
      typeof payload.shiftId === 'string' && payload.shiftId.trim() ? payload.shiftId.trim() : null,
      event.deviceId,
      event.sequenceNum,
      event.vectorClock,
      event.createdAt,
    ],
  );
}

async function getSaleRow(client: PoolClient, saleId: string) {
  const row = (await client.query(
    `SELECT receipt_number, terminal_id, branch_id, lines, status FROM pos_sales WHERE id = $1 LIMIT 1`,
    [saleId],
  )).rows[0];

  if (!row) {
    return null;
  }

  return {
    receipt_number: row.receipt_number as string,
    terminal_id: row.terminal_id as string,
    branch_id: row.branch_id as string | null,
    lines: (row.lines ?? []) as SharedSaleLine[],
    status: row.status as string,
  };
}

async function applySaleVoidedEvent(client: PoolClient, event: SyncEvent) {
  const sale = await getSaleRow(client, String(event.payload.saleId));
  if (!sale || sale.status === 'VOIDED') {
    return;
  }
  const priorReturn = (await client.query(
    `SELECT id FROM pos_returns WHERE sale_id = $1 LIMIT 1`,
    [event.payload.saleId],
  )).rows[0];
  if (sale.status !== 'COMPLETED' || priorReturn) {
    throw new Error('Only a completed sale with no returns can be voided');
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

  await refundSaleVouchers(client, String(event.payload.saleId), event.aggregateId);

  await applySharedInventoryVoid({
    aggregateId: String(event.payload.saleId),
    terminalId: sale.terminal_id,
    branchId: sale.branch_id,
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
  if (!sale || sale.status !== 'COMPLETED') {
    throw new Error('Only a completed sale can be returned');
  }
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
      JSON.stringify(lines),
      event.deviceId,
      event.sequenceNum,
      event.vectorClock,
    ],
  );

  await refundSaleVouchers(client, String(payload.saleId), event.aggregateId, totalRefund);

  const returnRows = (await client.query<{ lines: ReturnLinePayload[] }>(
    `SELECT lines FROM pos_returns WHERE sale_id = $1`,
    [payload.saleId],
  )).rows;
  const returnedByLine = new Map<string, number>();
  for (const row of returnRows) {
    for (const line of row.lines ?? []) {
      returnedByLine.set(line.saleLineId, (returnedByLine.get(line.saleLineId) ?? 0) + line.quantity);
    }
  }
  const fullyRefunded = sale.lines.every((line) => {
    const lineId = line.id ?? line.uid ?? '';
    return lineId !== '' && (returnedByLine.get(lineId) ?? 0) >= line.quantity;
  });
  await client.query(
    `
      UPDATE pos_sales
      SET status = $1,
          synced = TRUE,
          last_vector_clock = $2,
          updated_at = NOW()
      WHERE id = $3
    `,
    [fullyRefunded ? 'REFUNDED' : 'COMPLETED', event.vectorClock, payload.saleId],
  );

  await applySharedInventoryReturn({
    aggregateId: event.aggregateId,
    terminalId: payload.terminalId,
    branchId: sale.branch_id,
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
        variantId: matchedSaleLine?.variantId ?? null,
        variantCode: matchedSaleLine?.variantCode ?? null,
        variantName: matchedSaleLine?.variantName ?? null,
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
    case 'CUSTOMER_UPSERTED':
      await applyCustomerUpsertedEvent(client, event);
      return;
    case 'CREDIT_PAYMENT_RECORDED':
      await applyCreditPaymentRecordedEvent(client, event);
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
      acceptedEventIds.push(normalizedEvent.id);
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
