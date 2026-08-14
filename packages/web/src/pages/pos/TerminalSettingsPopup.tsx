import { useEffect, useState } from 'react';
import { branchesApi } from '../../api/client';
import PosModal from '../../components/pos/PosModal';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface TerminalSettingsPopupProps {
  terminalId: string;
  branchId: string | null;
  printerLabel: string;
  onSave: (settings: { branchId: string | null; printerLabel: string }) => void;
  onClose: () => void;
}

export default function TerminalSettingsPopup({ terminalId, branchId, printerLabel, onSave, onClose }: TerminalSettingsPopupProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(branchId ?? '');
  const [label, setLabel] = useState(printerLabel);

  useEffect(() => {
    branchesApi.list().then((res) => setBranches(res.data?.data ?? [])).catch(() => setBranches([]));
  }, []);

  return (
    <PosModal title="Terminal settings" legacyKey="F8" onClose={onClose} width="sm">
      <div className="space-y-4">
        <div>
          <label className="label mb-1 block">Branch</label>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="input-field">
            <option value="">— Select branch —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block">Printer label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="input-field"
            placeholder="e.g. Counter thermal printer"
          />
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            No receipt-printer hardware is wired up yet — receipts and reports print via the browser's print dialog. This label is just a reminder of which printer to pick there.
          </p>
        </div>
        <div>
          <label className="label mb-1 block">Terminal ID</label>
          <input type="text" readOnly value={terminalId} className="input-field font-mono text-xs opacity-70" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel (Esc)</button>
          <button
            type="button"
            onClick={() => onSave({ branchId: selectedBranch || null, printerLabel: label })}
            className="btn-primary"
          >
            Save
          </button>
        </div>
      </div>
    </PosModal>
  );
}
