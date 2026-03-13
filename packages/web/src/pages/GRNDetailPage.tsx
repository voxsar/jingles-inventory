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
    <><s-section><s-text>Loading...</s-text></s-section></>
  );

  if (!grn) return (
    <><s-section><s-text>GRN not found</s-text></s-section></>
  );

  const inspectedCount = grn.lines?.filter((l: any) => l.inspectionRecords?.length > 0).length ?? 0;
  const progress = grn.lines?.length > 0 ? Math.round((inspectedCount / grn.lines.length) * 100) : 0;
  const statusTone = STATUS_TONES[grn.status] ?? '';

  return (
    <>
      <s-button  onClick={() => navigate('/grns')}>← Back to GRNs</s-button>

      <s-stack direction="inline" gap="base">
        <s-stack direction="inline" gap="base">
          <s-heading>📋 GRN Detail</s-heading>
          {statusTone ? <s-badge tone={statusTone as any}>{grn.status}</s-badge> : <s-badge>{grn.status}</s-badge>}
        </s-stack>
        {grn.status === GRNStatus.Draft && (
          <s-button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '⏳ Submitting…' : '📤 Submit GRN'}
          </s-button>
        )}
      </s-stack>

      <s-section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', fontSize: '14px' }}>
          <div>
            <s-text>Supplier</s-text>
            <strong>{grn.supplier?.name ?? '—'}</strong>
          </div>
          <div>
            <s-text>Invoice Reference</s-text>
            <strong>{grn.invoiceReference ?? '—'}</strong>
          </div>
          <div>
            <s-text>Created By</s-text>
            <strong>{grn.creator?.email ?? '—'}</strong>
          </div>
          <div>
            <s-text>Created At</s-text>
            <strong>{new Date(grn.createdAt).toLocaleString()}</strong>
          </div>
          {grn.expectedDeliveryDate && (
            <div>
              <s-text>Expected Delivery</s-text>
              <strong>{new Date(grn.expectedDeliveryDate).toLocaleDateString()}</strong>
            </div>
          )}
          {grn.deliveryDate && (
            <div>
              <s-text>Delivery Date</s-text>
              <strong>{new Date(grn.deliveryDate).toLocaleDateString()}</strong>
            </div>
          )}
          {grn.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <s-text>Notes</s-text>
              <p>{grn.notes}</p>
            </div>
          )}
        </div>

        {grn.status !== GRNStatus.Draft && grn.lines?.length > 0 && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e1e3e5' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <s-text>Inspection Progress</s-text>
              <s-text>{inspectedCount} / {grn.lines.length} lines</s-text>
            </div>
            <div style={{ height: '8px', background: '#e1e3e5', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#008060', borderRadius: '9999px', transition: 'width 0.3s', width: `${progress}%` }} />
            </div>
          </div>
        )}
      </s-section>

      <s-section heading={`Line Items (${grn.lines?.length ?? 0})`}>
        {grn.lines?.map((line: any) => (
          <div key={line.id} style={{ padding: '24px', borderBottom: '1px solid #e1e3e5' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <strong>{line.sku?.name}</strong>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', background: '#f6f6f7', padding: '2px 8px', borderRadius: '4px' }}>{line.sku?.skuCode}</span>
                  {line.batchReference && <s-text>Batch: {line.batchReference}</s-text>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                  <span>Expected: <strong>{line.expectedQuantity}</strong></span>
                  <span>Received: <strong>{line.receivedQuantity}</strong></span>
                </div>
              </div>
              {grn.status !== GRNStatus.Draft && line.inspectionRecords?.length === 0 && (
                <s-button variant="primary" onClick={() => { setInspectingLineId(line.id); setInspectionForm({ ...inspectionForm, approvedQuantity: line.receivedQuantity }); }}>
                  🔍 Inspect
                </s-button>
              )}
              {line.inspectionRecords?.length > 0 && (
                <s-badge tone="success">✓ Inspected</s-badge>
              )}
            </div>

            {line.inspectionRecords?.length > 0 && (
              <div style={{ marginTop: '16px', background: '#f6f6f7', borderRadius: '6px', padding: '16px' }}>
                <s-text>Inspection Results</s-text>
                {line.inspectionRecords.map((ir: any) => (
                  <div key={ir.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '14px', marginTop: '8px' }}>
                    <span style={{ color: '#008060', fontWeight: 500 }}>✓ Approved: {ir.approvedQuantity}</span>
                    <span style={{ color: '#d82c0d', fontWeight: 500 }}>✗ Rejected: {ir.rejectedQuantity}</span>
                    {ir.damageClassification && <span style={{ color: '#b98900' }}>⚠️ {ir.damageClassification}</span>}
                    {ir.remarks && <span style={{ color: '#6d7175', fontStyle: 'italic' }}>"{ir.remarks}"</span>}
                    <s-text>by {ir.inspector?.email}</s-text>
                  </div>
                ))}
              </div>
            )}

            {inspectingLineId === line.id && (
              <form onSubmit={handleInspect} style={{ marginTop: '16px' }}>
                <s-section>
                  <s-text>Record Inspection</s-text>
                  <s-stack gap="base">
                    <s-stack direction="inline" gap="base">
                      <s-text-field label="Approved Qty *" type="number" value={String(inspectionForm.approvedQuantity)} required onChange={(e: any) => setInspectionForm((f) => ({ ...f, approvedQuantity: parseInt(e.currentTarget.value) }))} />
                      <s-text-field label="Rejected Qty" type="number" value={String(inspectionForm.rejectedQuantity)} onChange={(e: any) => setInspectionForm((f) => ({ ...f, rejectedQuantity: parseInt(e.currentTarget.value) }))} />
                    </s-stack>
                    <s-stack direction="inline" gap="base">
                      <s-select label="Damage Classification" value={inspectionForm.damageClassification} onChange={(e: any) => setInspectionForm((f) => ({ ...f, damageClassification: e.currentTarget.value }))}>
                        <s-option value="">None</s-option>
                        {Object.values(DamageClassification).map((d) => <s-option key={d} value={d}>{d}</s-option>)}
                      </s-select>
                      <s-text-field label="Remarks" value={inspectionForm.remarks} placeholder="Optional remarks..." onChange={(e: any) => setInspectionForm((f) => ({ ...f, remarks: e.currentTarget.value }))} />
                    </s-stack>
                    <s-stack direction="inline" gap="base">
                      <s-button variant="primary" type="submit">Save Inspection</s-button>
                      <s-button type="button" onClick={() => setInspectingLineId(null)}>Cancel</s-button>
                    </s-stack>
                  </s-stack>
                </s-section>
              </form>
            )}
          </div>
        ))}
      </s-section>
    </>
  );
}
