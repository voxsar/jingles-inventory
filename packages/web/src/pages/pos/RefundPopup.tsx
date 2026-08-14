import { useEffect, useRef, useState } from 'react';
import { posTerminalApi } from '../../api/client';
import PosModal from '../../components/pos/PosModal';

interface SaleLine {
  skuId: string;
  variantId?: string | null;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

interface PosSale {
  id: string;
  receiptNumber: string;
  total: number;
  lines: SaleLine[];
}

interface RefundPopupProps {
  terminalId: string;
  currency: string;
  onDone: () => void;
  onClose: () => void;
}

export default function RefundPopup({ terminalId, currency, onDone, onClose }: RefundPopupProps) {
  const [lookup, setLookup] = useState('');
  const [sale, setSale] = useState<PosSale | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const findSale = async () => {
    if (!lookup.trim()) return;
    setIsBusy(true);
    setError('');
    try {
      const res = await posTerminalApi.getSale(lookup.trim());
      const found: PosSale = res.data.data;
      setSale(found);
      setSelectedQty(Object.fromEntries((found.lines ?? []).map((_, i) => [i, 0])));
    } catch {
      setError('No sale found for that receipt number / ID');
      setSale(null);
    } finally {
      setIsBusy(false);
    }
  };

  const submit = async () => {
    if (!sale) return;
    const lines = sale.lines
      .map((line, i) => ({ ...line, qty: selectedQty[i] ?? 0 }))
      .filter((line) => line.qty > 0);
    if (lines.length === 0) {
      setError('Select at least one item to refund.');
      return;
    }
    setIsBusy(true);
    setError('');
    try {
      await posTerminalApi.returnSale(sale.id, {
        lines: lines.map((l) => ({ skuId: l.skuId, variantId: l.variantId ?? null, qty: l.qty, unitPrice: l.unitPrice })),
        reason,
        terminalId,
      });
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to process refund');
    } finally {
      setIsBusy(false);
    }
  };

  const refundTotal = sale
    ? sale.lines.reduce((sum, line, i) => sum + (selectedQty[i] ?? 0) * line.unitPrice, 0)
    : 0;

  return (
    <PosModal title="Refund" legacyKey="F9" onClose={onClose} width="md">
      <div className="space-y-4">
        {!sale && (
          <div>
            <label className="label mb-1 block">Receipt number or sale ID</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findSale()}
                className="input-field"
              />
              <button type="button" onClick={findSale} disabled={isBusy} className="btn-primary shrink-0">Find</button>
            </div>
          </div>
        )}

        {sale && (
          <>
            <p className="text-xs text-[var(--ink-3)]">
              Receipt {sale.receiptNumber} · Original total {currency} {sale.total.toFixed(2)}
            </p>
            <ul className="divide-y divide-[var(--line)]">
              {sale.lines.map((line, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[var(--ink)]">{line.name}</div>
                    <div className="text-xs text-[var(--ink-3)]">Sold {line.qty} {line.unit} @ {currency} {line.unitPrice.toFixed(2)}</div>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(selectedQty[i] ?? 0)}
                    onChange={(e) =>
                      setSelectedQty((prev) => ({ ...prev, [i]: Math.min(line.qty, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0) }))
                    }
                    className="input-field w-20 text-center"
                  />
                </li>
              ))}
            </ul>
            <div>
              <label className="label mb-1 block">Reason</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input-field" />
            </div>
            <div className="rounded-xl bg-[var(--chip)] px-4 py-3 text-center">
              <div className="text-xs text-[var(--ink-3)]">Refund total</div>
              <div className="text-2xl font-bold text-[var(--ink)]">{currency} {refundTotal.toFixed(2)}</div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          {sale && (
            <button type="button" onClick={submit} disabled={isBusy} className="btn-primary">
              {isBusy ? 'Processing…' : 'Refund'}
            </button>
          )}
        </div>
      </div>
    </PosModal>
  );
}
