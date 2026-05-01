import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { prnsApi } from '../api/client';
import { PRNStatus } from '@jingles/shared';

const STATUS_TONES: Record<string, string> = {
  [PRNStatus.Draft]: '',
  [PRNStatus.Submitted]: 'info',
  [PRNStatus.PickedUp]: 'success',
  [PRNStatus.Closed]: '',
};

export default function PRNDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prn, setPrn] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingUp, setIsPickingUp] = useState(false);

  const loadPRN = async () => {
    if (!id) return;
    try {
      const res = await prnsApi.get(id);
      setPrn(res.data?.data ?? res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadPRN(); }, [id]);

  const handleSubmit = async () => {
    if (!id || !confirm('Submit this PRN? This will convert Damaged inventory at the assigned shelf into Returned inventory.')) return;
    setIsSubmitting(true);
    try {
      await prnsApi.submit(id);
      await loadPRN();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Submit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickup = async () => {
    if (!id || !confirm('Mark this PRN as picked up by the supplier?')) return;
    setIsPickingUp(true);
    try {
      await prnsApi.pickup(id);
      await loadPRN();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Pickup failed');
    } finally {
      setIsPickingUp(false);
    }
  };

  if (isLoading) return (
    <div className="flex flex-col gap-4">
      <div className="content-section px-6 py-8 text-sm text-gray-500">Loading…</div>
    </div>
  );

  if (!prn) return (
    <div className="flex flex-col gap-4">
      <div className="content-section px-6 py-8 text-sm text-gray-500">PRN not found</div>
    </div>
  );

  const statusTone = STATUS_TONES[prn.status] ?? '';
  const totalReturn = (prn.lines ?? []).reduce((sum: number, l: any) => sum + (l.returnQuantity ?? 0), 0);
  const totalPickedUp = (prn.lines ?? []).reduce((sum: number, l: any) => sum + (l.pickedUpQuantity ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn-secondary text-sm" onClick={() => navigate('/prns')}>← Back</button>
          <div className="page-header-left">
            <div className="flex items-center gap-3">
              <h1 className="page-title">↩️ PRN Detail</h1>
              {statusTone ? <s-badge tone={statusTone as any}>{prn.status}</s-badge> : <s-badge>{prn.status}</s-badge>}
            </div>
            <p className="page-subtitle font-mono text-xs">{prn.id?.slice(0, 8)}…</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {prn.status === PRNStatus.Draft && (
            <>
              {!prn.shelfId && (
                <span className="text-xs text-amber-600 font-medium">⚠️ A shelf must be assigned before submitting</span>
              )}
              <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitting || !prn.shelfId}>
                {isSubmitting ? '⏳ Submitting…' : '📤 Submit PRN'}
              </button>
            </>
          )}
          {prn.status === PRNStatus.Submitted && (
            <button className="btn-primary" onClick={handlePickup} disabled={isPickingUp}>
              {isPickingUp ? '⏳ Marking…' : '🚚 Mark Picked Up'}
            </button>
          )}
        </div>
      </div>

      <div className="content-section px-6 py-5">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm lg:grid-cols-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Supplier</p>
            <p className="font-semibold text-gray-900">{prn.supplier?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Return Reason</p>
            <p className="font-semibold text-gray-900">{prn.returnReason ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Created By</p>
            <p className="font-semibold text-gray-900">{prn.creator?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Created At</p>
            <p className="font-semibold text-gray-900">{new Date(prn.createdAt).toLocaleString()}</p>
          </div>
          {prn.expectedPickupDate && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Expected Pickup</p>
              <p className="font-semibold text-gray-900">{new Date(prn.expectedPickupDate).toLocaleDateString()}</p>
            </div>
          )}
          {prn.pickupDate && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Pickup Date</p>
              <p className="font-semibold text-gray-900">{new Date(prn.pickupDate).toLocaleDateString()}</p>
            </div>
          )}
          {(prn.floor || prn.shelf) && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Return Location</p>
              <p className="font-semibold text-gray-900">
                {prn.floor?.branch?.name && <span>{prn.floor.branch.name} › </span>}
                {prn.floor?.name && <span>{prn.floor.name}</span>}
                {prn.shelf && <span className="text-gray-600"> › {prn.shelf.name} ({prn.shelf.code})</span>}
              </p>
            </div>
          )}
          {prn.notes && (
            <div className="col-span-full">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Notes</p>
              <p className="text-gray-700">{prn.notes}</p>
            </div>
          )}
        </div>

        {prn.inspectionRecord && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Linked GRN Inspection</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <div className="flex flex-wrap gap-3">
                {prn.inspectionRecord.grnLine?.grn?.id && (
                  <button
                    className="text-blue-700 hover:underline font-medium"
                    onClick={() => navigate(`/grns/${prn.inspectionRecord.grnLine.grn.id}`)}
                  >
                    📋 GRN {prn.inspectionRecord.grnLine.grn.invoiceReference ?? prn.inspectionRecord.grnLine.grn.id.slice(0, 8)}
                  </button>
                )}
                <span className="text-red-600 font-medium">✗ Rejected: {prn.inspectionRecord.rejectedQuantity}</span>
                {prn.inspectionRecord.damageClassification && (
                  <span className="text-amber-700">⚠️ {prn.inspectionRecord.damageClassification}</span>
                )}
                {prn.inspectionRecord.inspector?.email && (
                  <span className="text-gray-500">Inspected by {prn.inspectionRecord.inspector.email}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {prn.lines?.length > 0 && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Pickup Progress</span>
              <span className="text-sm font-medium text-gray-900">{totalPickedUp} / {totalReturn} units</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-primary-500 rounded-full transition-all"
                style={{ width: `${totalReturn > 0 ? Math.round((totalPickedUp / totalReturn) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="content-section">
        <div className="content-section-header">
          <h2 className="text-base font-semibold text-gray-900">Line Items ({prn.lines?.length ?? 0})</h2>
        </div>
        {prn.lines?.map((line: any, idx: number) => (
          <div key={line.id} className={`px-6 py-5 ${idx < prn.lines.length - 1 ? 'border-b border-gray-100' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-gray-900">{line.sku?.name}</span>
                  <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{line.sku?.skuCode}</span>
                  {line.variant && (
                    <span className="text-xs text-gray-500">Variant: {line.variant.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>Return: <strong className="text-gray-900">{line.returnQuantity}</strong></span>
                  <span>Picked up: <strong className="text-gray-900">{line.pickedUpQuantity}</strong></span>
                </div>
                {line.notes && (
                  <p className="text-sm text-gray-500 italic mt-2">"{line.notes}"</p>
                )}
              </div>
              {line.pickedUpQuantity >= line.returnQuantity && line.returnQuantity > 0 && (
                <s-badge tone="success">✓ Picked Up</s-badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
