import { useEffect, useState } from 'react';
import { posTerminalApi } from '../../api/client';
import PosModal from '../../components/pos/PosModal';

export interface HeldSale {
  id: string;
  holdNumber: string;
  customerName?: string | null;
  total: number;
  lines: unknown[];
  createdAt: string;
}

interface HoldRecallPopupProps {
  terminalId: string;
  onRecall: (held: HeldSale) => void;
  onClose: () => void;
}

export default function HoldRecallPopup({ terminalId, onRecall, onClose }: HoldRecallPopupProps) {
  const [held, setHeld] = useState<HeldSale[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setIsLoading(true);
    posTerminalApi
      .listHeldSales(terminalId)
      .then((res) => setHeld(res.data?.data ?? []))
      .catch(() => setError('Failed to load held sales'))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [terminalId]);

  const recall = (sale: HeldSale) => {
    onRecall(sale);
  };

  const remove = async (sale: HeldSale) => {
    try {
      await posTerminalApi.deleteHeldSale(sale.id);
      setHeld((prev) => prev.filter((h) => h.id !== sale.id));
    } catch {
      setError('Failed to remove held sale');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, held.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (held[activeIndex]) recall(held[activeIndex]);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      if (held[activeIndex]) remove(held[activeIndex]);
    }
  };

  return (
    <PosModal title="Recall held sale" legacyKey="F6" onClose={onClose} width="lg">
      <div tabIndex={0} onKeyDown={handleKeyDown} className="outline-none">
        {isLoading && <p className="text-sm text-[var(--ink-3)]">Loading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!isLoading && held.length === 0 && <p className="text-sm text-[var(--ink-3)]">No held sales on this terminal.</p>}
        <ul className="divide-y divide-[var(--line)]">
          {held.map((sale, index) => (
            <li key={sale.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${index === activeIndex ? 'bg-[rgba(var(--accent-glow),0.16)]' : ''}`}>
              <button type="button" onClick={() => recall(sale)} onMouseEnter={() => setActiveIndex(index)} className="min-w-0 flex-1 text-left">
                <div className="font-semibold text-[var(--ink)]">{sale.holdNumber}</div>
                <div className="text-xs text-[var(--ink-3)]">
                  {sale.customerName || 'No customer'} · {Array.isArray(sale.lines) ? sale.lines.length : 0} item(s) · {new Date(sale.createdAt).toLocaleTimeString()}
                </div>
              </button>
              <div className="shrink-0 font-semibold text-[var(--ink)]">{sale.total.toFixed(2)}</div>
              <button type="button" onClick={() => remove(sale)} className="btn-icon" title="Delete (Del)">🗑</button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--ink-4)]">↑/↓ select · Enter recall · Delete discard</p>
      </div>
    </PosModal>
  );
}
