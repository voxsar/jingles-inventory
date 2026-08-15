import { Request, Response, Router } from 'express';
import { authenticatePosSyncRequest } from '../middleware/posSyncAuth';
import {
  ensurePosCloudSchema,
  getPosCatalogSnapshot,
  listLegacyPosRecords,
  mergePosReferenceData,
  posSyncConfirm,
  posSyncHandshake,
  posSyncPlayback,
} from '../services/posCloud';
import { validateVoucher } from '../services/voucherService';
import { isLocalReplicaMode } from '../utils/runtimePaths';
import { getPosLanVectorClock, queuePosLanPlayback } from '../services/posLanBridge';
import { lookupBarcode } from '../modules/barcode/barcodeProcessor';
import { createBatch } from '../modules/batch/batchService';
import prisma from '../prisma/client';

const router = Router();

function readVectorClock(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, number>;
}

router.use(async (_req, res, next) => {
  if (isLocalReplicaMode()) {
    next();
    return;
  }
  try {
    await ensurePosCloudSchema();
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'POS cloud sync service is unavailable' });
  }
});

router.use(authenticatePosSyncRequest);

type PosCustomerListRow = {
  id: string;
  code: string | null;
  name: string;
  tier: string;
  email: string | null;
  phone: string | null;
  credit_limit: number;
  credit_balance: number;
};

function creditAmount(payments: unknown) {
  if (!Array.isArray(payments)) return 0;
  return payments.reduce((total, payment) => {
    if (!payment || typeof payment !== 'object') return total;
    const record = payment as Record<string, unknown>;
    if (record.method !== 'CREDIT') return total;
    const amount = Number(record.amount);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

router.get('/customers', async (_req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'Customer accounts are available from the cloud host.' });
    }
    const rows = await prisma.$queryRaw<PosCustomerListRow[]>`
      SELECT
        customer.id,
        customer.code,
        customer.name,
        customer.tier,
        customer.email,
        customer.phone,
        customer.credit_limit,
        GREATEST(0, COALESCE(sales.credit_owed, 0) - COALESCE(repayments.credit_repaid, 0)) AS credit_balance
      FROM pos_customers customer
      LEFT JOIN (
        SELECT sale.customer_id, SUM((payment.item ->> 'amount')::double precision) AS credit_owed
        FROM pos_sales sale
        CROSS JOIN LATERAL jsonb_array_elements(sale.payments) AS payment(item)
        WHERE sale.status = 'COMPLETED' AND payment.item ->> 'method' = 'CREDIT'
        GROUP BY sale.customer_id
      ) sales ON sales.customer_id = customer.id
      LEFT JOIN (
        SELECT customer_id, SUM(amount) AS credit_repaid
        FROM pos_credit_payments
        GROUP BY customer_id
      ) repayments ON repayments.customer_id = customer.id
      ORDER BY customer.name ASC
    `;
    return res.json(rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      tier: row.tier,
      email: row.email,
      phone: row.phone,
      creditLimit: Number(row.credit_limit),
      creditBalance: Number(row.credit_balance),
      availableCredit: Math.max(0, Number(row.credit_limit) - Number(row.credit_balance)),
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load customer accounts' });
  }
});

router.get('/customers/:id', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'Customer accounts are available from the cloud host.' });
    }
    const customer = await prisma.posCustomer.findUnique({ where: { id: req.params.id } });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const [sales, creditPayments] = await Promise.all([
      prisma.posSale.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' } }),
      prisma.posCreditPayment.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const creditOwed = sales
      .filter((sale) => sale.status === 'COMPLETED')
      .reduce((total, sale) => total + creditAmount(sale.payments), 0);
    const creditRepaid = creditPayments.reduce((total, payment) => total + payment.amount, 0);
    const creditBalance = Math.max(0, creditOwed - creditRepaid);

    return res.json({
      customer: {
        ...customer,
        creditBalance,
        availableCredit: Math.max(0, customer.creditLimit - creditBalance),
      },
      sales,
      creditPayments,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load customer account' });
  }
});

router.get('/catalog/snapshot', async (_req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'The LAN hub catalog is still converging; use the cloud fallback.' });
    }
    return res.json(await getPosCatalogSnapshot());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load the POS catalog snapshot' });
  }
});

/**
 * Lets a POS terminal make a price-override typed at the till (see the
 * "<price>-<code>" checkout shorthand) stick permanently, by recording it as
 * a new batch-pricing entry — the same mechanism the catalog snapshot
 * already reads the "current" price from (`getPosCatalogSnapshot` takes the
 * most recently created active batch's `sellingPrice` over the SKU's base
 * price), so it takes effect on the terminal's very next catalog sync with
 * no other code path involved.
 *
 * Deliberately terse: a cashier confirming this mid-sale has no vendor,
 * expiry, or manufacturing date to give it, and receipt printing can't wait
 * on a form. `createBatch` already tolerates every batch field but
 * `skuId`/`sellingPrice` being absent, so the note and timestamp are the
 * only audit trail, both filled in from what the POS already knows.
 */
router.post('/pricing/override', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'Price overrides need the cloud host; the LAN hub cannot write pricing.' });
    }

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const price = Number(req.body?.price);
    const tierLabel = typeof req.body?.tierLabel === 'string' ? req.body.tierLabel.trim() : 'Retail';
    const tierKey = tierLabel.toLowerCase();
    const tierPrices = req.body?.tierPrices && typeof req.body.tierPrices === 'object' ? req.body.tierPrices : {};
    const terminalId = typeof req.body?.terminalId === 'string' ? req.body.terminalId.trim() : '';
    const cashierName = typeof req.body?.cashierName === 'string' ? req.body.cashierName.trim() : '';
    const receiptReference = typeof req.body?.receiptReference === 'string' ? req.body.receiptReference.trim() : '';

    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'price must be a positive, finite number' });
    }
    if (!['retail', 'wholesale', 'bulk'].includes(tierKey)) {
      return res.status(400).json({ error: `Unsupported price tier ${tierLabel}` });
    }

    const lookup = await lookupBarcode(code);
    if (!lookup.found || !lookup.sku) {
      return res.status(404).json({ error: `No product matches code ${code}` });
    }

    const notes = [
      'POS price override',
      `tier ${tierLabel}`,
      terminalId && `terminal ${terminalId}`,
      cashierName && `by ${cashierName}`,
      receiptReference && `sale ${receiptReference}`,
      new Date().toISOString(),
    ].filter(Boolean).join(' - ');

    const batch = await createBatch({
      skuId: lookup.sku.id,
      variantId: lookup.variant?.id ?? null,
      sellingPrice: tierKey === 'retail' ? price : Number(tierPrices.retail) || null,
      wholesalePrice: tierKey === 'wholesale' ? price : Number(tierPrices.wholesale) || null,
      bulkPrice: tierKey === 'bulk' ? price : Number(tierPrices.bulk) || null,
      notes,
    });

    return res.status(201).json({
      sku: { id: lookup.sku.id, skuCode: lookup.sku.skuCode, name: lookup.sku.name },
      variant: lookup.variant ? { id: lookup.variant.id, variantCode: lookup.variant.variantCode } : null,
      batch: {
        id: batch.id,
        batchNumber: batch.batchNumber,
        sellingPrice: batch.sellingPrice,
        wholesalePrice: batch.wholesalePrice,
        bulkPrice: batch.bulkPrice,
        createdAt: batch.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to record the price override' });
  }
});

router.get('/legacy-records', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'Legacy POS records are available from the cloud host.' });
    }
    return res.json(await listLegacyPosRecords({
      sourceTable: typeof req.query.sourceTable === 'string' ? req.query.sourceTable : undefined,
      page: typeof req.query.page === 'string' ? Number(req.query.page) : undefined,
      pageSize: typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : undefined,
    }));
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? 'Failed to load legacy POS records' });
  }
});

router.post('/vouchers/validate', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.status(503).json({ error: 'Voucher validation requires the cloud host.' });
    }
    const result = await validateVoucher(req.body);
    return res.status(result.isValid ? 200 : 422).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Voucher validation failed' });
  }
});

router.post('/sync/handshake', async (req: Request, res: Response) => {
  try {
    if (isLocalReplicaMode()) {
      return res.json({
        serverVectorClock: await getPosLanVectorClock(),
        pendingRemoteCount: 0,
        conflictCount: 0,
      });
    }
    await mergePosReferenceData({
      customers: Array.isArray(req.body?.customers) ? req.body.customers : [],
    });
    return res.json(await posSyncHandshake(readVectorClock(req.body?.vectorClock)));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'POS sync handshake failed' });
  }
});

router.post('/sync/playback', async (req: Request, res: Response) => {
  try {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    const terminalId = typeof req.body?.terminalId === 'string' ? req.body.terminalId.trim() : '';
    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    if (!deviceId || !terminalId) {
      return res.status(400).json({ error: 'deviceId and terminalId are required' });
    }

    if (isLocalReplicaMode()) {
      return res.json(await queuePosLanPlayback({
        deviceId,
        terminalId,
        vectorClock: readVectorClock(req.body?.vectorClock),
        events,
      }));
    }

    return res.json(
      await posSyncPlayback({
        deviceId,
        terminalId,
        vectorClock: readVectorClock(req.body?.vectorClock),
        events,
      }),
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'POS sync playback failed' });
  }
});

router.post('/sync/confirm', async (req: Request, res: Response) => {
  try {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    const terminalId = typeof req.body?.terminalId === 'string' ? req.body.terminalId.trim() : '';

    if (!deviceId || !terminalId) {
      return res.status(400).json({ error: 'deviceId and terminalId are required' });
    }


    if (isLocalReplicaMode()) {
      return res.json({ serverVectorClock: await getPosLanVectorClock() });
    }

    return res.json({
      serverVectorClock: await posSyncConfirm({
        deviceId,
        terminalId,
        vectorClock: readVectorClock(req.body?.vectorClock),
      }),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'POS sync confirmation failed' });
  }
});

export default router;
