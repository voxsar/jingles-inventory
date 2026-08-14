import { useEffect, useRef, useState } from 'react';
import PosModal from '../../components/pos/PosModal';

interface CustomerSalesmanPopupProps {
  field: 'customer' | 'salesman';
  initialValue: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

export default function CustomerSalesmanPopup({ field, initialValue, onSave, onClose }: CustomerSalesmanPopupProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => onSave(value.trim());

  return (
    <PosModal
      title={field === 'customer' ? 'Customer' : 'Salesman'}
      legacyKey={field === 'customer' ? 'Alt+C' : 'Alt+S'}
      onClose={onClose}
      width="sm"
    >
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={field === 'customer' ? 'Customer name or phone' : 'Salesperson name(s), comma-separated'}
          className="input-field"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          <button type="button" onClick={submit} className="btn-primary">Save (Enter)</button>
        </div>
      </div>
    </PosModal>
  );
}
