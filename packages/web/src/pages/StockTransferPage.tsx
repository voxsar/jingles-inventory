import { useEffect, useState } from 'react';
import { branchesApi, locationsApi, skusApi, stockTransfersApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';

const STATUS_TONES: Record<string, string> = {
  Draft: '',
  Pending: 'warning',
  Approved: 'info',
  InTransit: 'info',
  Completed: 'success',
  Cancelled: 'critical',
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? '';
  return tone ? <s-badge tone={tone as any}>{status}</s-badge> : <s-badge>{status}</s-badge>;
}

export default function StockTransferPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);

  const [form, setForm] = useState({
    fromBranchId: '',
    toBranchId: '',
    fromLocationId: '',
    toLocationId: '',
    notes: '',
    lines: [{ skuId: '', requestedQty: '1', notes: '' }],
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (statusFilter) params.status = statusFilter;
      const [transferRes, branchRes, locationRes, skuRes] = await Promise.all([
        stockTransfersApi.list(params),
        branchesApi.list(),
        locationsApi.list(),
        skusApi.list({ pageSize: '100' }),
      ]);
      setTransfers(transferRes.data.data.items);
      setTotal(transferRes.data.data.total);
      setTotalPages(transferRes.data.data.totalPages ?? 1);
      setBranches(branchRes.data.data);
      setLocations(locationRes.data.data?.items ?? locationRes.data.data);
      setSkus(skuRes.data.data.items ?? []);
    } catch (err) {
      console.error('Failed to load stock transfers data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [page, pageSize, statusFilter]);

  const addLine = () => {
    setForm(f => ({ ...f, lines: [...f.lines, { skuId: '', requestedQty: '1', notes: '' }] }));
  };

  const removeLine = (idx: number) => {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  };

  const updateLine = (idx: number, field: string, value: string) => {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l),
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await stockTransfersApi.create({
        fromBranchId: form.fromBranchId || undefined,
        toBranchId: form.toBranchId || undefined,
        fromLocationId: form.fromLocationId || undefined,
        toLocationId: form.toLocationId || undefined,
        notes: form.notes || undefined,
        lines: form.lines.map(l => ({
          skuId: l.skuId,
          requestedQty: parseInt(l.requestedQty),
          notes: l.notes || undefined,
        })),
      });
      setShowForm(false);
      setForm({
        fromBranchId: '', toBranchId: '', fromLocationId: '', toLocationId: '',
        notes: '', lines: [{ skuId: '', requestedQty: '1', notes: '' }],
      });
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create transfer');
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'complete' | 'cancel') => {
    try {
      if (action === 'approve') await stockTransfersApi.approve(id);
      else if (action === 'complete') await stockTransfersApi.complete(id);
      else await stockTransfersApi.cancel(id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? `Failed to ${action} transfer`);
    }
  };

  const columns = [
    { key: 'referenceNumber', header: 'Reference', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 500 }}>{r.referenceNumber}</span>, sortable: true },
    { key: 'fromBranch', header: 'From', render: (r: any) => r.fromBranch?.name ?? r.fromLocation ? `${r.fromLocation?.floor}-${r.fromLocation?.section}` : '—' },
    { key: 'toBranch', header: 'To', render: (r: any) => r.toBranch?.name ?? r.toLocation ? `${r.toLocation?.floor}-${r.toLocation?.section}` : '—' },
    { key: 'lines', header: 'Lines', render: (r: any) => r.lines?.length ?? 0 },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'requestedAt', header: 'Requested', render: (r: any) => new Date(r.requestedAt).toLocaleDateString(), sortable: true },
    {
      key: 'actions', header: 'Actions',
      render: (r: any) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          {r.status === 'Draft' && (
            <s-button  onClick={() => handleAction(r.id, 'approve')}>Approve</s-button>
          )}
          {r.status === 'Approved' && (
            <s-button  onClick={() => handleAction(r.id, 'complete')}>Complete</s-button>
          )}
          {r.status !== 'Completed' && r.status !== 'Cancelled' && (
            <s-button  onClick={() => handleAction(r.id, 'cancel')}>Cancel</s-button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <s-stack direction="inline" gap="base">
        <div>
          <s-heading>🔄 Stock Transfers</s-heading>
          <s-text>Transfer stock between branches and locations</s-text>
        </div>
        <s-button variant="primary" onClick={() => setShowForm(!showForm)}>+ New Transfer</s-button>
      </s-stack>

      {showForm && (
        <s-section heading="New Stock Transfer">
          <form onSubmit={handleCreate}>
            <s-stack gap="base">
              <s-stack direction="inline" gap="base">
                <s-select label="From Branch" value={form.fromBranchId} onChange={(e: any) => setForm(f => ({ ...f, fromBranchId: e.currentTarget.value }))}>
                  <s-option value="">— Select Branch —</s-option>
                  {branches.map((b: any) => <s-option key={b.id} value={b.id}>{b.name}</s-option>)}
                </s-select>
                <s-select label="To Branch" value={form.toBranchId} onChange={(e: any) => setForm(f => ({ ...f, toBranchId: e.currentTarget.value }))}>
                  <s-option value="">— Select Branch —</s-option>
                  {branches.map((b: any) => <s-option key={b.id} value={b.id}>{b.name}</s-option>)}
                </s-select>
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-select label="From Location" value={form.fromLocationId} onChange={(e: any) => setForm(f => ({ ...f, fromLocationId: e.currentTarget.value }))}>
                  <s-option value="">— Select Location —</s-option>
                  {locations.map((l: any) => <s-option key={l.id} value={l.id}>{l.floor}-{l.section}-{l.shelf}</s-option>)}
                </s-select>
                <s-select label="To Location" value={form.toLocationId} onChange={(e: any) => setForm(f => ({ ...f, toLocationId: e.currentTarget.value }))}>
                  <s-option value="">— Select Location —</s-option>
                  {locations.map((l: any) => <s-option key={l.id} value={l.id}>{l.floor}-{l.section}-{l.shelf}</s-option>)}
                </s-select>
              </s-stack>
              <s-text-field label="Notes" value={form.notes} onChange={(e: any) => setForm(f => ({ ...f, notes: e.currentTarget.value }))} />
              <div>
                <s-stack direction="inline" gap="base">
                  <s-text>Transfer Lines *</s-text>
                  <s-button  type="button" onClick={addLine}>+ Add Line</s-button>
                </s-stack>
                <s-stack gap="base">
                  {form.lines.map((line, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <s-select label="SKU" label-visibility="hidden" value={line.skuId} onChange={(e: any) => updateLine(idx, 'skuId', e.currentTarget.value)}>
                          <s-option value="">— Select SKU —</s-option>
                          {skus.map((s: any) => <s-option key={s.id} value={s.id}>{s.skuCode} – {s.name}</s-option>)}
                        </s-select>
                      </div>
                      <s-text-field label="Qty" label-visibility="hidden" type="number" value={line.requestedQty} placeholder="Qty" onChange={(e: any) => updateLine(idx, 'requestedQty', e.currentTarget.value)} />
                      <div style={{ flex: 1 }}>
                        <s-text-field label="Notes" label-visibility="hidden" value={line.notes} placeholder="Notes" onChange={(e: any) => updateLine(idx, 'notes', e.currentTarget.value)} />
                      </div>
                      {form.lines.length > 1 && (
                        <s-button  type="button" onClick={() => removeLine(idx)}>✕</s-button>
                      )}
                    </div>
                  ))}
                </s-stack>
              </div>
              <s-stack direction="inline" gap="base">
                <s-button variant="primary" type="submit">Create Transfer</s-button>
                <s-button type="button" onClick={() => setShowForm(false)}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      )}

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-select label="Status" label-visibility="hidden" value={statusFilter} onChange={(e: any) => { setStatusFilter(e.currentTarget.value); setPage(1); }}>
            <s-option value="">All Statuses</s-option>
            {['Draft', 'Pending', 'Approved', 'InTransit', 'Completed', 'Cancelled'].map(s => (
              <s-option key={s} value={s}>{s}</s-option>
            ))}
          </s-select>
          <s-text>{total} transfers</s-text>
        </s-stack>

        <DataTable
          columns={columns}
          data={transfers}
          isLoading={isLoading}
          emptyMessage="No stock transfers found"
          emptyIcon="🔄"
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </s-section>
    </>
  );
}
