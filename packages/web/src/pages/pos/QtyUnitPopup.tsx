import { useEffect, useMemo, useRef, useState } from 'react';
import PosModal from '../../components/pos/PosModal';
import type { CartLine, PosSkuHit, PosUnit } from './types';
import { assignUnitHotkeys, compatibleUnits, convertQuantity } from './unitConversion';

interface QtyUnitPopupProps {
  sku: PosSkuHit;
  units: PosUnit[];
  isWholesale: boolean;
  initialQty?: number;
  existingLine?: CartLine | null;
  onConfirm: (line: CartLine) => void;
  onCancel: () => void;
}

function resolveSkuUnit(sku: PosSkuHit, units: PosUnit[]): PosUnit {
  if (sku.unitModel) return sku.unitModel;
  const byName = units.find((u) => u.name === sku.unitOfMeasure);
  return byName ?? { id: sku.unitOfMeasure, name: sku.unitOfMeasure, abbreviation: sku.unitOfMeasure, baseUnit: null, conversionFactor: null, type: sku.unitOfMeasure, isActive: true };
}

export default function QtyUnitPopup({ sku, units, isWholesale, initialQty = 1, existingLine, onConfirm, onCancel }: QtyUnitPopupProps) {
  const skuUnit = useMemo(() => resolveSkuUnit(sku, units), [sku, units]);
  const options = useMemo(() => {
    const compatible = compatibleUnits(units, skuUnit);
    return compatible.length ? compatible : [skuUnit];
  }, [units, skuUnit]);
  const hotkeys = useMemo(() => assignUnitHotkeys(options), [options]);

  const [selectedUnit, setSelectedUnit] = useState<PosUnit>(() => {
    if (existingLine) return options.find((u) => u.name === existingLine.enteredUnit) ?? skuUnit;
    return skuUnit;
  });
  const [qtyText, setQtyText] = useState(() => String(existingLine?.enteredQty ?? initialQty));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const parsedQty = Number(qtyText);
  const validQty = Number.isFinite(parsedQty) && parsedQty > 0;
  const canonicalQty = validQty ? convertQuantity(parsedQty, selectedUnit, skuUnit) : 0;

  const basePrice = isWholesale ? sku.wholesalePrice ?? sku.sellingPrice ?? 0 : sku.sellingPrice ?? 0;
  const lineTotal = canonicalQty * basePrice;
  const onHand = (sku.inventoryRecords ?? []).reduce((sum, r) => sum + r.quantity, 0);

  const confirm = () => {
    if (!validQty) {
      inputRef.current?.focus();
      return;
    }
    onConfirm({
      key: existingLine?.key ?? `${sku.id}-${sku.variant?.id ?? 'base'}-${Date.now()}`,
      skuId: sku.id,
      variantId: sku.variant?.id ?? null,
      skuCode: sku.skuCode,
      name: sku.variant ? `${sku.name} (${sku.variant.name})` : sku.name,
      qty: canonicalQty,
      unit: skuUnit.name,
      enteredQty: parsedQty,
      enteredUnit: selectedUnit.name,
      unitPrice: basePrice,
      lineDiscount: existingLine?.lineDiscount ?? 0,
      isWholesale,
      onHand,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirm();
      return;
    }
    if (/^[a-zA-Z]$/.test(event.key)) {
      const letter = event.key.toUpperCase();
      const match = hotkeys.find((h) => h.letter === letter);
      if (match) {
        event.preventDefault();
        setSelectedUnit(match.unit);
      }
    }
  };

  return (
    <PosModal title={sku.name} legacyKey="Qty / Unit" onClose={onCancel} width="sm">
      <div className="space-y-4">
        <div className="text-xs text-[var(--ink-3)]">
          <span className="font-mono">{sku.skuCode}</span>
          {sku.variant && <span> · {sku.variant.name}</span>}
          <span> · On hand: {onHand} {skuUnit.abbreviation}</span>
        </div>

        <div>
          <label className="label mb-1 block">Quantity</label>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={handleKeyDown}
            className="input-field text-center text-3xl font-bold tracking-wide"
          />
        </div>

        {options.length > 1 && (
          <div>
            <label className="label mb-1 block">Unit (press the letter)</label>
            <div className="flex flex-wrap gap-2">
              {hotkeys.map(({ unit, letter }) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => {
                    setSelectedUnit(unit);
                    inputRef.current?.focus();
                  }}
                  className={`btn-sm rounded-lg border px-3 py-1.5 ${
                    selectedUnit.id === unit.id
                      ? 'border-[var(--accent-3)] bg-[rgba(var(--accent-glow),0.18)] text-[var(--ink)]'
                      : 'border-[var(--line)] bg-[var(--chip)] text-[var(--ink-2)] hover:bg-[var(--row-hover)]'
                  }`}
                >
                  <span className="font-bold underline">{letter}</span>
                  <span className="ml-1.5">{unit.name}</span>
                  <span className="ml-1 text-[10px] text-[var(--ink-4)]">({unit.abbreviation})</span>
                </button>
              ))}
            </div>
            {selectedUnit.id !== skuUnit.id && validQty && (
              <p className="mt-1.5 text-xs text-[var(--ink-3)]">
                = {canonicalQty.toFixed(3)} {skuUnit.abbreviation}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-[var(--chip)] px-4 py-3">
          <div className="text-xs text-[var(--ink-3)]">
            {isWholesale ? 'Wholesale' : 'Retail'} price · {sku.currency} {basePrice.toFixed(2)} / {skuUnit.abbreviation}
          </div>
          <div className="text-lg font-bold text-[var(--ink)]">
            {sku.currency} {lineTotal.toFixed(2)}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel (Esc)</button>
          <button type="button" onClick={confirm} disabled={!validQty} className="btn-primary">
            {existingLine ? 'Update' : 'Add'} (Enter)
          </button>
        </div>
      </div>
    </PosModal>
  );
}
