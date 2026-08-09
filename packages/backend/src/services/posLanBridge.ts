import prisma from '../prisma/client';

export async function ensurePosLanQueue() {
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS pos_lan_sync_queue (
      event_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      sequence_num INTEGER NOT NULL,
      vector_clock TEXT NOT NULL,
      event_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT,
      last_error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await (prisma as any).$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_pos_lan_sync_queue_status
    ON pos_lan_sync_queue(status, created_at)
  `);
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS pos_lan_sale_lines (
      sale_id TEXT NOT NULL,
      sale_line_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      variant_id TEXT,
      branch_id TEXT,
      quantity REAL NOT NULL,
      terminal_id TEXT,
      receipt_number TEXT,
      PRIMARY KEY (sale_id, sale_line_id)
    )
  `);
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

async function addShelfReadyStock(tx: any, input: {
  eventId: string;
  skuId: string;
  variantId?: string | null;
  branchId?: string | null;
  terminalId?: string | null;
  quantity: number;
  reference?: string | null;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return;
  const floorRows = input.branchId
    ? await tx.$queryRawUnsafe(
        `SELECT id FROM floors WHERE branch_id = ? AND is_active = 1 ORDER BY sort_order, created_at LIMIT 1`,
        input.branchId
      ) as Array<{ id: string }>
    : [];
  const scope = input.variantId ?? 'base';
  const recordId = `${input.eventId}-${input.skuId}-${scope}-restock`;
  await tx.$executeRawUnsafe(
    `INSERT INTO inventory_records
     (id, sku_id, variant_id, floor_id, quantity, state, terminal_id, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ShelfReady', ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       quantity = inventory_records.quantity + excluded.quantity,
       terminal_id = excluded.terminal_id,
       version = inventory_records.version + 1,
       updated_at = datetime('now')`,
    recordId,
    input.skuId,
    input.variantId ?? null,
    floorRows[0]?.id ?? null,
    input.quantity,
    input.terminalId ?? null
  );
  await tx.$executeRawUnsafe(
    `INSERT OR IGNORE INTO inventory_events
     (id, event_type, parent_entity_id, quantity_delta, reason_code, terminal_id, metadata)
     VALUES (?, 'MANUAL_ADJUSTMENT', ?, ?, 'POS_RETURN', ?, ?)`,
    `${recordId}-event`,
    recordId,
    input.quantity,
    input.terminalId ?? null,
    JSON.stringify({ source: 'POS_LAN', reference: input.reference ?? null })
  );
}

async function applySaleCompleted(tx: any, event: Record<string, any>) {
  const payload = objectValue(event.payload);
  const lines = Array.isArray(payload.lines) ? payload.lines.map(objectValue) : [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const skuId = typeof line.productId === 'string' ? line.productId : '';
    const variantId = typeof line.variantId === 'string' ? line.variantId : null;
    const quantity = Number(line.quantity);
    if (!skuId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('A relayed POS sale contains an invalid line.');
    }
    const records = await tx.$queryRawUnsafe(
      `SELECT ir.id, ir.quantity
       FROM inventory_records ir
       LEFT JOIN floors f ON f.id = ir.floor_id
       WHERE ir.sku_id = ?
         AND ir.state = 'ShelfReady'
         AND ((? IS NULL AND ir.variant_id IS NULL) OR ir.variant_id = ?)
         AND (? IS NULL OR f.branch_id = ?)
         AND ir.quantity > 0
       ORDER BY ir.updated_at ASC, ir.created_at ASC`,
      skuId,
      variantId,
      variantId,
      payload.branchId ?? null,
      payload.branchId ?? null
    ) as Array<{ id: string; quantity: number }>;
    const total = records.reduce((sum, record) => sum + Number(record.quantity), 0);
    if (total < quantity) throw new Error(`Insufficient ShelfReady stock for ${line.sku ?? skuId}.`);
    let remaining = quantity;
    const changedRecordIds: string[] = [];
    for (const record of records) {
      if (remaining <= 0) break;
      const deduction = Math.min(remaining, Number(record.quantity));
      await tx.$executeRawUnsafe(
        `UPDATE inventory_records
         SET quantity = quantity - ?, source_event_id = ?, terminal_id = ?,
             version = version + 1, updated_at = datetime('now')
         WHERE id = ?`,
        deduction,
        event.aggregateId ?? event.id,
        payload.terminalId ?? null,
        record.id
      );
      changedRecordIds.push(record.id);
      remaining -= deduction;
    }
    const saleLineId = typeof line.uid === 'string' ? line.uid : `${event.id}-${lineIndex}`;
    await tx.$executeRawUnsafe(
      `INSERT OR REPLACE INTO pos_lan_sale_lines
       (sale_id, sale_line_id, sku_id, variant_id, branch_id, quantity, terminal_id, receipt_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      event.aggregateId ?? event.id,
      saleLineId,
      skuId,
      variantId,
      payload.branchId ?? null,
      quantity,
      payload.terminalId ?? null,
      payload.receiptNumber ?? null
    );
    await tx.$executeRawUnsafe(
      `INSERT OR IGNORE INTO inventory_events
       (id, event_type, parent_entity_id, quantity_delta, reason_code, terminal_id, metadata)
       VALUES (?, 'MANUAL_ADJUSTMENT', ?, ?, 'POS_SALE', ?, ?)`,
      `${event.id}-${lineIndex}-sale`,
      changedRecordIds[0] ?? skuId,
      quantity * -1,
      payload.terminalId ?? null,
      JSON.stringify({ source: 'POS_LAN', receiptNumber: payload.receiptNumber, sku: line.sku })
    );
  }
}

async function applyReturnCreated(tx: any, event: Record<string, any>) {
  const payload = objectValue(event.payload);
  const lines = Array.isArray(payload.lines) ? payload.lines.map(objectValue) : [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    const skuId = typeof line.productId === 'string' ? line.productId : '';
    if (!skuId || !Number.isFinite(quantity) || quantity <= 0) continue;
    const storedLines = typeof payload.saleId === 'string' && typeof line.saleLineId === 'string'
      ? await tx.$queryRawUnsafe(
          `SELECT variant_id, branch_id FROM pos_lan_sale_lines
           WHERE sale_id = ? AND sale_line_id = ? LIMIT 1`,
          payload.saleId,
          line.saleLineId
        ) as Array<{ variant_id: string | null; branch_id: string | null }>
      : [];
    await addShelfReadyStock(tx, {
      eventId: event.aggregateId ?? event.id,
      skuId,
      variantId: typeof line.variantId === 'string' ? line.variantId : storedLines[0]?.variant_id ?? null,
      branchId: storedLines[0]?.branch_id ?? null,
      terminalId: payload.terminalId ?? null,
      quantity,
      reference: payload.saleId ?? null,
    });
  }
}

async function applySaleVoided(tx: any, event: Record<string, any>) {
  const payload = objectValue(event.payload);
  const saleId = typeof payload.saleId === 'string' ? payload.saleId : '';
  if (!saleId) return;
  const lines = await tx.$queryRawUnsafe(
    `SELECT * FROM pos_lan_sale_lines WHERE sale_id = ?`,
    saleId
  ) as Array<{
    sku_id: string;
    variant_id: string | null;
    branch_id: string | null;
    quantity: number;
    terminal_id: string | null;
    receipt_number: string | null;
  }>;
  for (const line of lines) {
    await addShelfReadyStock(tx, {
      eventId: event.aggregateId ?? event.id,
      skuId: line.sku_id,
      variantId: line.variant_id,
      branchId: line.branch_id,
      terminalId: line.terminal_id,
      quantity: Number(line.quantity),
      reference: line.receipt_number,
    });
  }
}

async function applyPosInventoryProjection(tx: any, event: Record<string, any>) {
  if (event.eventType === 'SALE_COMPLETED') await applySaleCompleted(tx, event);
  if (event.eventType === 'RETURN_CREATED') await applyReturnCreated(tx, event);
  if (event.eventType === 'SALE_VOIDED') await applySaleVoided(tx, event);
}

export async function getPosLanVectorClock() {
  await ensurePosLanQueue();
  const rows = await (prisma as any).$queryRawUnsafe(`
    SELECT device_id, MAX(sequence_num) AS sequence_num
    FROM pos_lan_sync_queue
    GROUP BY device_id
  `) as Array<{ device_id: string; sequence_num: number | bigint }>;
  return Object.fromEntries(rows.map((row) => [row.device_id, Number(row.sequence_num)]));
}

export async function queuePosLanPlayback(input: {
  deviceId: string;
  terminalId: string;
  vectorClock: Record<string, number>;
  events: Array<Record<string, unknown>>;
}) {
  await ensurePosLanQueue();
  const acceptedEventIds: string[] = [];
  await (prisma as any).$transaction(async (tx: any) => {
    for (const event of input.events) {
      const eventId = typeof event.id === 'string' ? event.id.trim() : '';
      if (!eventId) continue;
      const sequenceNum = Number.isInteger(event.sequenceNum) ? Number(event.sequenceNum) : 0;
      const inserted = await tx.$executeRawUnsafe(
        `INSERT OR IGNORE INTO pos_lan_sync_queue
         (event_id, device_id, terminal_id, sequence_num, vector_clock, event_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        eventId,
        input.deviceId,
        input.terminalId,
        sequenceNum,
        JSON.stringify(input.vectorClock ?? {}),
        JSON.stringify(event)
      );
      if (Number(inserted) > 0) await applyPosInventoryProjection(tx, event);
      acceptedEventIds.push(eventId);
    }
  });
  return {
    acceptedEventIds,
    remoteEvents: [],
    serverVectorClock: await getPosLanVectorClock(),
    conflicts: [],
  };
}
