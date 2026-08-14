import { useEffect, useRef, useState } from 'react';
import PosModal from '../../components/pos/PosModal';
import type { CartLine } from './types';

interface NewPricePopupProps {
  line: CartLine;
  currency: string;
  onSave: (unitPrice: number) => void;
  onClose: () => void;
}

export default function NewPricePopup({ line, currency, onSave, onClose }: NewPricePopupProps) {
  const [priceText, setPriceText] = useState(line.unitPrice.toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const price = Number(priceText);
    if (Number.isFinite(price) && price >= 0) onSave(price);
  };

  return (
    <PosModal title={`New price — ${line.name}`} legacyKey="Alt+N" onClose={onClose} width="sm">
      <div className="space-y-4">
        <p className="text-xs text-[var(--ink-3)]">Was {currency} {line.unitPrice.toFixed(2)} per {line.unit}</p>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          className="input-field text-center text-2xl font-bold"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          <button type="button" onClick={submit} className="btn-primary">Apply (Enter)</button>
        </div>
      </div>
    </PosModal>
  );
}
