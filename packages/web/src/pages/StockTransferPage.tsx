import { useEffect, useState } from 'react';
import { branchesApi, locationsApi, skusApi, stockTransfersApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-blue-100 text-blue-700',
  InTransit: 'bg-purple-100 text-purple-700',
  Completed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
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
    { key: 'referenceNumber', header: 'Reference', render: (r: any) => <span className="font-mono text-xs font-medium">{r.referenceNumber}</span>, sortable: true },
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
            <button onClick={() => handleAction(r.id, 'approve')} className="text-xs text-blue-600 hover:underline">Approve</button>
          )}
          {r.status === 'Approved' && (
            <button onClick={() => handleAction(r.id, 'complete')} className="text-xs text-green-600 hover:underline">Complete</button>
          )}
          {r.status !== 'Completed' && r.status !== 'Cancelled' && (
            <button onClick={() => handleAction(r.id, 'cancel')} className="text-xs text-red-600 hover:underline ml-1">Cancel</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔄 Stock Transfers</h1>
          <p className="text-sm text-gray-500 mt-1">Transfer stock between branches and locations</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">+ New Transfer</button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">New Stock Transfer</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Branch</label>
                <select value={form.fromBranchId} onChange={e => setForm(f => ({ ...f, fromBranchId: e.target.value }))} className="input-field">
                  <option value="">— Select Branch —</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Branch</label>
                <select value={form.toBranchId} onChange={e => setForm(f => ({ ...f, toBranchId: e.target.value }))} className="input-field">
                  <option value="">— Select Branch —</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Location</label>
                <select value={form.fromLocationId} onChange={e => setForm(f => ({ ...f, fromLocationId: e.target.value }))} className="input-field">
                  <option value="">— Select Location —</option>
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.floor}-{l.section}-{l.shelf}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Location</label>
                <select value={form.toLocationId} onChange={e => setForm(f => ({ ...f, toLocationId: e.target.value }))} className="input-field">
                  <option value="">— Select Location —</option>
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.floor}-{l.section}-{l.shelf}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Transfer Lines *</label>
                <button type="button" onClick={addLine} className="text-xs text-primary-600 hover:underline">+ Add Line</button>
              </div>
              <div className="space-y-2">
                {form.lines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <select value={line.skuId} onChange={e => updateLine(idx, 'skuId', e.target.value)} required className="input-field">
                        <option value="">— Select SKU —</option>
                        {skus.map((s: any) => <option key={s.id} value={s.id}>{s.skuCode} – {s.name}</option>)}
                      </select>
                    </div>
                    <div className="w-24">
                      <input type="number" min="1" value={line.requestedQty} onChange={e => updateLine(idx, 'requestedQty', e.target.value)} required className="input-field" placeholder="Qty" />
                    </div>
                    <div className="flex-1">
                      <input type="text" value={line.notes} onChange={e => updateLine(idx, 'notes', e.target.value)} className="input-field" placeholder="Notes" />
                    </div>
                    {form.lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)} className="text-red-500 hover:text-red-700 text-sm pb-2">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Create Transfer</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex gap-3 mb-4">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-field max-w-xs"
          >
            <option value="">All Statuses</option>
            {['Draft', 'Pending', 'Approved', 'InTransit', 'Completed', 'Cancelled'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500 self-center">{total} transfers</span>
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
    </div>
  );
}
