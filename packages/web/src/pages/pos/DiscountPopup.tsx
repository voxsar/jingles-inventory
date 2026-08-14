import { useEffect, useRef, useState } from 'react';
import PosModal from '../../components/pos/PosModal';

export type DiscountMode = 'percent' | 'amount' | 'remove';
export type DiscountScope = 'line' | 'sale';

interface DiscountPopupProps {
  mode: DiscountMode;
  hasFocusedLine: boolean;
  onApply: (result: { scope: DiscountScope; mode: DiscountMode; value: number }) => void;
  onClose: () => void;
}

const TITLES: Record<DiscountMode, string> = {
  percent: 'Discount %',
  amount: 'Discount amount',
  remove: 'Remove discount',
};

const LEGACY: Record<DiscountMode, string> = {
  percent: 'Alt+D',
  amount: 'Alt+A',
  remove: 'Alt+R',
};

export default function DiscountPopup({ mode, hasFocusedLine, onApply, onClose }: DiscountPopupProps) {
  const [scope, setScope] = useState<DiscountScope>(hasFocusedLine ? 'line' : 'sale');
  const [valueText, setValueText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const apply = () => {
    const value = mode === 'remove' ? 0 : Number(valueText) || 0;
    onApply({ scope, mode, value });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
      return;
    }
    if (event.key.toUpperCase() === 'L' && hasFocusedLine) {
      event.preventDefault();
      setScope('line');
    } else if (event.key.toUpperCase() === 'S') {
      event.preventDefault();
      setScope('sale');
    }
  };

  return (
    <PosModal title={TITLES[mode]} legacyKey={LEGACY[mode]} onClose={onClose} width="sm">
      <div className="space-y-4" onKeyDown={handleKeyDown}>
        <div>
          <label className="label mb-1 block">Apply to</label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!hasFocusedLine}
              onClick={() => setScope('line')}
              className={`btn-sm flex-1 rounded-lg border px-3 py-2 disabled:opacity-40 ${scope === 'line' ? 'border-[var(--accent-3)] bg-[rgba(var(--accent-glow),0.18)]' : 'border-[var(--line)] bg-[var(--chip)]'}`}
            >
              <span className="font-bold underline">L</span>ine
            </button>
            <button
              type="button"
              onClick={() => setScope('sale')}
              className={`btn-sm flex-1 rounded-lg border px-3 py-2 ${scope === 'sale' ? 'border-[var(--accent-3)] bg-[rgba(var(--accent-glow),0.18)]' : 'border-[var(--line)] bg-[var(--chip)]'}`}
            >
              <span className="font-bold underline">S</span>ale
            </button>
          </div>
        </div>

        {mode !== 'remove' && (
          <div>
            <label className="label mb-1 block">{mode === 'percent' ? 'Percent off' : 'Amount off'}</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={valueText}
              onChange={(e) => setValueText(e.target.value.replace(/[^0-9.]/g, ''))}
              className="input-field text-center text-2xl font-bold"
              placeholder={mode === 'percent' ? 'e.g. 10' : 'e.g. 250'}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          <button type="button" onClick={apply} className="btn-primary">
            {mode === 'remove' ? 'Remove' : 'Apply'} (Enter)
          </button>
        </div>
      </div>
    </PosModal>
  );
}
