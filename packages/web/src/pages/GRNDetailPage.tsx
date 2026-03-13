import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { grnsApi } from '../api/client';
import { GRNStatus, DamageClassification } from '@jingles/shared';

const STATUS_COLORS: Record<string, string> = {
  [GRNStatus.Draft]: 'bg-gray-100 text-gray-700',
  [GRNStatus.Submitted]: 'bg-blue-100 text-blue-700',
  [GRNStatus.PartiallyInspected]: 'bg-amber-100 text-amber-700',
  [GRNStatus.FullyInspected]: 'bg-green-100 text-green-700',
  [GRNStatus.Closed]: 'bg-gray-100 text-gray-500',
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
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );

  if (!grn) return (
    <div className="card text-center text-gray-500 py-12">
      <div className="text-4xl mb-3">📭</div>
      <p>GRN not found</p>
    </div>
  );

  const inspectedCount = grn.lines?.filter((l: any) => l.inspectionRecords?.length > 0).length ?? 0;
  const progress = grn.lines?.length > 0 ? Math.round((inspectedCount / grn.lines.length) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/grns')} className="text-gray-500 hover:text-gray-700 text-sm">← Back to GRNs</button>
      </div>

      <div className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title">📋 GRN Detail</h1>
          <span className={`badge text-sm px-3 py-1 ${STATUS_COLORS[grn.status] ?? 'bg-gray-100 text-gray-500'}`}>{grn.status}</span>
        </div>
        {grn.status === GRNStatus.Draft && (
          <button onClick={handleSubmit} disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? '⏳ Submitting…' : '📤 Submit GRN'}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Supplier</p>
            <p className="font-medium text-gray-900">{grn.supplier?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Invoice Reference</p>
            <p className="font-medium text-gray-900">{grn.invoiceReference ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Created By</p>
            <p className="font-medium text-gray-900">{grn.creator?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Created At</p>
            <p className="font-medium text-gray-900">{new Date(grn.createdAt).toLocaleString()}</p>
          </div>
          {grn.expectedDeliveryDate && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Expected Delivery</p>
              <p className="font-medium text-gray-900">{new Date(grn.expectedDeliveryDate).toLocaleDateString()}</p>
            </div>
          )}
          {grn.deliveryDate && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Delivery Date</p>
              <p className="font-medium text-gray-900">{new Date(grn.deliveryDate).toLocaleDateString()}</p>
            </div>
          )}
          {grn.notes && (
            <div className="col-span-2 md:col-span-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Notes</p>
              <p className="text-gray-800">{grn.notes}</p>
            </div>
          )}
        </div>

        {/* Inspection progress */}
        {grn.status !== GRNStatus.Draft && grn.lines?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase">Inspection Progress</span>
              <span className="text-xs text-gray-600">{inspectedCount} / {grn.lines.length} lines</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* GRN Lines */}
      <div className="card-flat overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="section-title mb-0">Line Items ({grn.lines?.length ?? 0})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {grn.lines?.map((line: any) => (
            <div key={line.id} className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
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
                    onClick={() => { setInspectingLineId(line.id); setInspectionForm({ ...inspectionForm, approvedQuantity: line.receivedQuantity }); }}
                    className="btn-primary text-sm"
                  >
                    🔍 Inspect
                  </button>
                )}
                {line.inspectionRecords?.length > 0 && (
                  <span className="badge bg-green-50 text-green-700">✓ Inspected</span>
                )}
              </div>

              {/* Inspection records */}
              {line.inspectionRecords?.length > 0 && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Inspection Results</p>
                  {line.inspectionRecords.map((ir: any) => (
                    <div key={ir.id} className="flex flex-wrap gap-4 text-sm">
                      <span className="text-green-700 font-medium">✓ Approved: {ir.approvedQuantity}</span>
                      <span className="text-red-600 font-medium">✗ Rejected: {ir.rejectedQuantity}</span>
                      {ir.damageClassification && <span className="text-amber-600">⚠️ {ir.damageClassification}</span>}
                      {ir.remarks && <span className="text-gray-600 italic">"{ir.remarks}"</span>}
                      <span className="text-gray-400 text-xs">by {ir.inspector?.email}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Inspection form */}
              {inspectingLineId === line.id && (
                <form onSubmit={handleInspect} className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-blue-800">Record Inspection</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Approved Qty *</label>
                      <input type="number" min="0" value={inspectionForm.approvedQuantity} onChange={(e) => setInspectionForm((f) => ({ ...f, approvedQuantity: parseInt(e.target.value) }))} className="input-field" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Rejected Qty</label>
                      <input type="number" min="0" value={inspectionForm.rejectedQuantity} onChange={(e) => setInspectionForm((f) => ({ ...f, rejectedQuantity: parseInt(e.target.value) }))} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Damage Classification</label>
                      <select value={inspectionForm.damageClassification} onChange={(e) => setInspectionForm((f) => ({ ...f, damageClassification: e.target.value }))} className="input-field">
                        <option value="">None</option>
                        {Object.values(DamageClassification).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Remarks</label>
                      <input type="text" value={inspectionForm.remarks} onChange={(e) => setInspectionForm((f) => ({ ...f, remarks: e.target.value }))} className="input-field" placeholder="Optional remarks..." />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm">Save Inspection</button>
                    <button type="button" onClick={() => setInspectingLineId(null)} className="btn-secondary text-sm">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
