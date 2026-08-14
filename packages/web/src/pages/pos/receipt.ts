import type { CartLine, Payment } from './types';
import { receiptQrSvg } from '../../utils/receiptQrCode';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Renders a `Cashier | Salesman` / `Terminal | Receipt` style two-column meta block. */
function metaGrid(rows: Array<[string, string, string, string]>) {
  return `<div class="meta-grid">${rows
    .map(
      ([leftLabel, leftValue, rightLabel, rightValue]) => `
      <div class="meta-cell"><span class="label">${escapeHtml(leftLabel)}</span><span class="value">${escapeHtml(leftValue) || '—'}</span></div>
      <div class="meta-cell right-col"><span class="label">${escapeHtml(rightLabel)}</span><span class="value">${escapeHtml(rightValue) || '—'}</span></div>`
    )
    .join('')}</div>`;
}

function printHtml(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
    /* Sized for a standard 80mm thermal roll: most drivers give ~72-76mm of
       printable width, so the page keeps a small margin inside that. */
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { background: #fff; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.35; width: 76mm; margin: 0 auto; padding: 3mm 2mm; color: #111; }
    h1 { font-size: 14px; text-align: center; margin: 0 0 1mm; letter-spacing: 0.02em; }
    .muted { color: #555; }
    .center { text-align: center; }
    .tiny { font-size: 9px; }
    .bold { font-weight: bold; }
    .addr { font-size: 10px; margin: 0 0 0.5mm; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    hr { border: none; border-top: 1px dashed #999; margin: 2mm 0; }

    /* Cashier/Terminal on the left, Salesman(s)/Receipt on the right — two
       label+value pairs per row, laid out as a strict 2-column grid so both
       sides stay aligned regardless of value length. */
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; row-gap: 1mm; column-gap: 2mm; margin: 1.5mm 0; font-size: 10px; }
    .meta-cell { display: flex; flex-direction: column; min-width: 0; }
    .meta-cell.right-col { text-align: right; align-items: flex-end; }
    .meta-cell .label { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
    .meta-cell .value { font-weight: 600; overflow-wrap: break-word; }

    /* Item table — one row per line so price/qty/amount always sit on the
       same line as the product, not wrapped onto a misaligned second row.
       Fixed column widths keep every row's numbers stacked under the header. */
    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 1mm 0; }
    table.items col.idx { width: 7%; }
    table.items col.prod { width: 43%; }
    table.items col.price { width: 17%; }
    table.items col.qty { width: 15%; }
    table.items col.amount { width: 18%; }
    table.items thead th { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; text-align: left; padding: 0 1px 1mm; border-bottom: 1px solid #333; }
    table.items thead th.num { text-align: right; }
    table.items td { padding: 1mm 1px; vertical-align: top; word-break: break-word; }
    table.items tbody tr.item + tr.item td { border-top: 1px dashed #ddd; }
    table.items td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    table.items .sku { display: block; font-size: 8.5px; color: #777; }
    table.items tr.discount td { font-size: 9px; color: #777; }

    .right { text-align: right; }
    .total { font-size: 15px; font-weight: bold; }
    .qr-wrap { display: flex; justify-content: center; margin: 2mm 0 1mm; }
    .qr-wrap svg { display: block; }
  </style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export function printReceipt(params: {
  receiptNumber: string;
  createdAt: string | Date;
  branchName?: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  terminalLabel?: string;
  cashierEmail?: string;
  /** One or more salespeople on this sale — a comma/semicolon separated string or an array. */
  salesman?: string | string[] | null;
  customerName?: string | null;
  lines: CartLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  payments: Payment[];
  currency: string;
}) {
  const rows = params.lines
    .map((line, i) => {
      const lineTotal = line.qty * line.unitPrice - line.lineDiscount;
      const priceMark = line.isWholesale ? '<span class="tiny muted"> WS</span>' : '';
      const discountRow =
        line.lineDiscount > 0
          ? `<tr class="discount"><td></td><td colspan="3">Discount</td><td class="num">-${line.lineDiscount.toFixed(2)}</td></tr>`
          : '';
      return `<tr class="item">
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(line.name)}<span class="sku">${escapeHtml(line.skuCode)}</span></td>
        <td class="num">${line.unitPrice.toFixed(2)}${priceMark}</td>
        <td class="num">${line.enteredQty} ${escapeHtml(line.enteredUnit)}</td>
        <td class="num">${lineTotal.toFixed(2)}</td>
      </tr>${discountRow}`;
    })
    .join('');

  const paymentRows = params.payments
    .map((p) => `<div class="row"><span>${escapeHtml(p.type)}</span><span>${params.currency} ${p.amount.toFixed(2)}</span></div>`)
    .join('');

  const salesmanText = Array.isArray(params.salesman)
    ? params.salesman.filter(Boolean).join(', ')
    : (params.salesman ?? '')
        .split(/[,;/]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', ');

  const totalQty = params.lines.reduce((sum, l) => sum + l.qty, 0);
  const created = new Date(params.createdAt);
  const dateStr = created.toLocaleDateString();
  const timeStr = created.toLocaleTimeString();

  printHtml(
    `Receipt ${params.receiptNumber}`,
    `
    <h1>${escapeHtml(params.branchName ?? 'Receipt')}</h1>
    ${params.branchAddress ? `<p class="center muted addr">${escapeHtml(params.branchAddress)}</p>` : ''}
    ${params.branchPhone ? `<p class="center muted addr">Tel: ${escapeHtml(params.branchPhone)}</p>` : ''}
    <hr/>
    ${metaGrid([
      ['Cashier', params.cashierEmail ?? '', 'Salesman', salesmanText],
      ['Terminal', params.terminalLabel ?? '', 'Receipt', params.receiptNumber],
    ])}
    ${params.customerName ? `<p class="muted tiny">Customer: ${escapeHtml(params.customerName)}</p>` : ''}
    <hr/>
    <table class="items">
      <colgroup><col class="idx"/><col class="prod"/><col class="price"/><col class="qty"/><col class="amount"/></colgroup>
      <thead><tr><th>#</th><th>Product</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <hr/>
    <div class="row"><span>Subtotal</span><span>${params.currency} ${params.subtotal.toFixed(2)}</span></div>
    ${params.discountTotal > 0 ? `<div class="row"><span>Discount</span><span>-${params.currency} ${params.discountTotal.toFixed(2)}</span></div>` : ''}
    ${params.taxTotal > 0 ? `<div class="row"><span>Tax</span><span>${params.currency} ${params.taxTotal.toFixed(2)}</span></div>` : ''}
    <div class="row total"><span>Total</span><span>${params.currency} ${params.total.toFixed(2)}</span></div>
    <hr/>
    ${paymentRows}
    <hr/>
    <div class="row tiny muted"><span>${params.lines.length} item${params.lines.length === 1 ? '' : 's'}</span><span>Qty ${totalQty.toFixed(3)}</span></div>
    <p class="center muted tiny">${dateStr} &nbsp;${timeStr}</p>
    <hr/>
    <p class="center bold">#### Thank You, Come Again ####</p>
    <div class="qr-wrap">${receiptQrSvg(params.receiptNumber)}</div>
    <p class="center tiny muted">${escapeHtml(params.receiptNumber)}</p>
    <hr/>
    <p class="center tiny muted">System by The Red Sun</p>
    <p class="center tiny muted">Live Long and Prosper</p>
    <p class="center tiny muted">theredsun.org</p>
  `
  );
}

export function printShiftReport(params: {
  shiftId: string;
  currency: string;
  summary: {
    saleCount: number;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    tenderTotals: Record<string, number>;
    returnCount: number;
    totalRefunds: number;
    paidIn: number;
    paidOut: number;
    expectedCash: number;
    shift: { openingFloat: number; openedAt: string };
  };
}) {
  const { summary, currency } = params;
  const tenderRows = Object.entries(summary.tenderTotals)
    .map(([type, amount]) => `<div class="row"><span>${escapeHtml(type)}</span><span>${currency} ${amount.toFixed(2)}</span></div>`)
    .join('');

  printHtml(
    `Shift report`,
    `
    <h1>Shift report</h1>
    <p class="center muted">Opened ${new Date(summary.shift.openedAt).toLocaleString()}</p>
    <hr/>
    <div class="row"><span>Sales</span><span>${summary.saleCount}</span></div>
    <div class="row"><span>Returns</span><span>${summary.returnCount}</span></div>
    <div class="row"><span>Subtotal</span><span>${currency} ${summary.subtotal.toFixed(2)}</span></div>
    <div class="row"><span>Discounts</span><span>${currency} ${summary.discountTotal.toFixed(2)}</span></div>
    <div class="row"><span>Tax</span><span>${currency} ${summary.taxTotal.toFixed(2)}</span></div>
    <div class="row total"><span>Net total</span><span>${currency} ${summary.total.toFixed(2)}</span></div>
    <hr/>
    ${tenderRows}
    <hr/>
    <div class="row"><span>Opening float</span><span>${currency} ${summary.shift.openingFloat.toFixed(2)}</span></div>
    <div class="row"><span>Paid in</span><span>${currency} ${summary.paidIn.toFixed(2)}</span></div>
    <div class="row"><span>Paid out</span><span>${currency} ${summary.paidOut.toFixed(2)}</span></div>
    <div class="row"><span>Refunds</span><span>${currency} ${summary.totalRefunds.toFixed(2)}</span></div>
    <div class="row total"><span>Expected cash</span><span>${currency} ${summary.expectedCash.toFixed(2)}</span></div>
  `
  );
}
