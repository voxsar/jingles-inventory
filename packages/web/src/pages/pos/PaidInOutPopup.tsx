import { useEffect, useRef, useState } from 'react';
import { posTerminalApi } from '../../api/client';
import PosModal from '../../components/pos/PosModal';

interface PaidInOutPopupProps {
  shiftId: string;
  onDone: () => void;
  onClose: () => void;
}

export default function PaidInOutPopup({ shiftId, onDone, onClose }: PaidInOutPopupProps) {
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const amount = Number(amountText) || 0;
    if (amount <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await posTerminalApi.paidInOut({ shiftId, type, amount, reason });
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to record');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key.toUpperCase() === 'I' && document.activeElement !== inputRef.current) {
      setType('IN');
    } else if (event.key.toUpperCase() === 'O' && document.activeElement !== inputRef.current) {
      setType('OUT');
    }
  };

  return (
    <PosModal title="Paid In / Out" legacyKey="F12" onClose={onClose} width="sm">
      <div className="space-y-4" onKeyDown={handleKeyDown}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('IN')}
            className={`btn-sm flex-1 rounded-lg border px-3 py-2 ${type === 'IN' ? 'border-[var(--accent-3)] bg-[rgba(var(--accent-glow),0.18)]' : 'border-[var(--line)] bg-[var(--chip)]'}`}
          >
            <span className="font-bold underline">I</span>n
          </button>
          <button
            type="button"
            onClick={() => setType('OUT')}
            className={`btn-sm flex-1 rounded-lg border px-3 py-2 ${type === 'OUT' ? 'border-[var(--accent-3)] bg-[rgba(var(--accent-glow),0.18)]' : 'border-[var(--line)] bg-[var(--chip)]'}`}
          >
            <span className="font-bold underline">O</span>ut
          </button>
        </div>
        <div>
          <label className="label mb-1 block">Amount</label>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.]/g, ''))}
            className="input-field text-center text-2xl font-bold"
          />
        </div>
        <div>
          <label className="label mb-1 block">Reason</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input-field" placeholder="e.g. petty cash, bank drop" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          <button type="button" onClick={submit} disabled={isSaving} className="btn-primary">
            {isSaving ? 'Saving…' : 'Record (Enter)'}
          </button>
        </div>
      </div>
    </PosModal>
  );
}
