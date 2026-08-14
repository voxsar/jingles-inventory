import { useEffect, useState } from 'react';
import { posTerminalApi } from '../../api/client';
import PosModal from '../../components/pos/PosModal';

interface ShiftSummary {
  shift: { openingFloat: number; openedAt: string; status: string };
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
}

interface ReportPopupProps {
  shiftId: string;
  currency: string;
  onPrint: (summary: ShiftSummary) => void;
  onClose: () => void;
}

export default function ReportPopup({ shiftId, currency, onPrint, onClose }: ReportPopupProps) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    posTerminalApi
      .shiftSummary(shiftId)
      .then((res) => setSummary(res.data.data))
      .catch(() => setError('Failed to load shift report'));
  }, [shiftId]);

  return (
    <PosModal title="Shift report" legacyKey="End" onClose={onClose} width="md">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!summary && !error && <p className="text-sm text-[var(--ink-3)]">Loading…</p>}
      {summary && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Sales" value={String(summary.saleCount)} />
            <Stat label="Returns" value={String(summary.returnCount)} />
            <Stat label="Subtotal" value={`${currency} ${summary.subtotal.toFixed(2)}`} />
            <Stat label="Discounts" value={`${currency} ${summary.discountTotal.toFixed(2)}`} />
            <Stat label="Tax" value={`${currency} ${summary.taxTotal.toFixed(2)}`} />
            <Stat label="Net total" value={`${currency} ${summary.total.toFixed(2)}`} />
          </div>

          <div>
            <div className="label mb-1">By tender</div>
            <div className="space-y-1 rounded-lg bg-[var(--chip)] px-3 py-2">
              {Object.entries(summary.tenderTotals).map(([type, amount]) => (
                <div key={type} className="flex justify-between">
                  <span className="text-[var(--ink-2)]">{type}</span>
                  <span className="font-semibold text-[var(--ink)]">{currency} {amount.toFixed(2)}</span>
                </div>
              ))}
              {Object.keys(summary.tenderTotals).length === 0 && <span className="text-[var(--ink-4)]">No sales yet</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Opening float" value={`${currency} ${summary.shift.openingFloat.toFixed(2)}`} />
            <Stat label="Paid in" value={`${currency} ${summary.paidIn.toFixed(2)}`} />
            <Stat label="Paid out" value={`${currency} ${summary.paidOut.toFixed(2)}`} />
            <Stat label="Refunds" value={`${currency} ${summary.totalRefunds.toFixed(2)}`} />
          </div>

          <div className="rounded-xl bg-[rgba(var(--accent-glow),0.14)] px-4 py-3 text-center">
            <div className="text-xs text-[var(--ink-3)]">Expected cash in drawer</div>
            <div className="text-2xl font-bold text-[var(--ink)]">{currency} {summary.expectedCash.toFixed(2)}</div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Close (Esc)</button>
            <button type="button" onClick={() => onPrint(summary)} className="btn-primary">Print</button>
          </div>
        </div>
      )}
    </PosModal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--chip)] px-3 py-2">
      <div className="text-xs text-[var(--ink-3)]">{label}</div>
      <div className="font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}
