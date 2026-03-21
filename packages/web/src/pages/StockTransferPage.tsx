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
      setTransfers(transferRes.data.data?.items ?? []);
      setTotal(transferRes.data.data?.total ?? 0);
      setTotalPages(transferRes.data.data?.totalPages ?? 1);
      setBranches(branchRes.data?.data?.items ?? branchRes.data?.data ?? branchRes.data ?? []);
      setLocations(locationRes.data?.data?.items ?? locationRes.data?.data ?? locationRes.data ?? []);
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
        <div className="flex gap-1">
          {r.status === 'Draft' && (
            <button className="btn-sm" onClick={() => handleAction(r.id, 'approve')}>Approve</button>
          )}
          {r.status === 'Approved' && (
            <button className="btn-sm" onClick={() => handleAction(r.id, 'complete')}>Complete</button>
          )}
          {r.status !== 'Completed' && r.status !== 'Cancelled' && (
            <button className="btn-sm text-red-600" onClick={() => handleAction(r.id, 'cancel')}>Cancel</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">🔄 Stock Transfers</h1>
          <p className="page-subtitle">Transfer stock between branches and locations</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ New Transfer</button>
      </div>

      {/* Table section */}
      <div className="content-section">
        {/* Filter bar */}
        <div className="filter-bar">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            {['Draft', 'Pending', 'Approved', 'InTransit', 'Completed', 'Cancelled'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{total} transfers</span>
        </div>

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
      </div>

      {/* Create Transfer Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel-lg">
            <div className="modal-header">
              <h2 className="modal-title">➕ New Stock Transfer</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">From Branch</label>
                    <select className="input-field" value={form.fromBranchId} onChange={(e) => setForm(f => ({ ...f, fromBranchId: e.target.value }))}>
                      <option value="">— Select Branch —</option>
                      {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">To Branch</label>
                    <select className="input-field" value={form.toBranchId} onChange={(e) => setForm(f => ({ ...f, toBranchId: e.target.value }))}>
                      <option value="">— Select Branch —</option>
                      {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">From Location</label>
                    <select className="input-field" value={form.fromLocationId} onChange={(e) => setForm(f => ({ ...f, fromLocationId: e.target.value }))}>
                      <option value="">— Select Location —</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.floor}-{l.section}-{l.shelf}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">To Location</label>
                    <select className="input-field" value={form.toLocationId} onChange={(e) => setForm(f => ({ ...f, toLocationId: e.target.value }))}>
                      <option value="">— Select Location —</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.floor}-{l.section}-{l.shelf}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input-field" type="text" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                {/* Transfer lines */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Transfer Lines *</span>
                    <button type="button" className="btn-sm" onClick={addLine}>+ Add Line</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {form.lines.map((line, idx) => (
                      <div key={idx} className="flex gap-2 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <select
                          className="input-field flex-1"
                          value={line.skuId}
                          onChange={(e) => updateLine(idx, 'skuId', e.target.value)}
                        >
                          <option value="">— Select SKU —</option>
                          {skus.map((s: any) => <option key={s.id} value={s.id}>{s.skuCode} – {s.name}</option>)}
                        </select>
                        <input
                          type="number"
                          className="input-field"
                          style={{ width: '80px' }}
                          value={line.requestedQty}
                          placeholder="Qty"
                          min="1"
                          onChange={(e) => updateLine(idx, 'requestedQty', e.target.value)}
                        />
                        <input
                          type="text"
                          className="input-field"
                          style={{ width: '140px' }}
                          value={line.notes}
                          placeholder="Notes"
                          onChange={(e) => updateLine(idx, 'notes', e.target.value)}
                        />
                        {form.lines.length > 1 && (
                          <button type="button" className="btn-icon text-red-500" onClick={() => removeLine(idx)}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
