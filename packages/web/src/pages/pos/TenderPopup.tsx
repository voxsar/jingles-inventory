import { useEffect, useRef, useState } from 'react';
import PosModal from '../../components/pos/PosModal';
import type { TenderType } from './types';

interface TenderOption {
  type: TenderType;
  letter: string;
}

const TENDER_OPTIONS: TenderOption[] = [
  { type: 'Cash', letter: 'C' },
  { type: 'Debit Card', letter: 'D' },
  { type: 'Master Card', letter: 'M' },
  { type: 'Visa Card', letter: 'V' },
  { type: 'Amex Card', letter: 'X' },
  { type: 'Credit', letter: 'R' },
];

interface TenderPopupProps {
  total: number;
  currency: string;
  onConfirm: (payment: { type: TenderType; amount: number }) => void;
  onClose: () => void;
}

export default function TenderPopup({ total, currency, onConfirm, onClose }: TenderPopupProps) {
  const [tender, setTender] = useState<TenderType>('Cash');
  const [amountText, setAmountText] = useState(total > 0 ? total.toFixed(2) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const amount = Number(amountText) || 0;
  const change = tender === 'Cash' ? Math.max(0, amount - total) : 0;
  const canConfirm = tender === 'Cash' ? amount >= total : true;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({ type: tender, amount: tender === 'Cash' ? amount : total });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirm();
      return;
    }
    if (/^[a-zA-Z]$/.test(event.key)) {
      const match = TENDER_OPTIONS.find((o) => o.letter === event.key.toUpperCase());
      if (match) {
        event.preventDefault();
        setTender(match.type);
        if (match.type !== 'Cash') setAmountText(total.toFixed(2));
      }
    }
  };

  return (
    <PosModal title="Tender" legacyKey="+ Sub Total" onClose={onClose} width="sm">
      <div className="space-y-4">
        <div className="rounded-xl bg-[var(--chip)] px-4 py-3 text-center">
          <div className="text-xs text-[var(--ink-3)]">Total due</div>
          <div className="text-3xl font-bold text-[var(--ink)]">{currency} {total.toFixed(2)}</div>
        </div>

        <div>
          <label className="label mb-1 block">Payment method (press a letter)</label>
          <div className="grid grid-cols-3 gap-2">
            {TENDER_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                onClick={() => {
                  setTender(option.type);
                  if (option.type !== 'Cash') setAmountText(total.toFixed(2));
                  inputRef.current?.focus();
                }}
                className={`btn-sm rounded-lg border px-2 py-2 text-xs ${
                  tender === option.type
                    ? 'border-[var(--accent-3)] bg-[rgba(var(--accent-glow),0.18)] text-[var(--ink)]'
                    : 'border-[var(--line)] bg-[var(--chip)] text-[var(--ink-2)] hover:bg-[var(--row-hover)]'
                }`}
              >
                <span className="font-bold underline">{option.letter}</span> {option.type}
              </button>
            ))}
          </div>
        </div>

        {tender === 'Cash' && (
          <div>
            <label className="label mb-1 block">Cash tendered</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.]/g, ''))}
              onKeyDown={handleKeyDown}
              className="input-field text-center text-2xl font-bold"
            />
            <p className="mt-1.5 text-sm text-[var(--ink-3)]">Change: {currency} {change.toFixed(2)}</p>
          </div>
        )}
        {tender !== 'Cash' && (
          <input ref={inputRef} className="sr-only" onKeyDown={handleKeyDown} aria-hidden />
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          <button type="button" onClick={confirm} disabled={!canConfirm} className="btn-primary">
            Finish sale (Enter)
          </button>
        </div>
      </div>
    </PosModal>
  );
}
