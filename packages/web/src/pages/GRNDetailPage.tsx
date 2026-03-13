import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { grnsApi } from '../api/client';
import { GRNStatus, DamageClassification } from '@jingles/shared';

const STATUS_TONES: Record<string, string> = {
  [GRNStatus.Draft]: '',
  [GRNStatus.Submitted]: 'info',
  [GRNStatus.PartiallyInspected]: 'warning',
  [GRNStatus.FullyInspected]: 'success',
  [GRNStatus.Closed]: '',
};

export default function GRNDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [grn, setGrn] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inspectingLineId, setInspectingLineId] = useState<string | null>(null);
  const [inspectionForm, setInspectionForm] = useState({
    approvedQuantity: 0,
    rejectedQuantity: 0,
    damageClassification: '',
    remarks: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadGRN = async () => {
    if (!id) return;
    try {
      const res = await grnsApi.get(id);
      const grnData = res.data?.data ?? res.data;
      setGrn(grnData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadGRN(); }, [id]);

  const handleSubmit = async () => {
    if (!id || !confirm('Submit this GRN? This will create Uninspected inventory records.')) return;
    setIsSubmitting(true);
    try {
      await grnsApi.submit(id);
      await loadGRN();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Submit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !inspectingLineId) return;
    try {
      await grnsApi.inspect(id, { grnLineId: inspectingLineId, ...inspectionForm });
      setInspectingLineId(null);
      setInspectionForm({ approvedQuantity: 0, rejectedQuantity: 0, damageClassification: '', remarks: '' });
      await loadGRN();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Inspection failed');
    }
  };

  if (isLoading) return (
    <div className="flex flex-col gap-4">
      <div className="content-section px-6 py-8 text-sm text-gray-500">Loading…</div>
    </div>
  );

  if (!grn) return (
    <div className="flex flex-col gap-4">
      <div className="content-section px-6 py-8 text-sm text-gray-500">GRN not found</div>
    </div>
  );

  const inspectedCount = grn.lines?.filter((l: any) => l.inspectionRecords?.length > 0).length ?? 0;
  const progress = grn.lines?.length > 0 ? Math.round((inspectedCount / grn.lines.length) * 100) : 0;
  const statusTone = STATUS_TONES[grn.status] ?? '';

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn-secondary text-sm" onClick={() => navigate('/grns')}>← Back</button>
          <div className="page-header-left">
            <div className="flex items-center gap-3">
              <h1 className="page-title">📋 GRN Detail</h1>
              {statusTone ? <s-badge tone={statusTone as any}>{grn.status}</s-badge> : <s-badge>{grn.status}</s-badge>}
            </div>
            <p className="page-subtitle font-mono text-xs">{grn.id?.slice(0, 8)}…</p>
          </div>
        </div>
        {grn.status === GRNStatus.Draft && (
          <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '⏳ Submitting…' : '📤 Submit GRN'}
          </button>
        )}
      </div>

      {/* Metadata card */}
      <div className="content-section px-6 py-5">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm lg:grid-cols-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Supplier</p>
            <p className="font-semibold text-gray-900">{grn.supplier?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Invoice Reference</p>
            <p className="font-semibold text-gray-900">{grn.invoiceReference ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Created By</p>
            <p className="font-semibold text-gray-900">{grn.creator?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Created At</p>
            <p className="font-semibold text-gray-900">{new Date(grn.createdAt).toLocaleString()}</p>
          </div>
          {grn.expectedDeliveryDate && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Expected Delivery</p>
              <p className="font-semibold text-gray-900">{new Date(grn.expectedDeliveryDate).toLocaleDateString()}</p>
            </div>
          )}
          {grn.deliveryDate && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Delivery Date</p>
              <p className="font-semibold text-gray-900">{new Date(grn.deliveryDate).toLocaleDateString()}</p>
            </div>
          )}
          {grn.notes && (
            <div className="col-span-full">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Notes</p>
              <p className="text-gray-700">{grn.notes}</p>
            </div>
          )}
        </div>

        {grn.status !== GRNStatus.Draft && grn.lines?.length > 0 && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Inspection Progress</span>
              <span className="text-sm font-medium text-gray-900">{inspectedCount} / {grn.lines.length} lines</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-2 bg-primary-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="content-section">
        <div className="content-section-header">
          <h2 className="text-base font-semibold text-gray-900">Line Items ({grn.lines?.length ?? 0})</h2>
        </div>
        {grn.lines?.map((line: any, idx: number) => (
          <div key={line.id} className={`px-6 py-5 ${idx < grn.lines.length - 1 ? 'border-b border-gray-100' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-gray-900">{line.sku?.name}</span>
                  <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{line.sku?.skuCode}</span>
                  {line.batchReference && <span className="text-xs text-gray-500">Batch: {line.batchReference}</span>}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>Expected: <strong className="text-gray-900">{line.expectedQuantity}</strong></span>
                  <span>Received: <strong className="text-gray-900">{line.receivedQuantity}</strong></span>
                </div>
              </div>
              {grn.status !== GRNStatus.Draft && line.inspectionRecords?.length === 0 && (
                <button
                  type="button"
                  className="btn-primary text-sm"
                  onClick={() => { setInspectingLineId(line.id); setInspectionForm({ ...inspectionForm, approvedQuantity: line.receivedQuantity }); }}
                >
                  🔍 Inspect
                </button>
              )}
              {line.inspectionRecords?.length > 0 && (
                <s-badge tone="success">✓ Inspected</s-badge>
              )}
            </div>

            {line.inspectionRecords?.length > 0 && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Inspection Results</p>
                {line.inspectionRecords.map((ir: any) => (
                  <div key={ir.id} className="flex flex-wrap gap-4 text-sm">
                    <span className="text-green-700 font-medium">✓ Approved: {ir.approvedQuantity}</span>
                    <span className="text-red-600 font-medium">✗ Rejected: {ir.rejectedQuantity}</span>
                    {ir.damageClassification && <span className="text-amber-600">⚠️ {ir.damageClassification}</span>}
                    {ir.remarks && <span className="text-gray-500 italic">"{ir.remarks}"</span>}
                    <span className="text-gray-400 text-xs">by {ir.inspector?.email}</span>
                  </div>
                ))}
              </div>
            )}

            {inspectingLineId === line.id && (
              <form onSubmit={handleInspect} className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm font-semibold text-gray-700 mb-4">Record Inspection</p>
                <div className="form-stack">
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Approved Qty *</label>
                      <input className="input-field" type="number" value={inspectionForm.approvedQuantity} required min="0" onChange={(e) => setInspectionForm((f) => ({ ...f, approvedQuantity: parseInt(e.target.value) }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Rejected Qty</label>
                      <input className="input-field" type="number" value={inspectionForm.rejectedQuantity} min="0" onChange={(e) => setInspectionForm((f) => ({ ...f, rejectedQuantity: parseInt(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Damage Classification</label>
                      <select className="input-field" value={inspectionForm.damageClassification} onChange={(e) => setInspectionForm((f) => ({ ...f, damageClassification: e.target.value }))}>
                        <option value="">None</option>
                        {Object.values(DamageClassification).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Remarks</label>
                      <input className="input-field" type="text" value={inspectionForm.remarks} placeholder="Optional remarks…" onChange={(e) => setInspectionForm((f) => ({ ...f, remarks: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="btn-primary">Save Inspection</button>
                    <button type="button" className="btn-secondary" onClick={() => setInspectingLineId(null)}>Cancel</button>
                  </div>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
