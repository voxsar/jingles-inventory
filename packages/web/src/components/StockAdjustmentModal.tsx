import { useRef, useState } from 'react';
import { inventoryApi } from '../api/client';
import { StockAdjustmentReason } from '@jingles/shared/enums';
import SearchableSelect from './SearchableSelect';
import { UiText } from './UiPrimitives';
import { formatInventoryLocation } from '../utils/location';
import { formatQuantity, parsePositiveQuantity, QUANTITY_INPUT_MIN, QUANTITY_INPUT_STEP } from '../utils/quantity';

const defaultAdjustForm = { direction: 'increase' as 'increase' | 'decrease', amount: '1', reasonCode: '', note: '' };

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  [StockAdjustmentReason.StockCountCorrection]: '📋 Stock count correction',
  [StockAdjustmentReason.Damaged]: '💥 Damaged',
  [StockAdjustmentReason.Expired]: '⌛ Expired',
  [StockAdjustmentReason.LostOrStolen]: '🚨 Lost or stolen',
  [StockAdjustmentReason.FoundStock]: '🔍 Found stock',
  [StockAdjustmentReason.SupplierShortage]: '📉 Supplier shortage',
  [StockAdjustmentReason.InternalUse]: '🏠 Internal use',
  [StockAdjustmentReason.DataEntryError]: '⌨️ Data entry error',
  [StockAdjustmentReason.Other]: '📝 Other (note required)',
};

const ADJUST_SHORTCUTS = [1, 5, 10, 50] as const;

// Sent with the adjustment so a retried or double-clicked submit replays the
// original event instead of moving stock twice. randomUUID needs a secure
// context, which a LAN deployment over plain HTTP does not have.
function newRequestId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `adj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface StockAdjustmentModalProps {
  record: any;
  onClose: () => void;
  onAdjusted: () => void | Promise<void>;
}

export default function StockAdjustmentModal({ record, onClose, onAdjusted }: StockAdjustmentModalProps) {
  const [form, setForm] = useState(defaultAdjustForm);
  const [isSaving, setIsSaving] = useState(false);
  const requestIdRef = useRef<string>(newRequestId());

  const amount = parsePositiveQuantity(form.amount);
  const signedDelta = amount === undefined ? 0 : (form.direction === 'decrease' ? -amount : amount);
  const projected = record.quantity + signedDelta;
  const isShort = projected < 0;
  const needsNote = form.reasonCode === StockAdjustmentReason.Other && !form.note.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === undefined) { alert('Adjustment amount must be greater than 0.'); return; }
    if (!form.reasonCode) { alert('Select a reason for this adjustment.'); return; }
    if (needsNote) { alert('A note is required when the reason is "Other".'); return; }
    if (isShort) {
      alert(`Cannot remove ${formatQuantity(amount)}; only ${formatQuantity(record.quantity)} is on this record.`);
      return;
    }
    setIsSaving(true);
    try {
      await inventoryApi.adjust(record.id, {
        quantityDelta: signedDelta,
        reasonCode: form.reasonCode,
        note: form.note.trim() || undefined,
        requestId: requestIdRef.current,
      });
      await onAdjusted();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to adjust stock');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel-md">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">📊 Stock Adjustment</h2>
            <p className="text-xs text-gray-400 font-mono">{record.sku?.skuCode} — {record.sku?.name}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body form-stack">
            <div className="form-group">
              <label className="form-label">Location</label>
              <UiText>{formatInventoryLocation(record)}</UiText>
            </div>
            <div className="form-group">
              <label className="form-label">Direction *</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${form.direction === 'increase' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  onClick={() => setForm(f => ({ ...f, direction: 'increase' }))}
                >
                  ➕ Stock up
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${form.direction === 'decrease' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  onClick={() => setForm(f => ({ ...f, direction: 'decrease' }))}
                >
                  ➖ Stock down
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Amount *</label>
              <input
                className="input-field"
                type="number"
                min={QUANTITY_INPUT_MIN}
                step={QUANTITY_INPUT_STEP}
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
              />
              <div className="flex gap-1 mt-1">
                {ADJUST_SHORTCUTS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    className="px-2 py-0.5 text-xs text-white rounded font-medium bg-gray-500 hover:bg-gray-600 transition-colors"
                    onClick={() => setForm(f => ({ ...f, amount: String(step) }))}
                  >
                    {step}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason *</label>
              <SearchableSelect
                options={[
                  { value: '', label: '— Select a reason —' },
                  ...Object.values(StockAdjustmentReason).map(reason => ({
                    value: reason,
                    label: ADJUSTMENT_REASON_LABELS[reason] ?? reason,
                  })),
                ]}
                value={form.reasonCode}
                onChange={(value) => setForm(f => ({ ...f, reasonCode: value }))}
                placeholder="Select a reason"
                isClearable={false}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Note {form.reasonCode === StockAdjustmentReason.Other ? '*' : ''}</label>
              <input
                className="input-field"
                type="text"
                placeholder="Optional detail recorded on the adjustment"
                value={form.note}
                onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Result</label>
              <p className="text-sm">
                <span className="font-mono">{formatQuantity(record.quantity)}</span>
                <span className="mx-2 text-gray-400">→</span>
                <span className={`font-mono font-semibold ${isShort ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatQuantity(Math.max(0, projected))}
                </span>
                {signedDelta !== 0 && !isShort && (
                  <span className={`ml-2 text-xs ${signedDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({signedDelta > 0 ? '+' : '−'}{formatQuantity(Math.abs(signedDelta))})
                  </span>
                )}
              </p>
              {isShort && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ Only {formatQuantity(record.quantity)} is on this record.
                </p>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving || amount === undefined || isShort || !form.reasonCode || needsNote}
            >
              {isSaving ? '⏳ Adjusting…' : '📊 Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
