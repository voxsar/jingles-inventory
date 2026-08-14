import { useEffect, useRef, useState } from 'react';
import { skusApi } from '../../api/client';
import PosModal from '../../components/pos/PosModal';
import type { PosSkuHit } from './types';

interface ItemSearchPopupProps {
  initialQuery?: string;
  onSelect: (sku: PosSkuHit) => void;
  onClose: () => void;
}

export default function ItemSearchPopup({ initialQuery = '', onSelect, onClose }: ItemSearchPopupProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PosSkuHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await skusApi.list({ search: trimmed, pageSize: '15', isActive: 'true' });
        setResults(res.data?.data?.items ?? []);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[activeIndex];
      if (hit) onSelect(hit);
    }
  };

  return (
    <PosModal title="Search items" legacyKey="F3" onClose={onClose} width="lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Name, SKU code, or barcode..."
        className="input-field mb-3"
      />
      {isLoading && <p className="text-sm text-[var(--ink-3)]">Searching…</p>}
      {!isLoading && query.trim() && results.length === 0 && (
        <p className="text-sm text-[var(--ink-3)]">No matching items.</p>
      )}
      <ul className="divide-y divide-[var(--line)]">
        {results.map((sku, index) => {
          const onHand = (sku.inventoryRecords ?? []).reduce((sum, r) => sum + r.quantity, 0);
          return (
            <li key={sku.id}>
              <button
                type="button"
                onClick={() => onSelect(sku)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left ${
                  index === activeIndex ? 'bg-[rgba(var(--accent-glow),0.16)]' : 'hover:bg-[var(--row-hover)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[var(--ink)]">{sku.name}</div>
                  <div className="font-mono text-xs text-[var(--ink-3)]">
                    {sku.skuCode} · {onHand} {sku.unitOfMeasure} on hand
                  </div>
                </div>
                <div className="shrink-0 font-semibold text-[var(--ink)]">
                  {sku.currency} {(sku.sellingPrice ?? 0).toFixed(2)}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </PosModal>
  );
}
