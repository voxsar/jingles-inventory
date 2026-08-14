import type { CartLine } from './types';

interface PosCartTableProps {
  lines: CartLine[];
  focusedIndex: number;
  currency: string;
  onFocusLine: (index: number) => void;
  onEditLine: (index: number) => void;
}

export default function PosCartTable({ lines, focusedIndex, currency, onFocusLine, onEditLine }: PosCartTableProps) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--line)] text-sm text-[var(--ink-4)]">
        Scan a barcode or press F3 to search for an item.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto rounded-2xl border border-[var(--line)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--bg-2)] text-xs uppercase tracking-wide text-[var(--ink-4)]">
          <tr>
            <th className="px-3 py-2 text-left">Item</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Unit price</th>
            <th className="px-3 py-2 text-right">Discount</th>
            <th className="px-3 py-2 text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const lineTotal = line.qty * line.unitPrice - line.lineDiscount;
            return (
              <tr
                key={line.key}
                onClick={() => onFocusLine(index)}
                onDoubleClick={() => onEditLine(index)}
                className={`cursor-pointer border-t border-[var(--line)] ${
                  index === focusedIndex ? 'bg-[rgba(var(--accent-glow),0.16)]' : 'hover:bg-[var(--row-hover)]'
                }`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-[var(--ink)]">{line.name}</div>
                  <div className="font-mono text-xs text-[var(--ink-3)]">{line.skuCode}</div>
                </td>
                <td className="px-3 py-2 text-right text-[var(--ink)]">
                  {line.enteredQty} {line.enteredUnit}
                  {line.enteredUnit !== line.unit && (
                    <div className="text-xs text-[var(--ink-4)]">= {line.qty.toFixed(3)} {line.unit}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-[var(--ink)]">
                  {currency} {line.unitPrice.toFixed(2)}
                  {line.isWholesale && <div className="text-[10px] text-[var(--ink-4)]">wholesale</div>}
                </td>
                <td className="px-3 py-2 text-right text-[var(--ink-3)]">
                  {line.lineDiscount > 0 ? `- ${currency} ${line.lineDiscount.toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--ink)]">{currency} {lineTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
