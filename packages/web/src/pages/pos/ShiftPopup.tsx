import { useEffect, useRef, useState } from 'react';
import { posTerminalApi } from '../../api/client';
import PosModal from '../../components/pos/PosModal';

interface ShiftPopupProps {
  mode: 'open' | 'close';
  terminalId: string;
  branchId?: string | null;
  shiftId?: string;
  onDone: (result: { mode: 'open' | 'close'; data: any }) => void;
  onClose: () => void;
}

export default function ShiftPopup({ mode, terminalId, branchId, shiftId, onDone, onClose }: ShiftPopupProps) {
  const [amountText, setAmountText] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const amount = Number(amountText) || 0;
    setIsSaving(true);
    setError('');
    try {
      if (mode === 'open') {
        const res = await posTerminalApi.openShift({ terminalId, branchId, openingFloat: amount, notes });
        onDone({ mode, data: res.data.data });
      } else {
        const res = await posTerminalApi.closeShift(shiftId!, { closingFloat: amount, notes });
        onDone({ mode, data: res.data.data });
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to save shift');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  return (
    <PosModal
      title={mode === 'open' ? 'Open shift — float cash' : 'Close shift — money declare'}
      legacyKey={mode === 'open' ? 'PgUp' : 'F10'}
      onClose={onClose}
      width="sm"
    >
      <div className="space-y-4" onKeyDown={handleKeyDown}>
        <div>
          <label className="label mb-1 block">{mode === 'open' ? 'Opening float' : 'Counted cash in drawer'}</label>
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
          <label className="label mb-1 block">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          <button type="button" onClick={submit} disabled={isSaving} className="btn-primary">
            {isSaving ? 'Saving…' : `${mode === 'open' ? 'Open shift' : 'Close shift'} (Enter)`}
          </button>
        </div>
      </div>
    </PosModal>
  );
}
