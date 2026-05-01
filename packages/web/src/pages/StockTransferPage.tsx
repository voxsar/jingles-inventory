import { useEffect, useState } from 'react';
import { branchesApi, floorsApi, skusApi, stockTransfersApi, variantsApi, batchesApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromBranchFilter, setFromBranchFilter] = useState('');
  const [toBranchFilter, setToBranchFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);
  const [lineVariants, setLineVariants] = useState<Record<number, any[]>>({});
  const [lineBatches, setLineBatches] = useState<Record<number, any[]>>({});

  const EMPTY_LINE = { skuId: '', variantId: '', batchId: '', requestedQty: '1', notes: '' };

  const [form, setForm] = useState({
    fromBranchId: '',
    toBranchId: '',
    fromFloorId: '',
    toFloorId: '',
    notes: '',
    lines: [{ ...EMPTY_LINE }],
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (searchTerm) params.search = searchTerm;
      if (statusFilter) params.status = statusFilter;
      if (fromBranchFilter) params.fromBranchId = fromBranchFilter;
      if (toBranchFilter) params.toBranchId = toBranchFilter;
      if (fromDateFilter) params.requestedFrom = fromDateFilter;
      if (toDateFilter) params.requestedTo = toDateFilter;
      const [transferRes, branchRes, locationRes, skuRes] = await Promise.all([
        stockTransfersApi.list(params),
        branchesApi.list(),
        floorsApi.list(),
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

  useEffect(() => { loadData(); }, [page, pageSize, searchTerm, statusFilter, fromBranchFilter, toBranchFilter, fromDateFilter, toDateFilter]);

  const fetchBatchesForLine = (idx: number, skuId: string, variantId?: string) => {
    const params: Record<string, string> = { skuId, isActive: 'true' };
    if (variantId) params.variantId = variantId;
    batchesApi.list(params).then(res => {
      const batches = res.data?.data?.items ?? res.data?.data ?? [];
      setLineBatches(prev => ({ ...prev, [idx]: batches }));
    }).catch(() => setLineBatches(prev => ({ ...prev, [idx]: [] })));
  };

  const addLine = () => {
    setForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_LINE }] }));
  };

  const removeLine = (idx: number) => {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
    setLineVariants(prev => { const n = { ...prev }; delete n[idx]; return n; });
    setLineBatches(prev => { const n = { ...prev }; delete n[idx]; return n; });
  };

  const updateLine = (idx: number, field: string, value: string) => {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l),
    }));

    if (field === 'skuId' && value) {
      variantsApi.list(value).then(res => {
        const variants = res.data?.data ?? [];
        setLineVariants(prev => ({ ...prev, [idx]: variants }));
        setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, variantId: '', batchId: '' } : l) }));
      }).catch(() => setLineVariants(prev => ({ ...prev, [idx]: [] })));
      fetchBatchesForLine(idx, value);
    } else if (field === 'skuId' && !value) {
      setLineVariants(prev => { const n = { ...prev }; delete n[idx]; return n; });
      setLineBatches(prev => { const n = { ...prev }; delete n[idx]; return n; });
    } else if (field === 'variantId') {
      const line = form.lines[idx];
      if (line.skuId) {
        fetchBatchesForLine(idx, line.skuId, value || undefined);
        setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, batchId: '' } : l) }));
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await stockTransfersApi.create({
        fromBranchId: form.fromBranchId || undefined,
        toBranchId: form.toBranchId || undefined,
        fromFloorId: form.fromFloorId || undefined,
        toFloorId: form.toFloorId || undefined,
        notes: form.notes || undefined,
        lines: form.lines.map(l => ({
          skuId: l.skuId,
          variantId: l.variantId || undefined,
          batchId: l.batchId || undefined,
          requestedQty: parseInt(l.requestedQty),
          notes: l.notes || undefined,
        })),
      });
      setShowForm(false);
      setForm({
        fromBranchId: '', toBranchId: '', fromFloorId: '', toFloorId: '',
        notes: '', lines: [{ ...EMPTY_LINE }],
      });
      setLineVariants({});
      setLineBatches({});
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
    { key: 'fromBranch', header: 'From', render: (r: any) => r.fromBranch?.name ?? r.fromFloor?.name ?? '—' },
    { key: 'toBranch', header: 'To', render: (r: any) => r.toBranch?.name ?? r.toFloor?.name ?? '—' },
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
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search reference, notes, requester, branches…"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Statuses' },
                ...['Draft', 'Pending', 'Approved', 'InTransit', 'Completed', 'Cancelled'].map(s => ({
                  value: s,
                  label: s
                }))
              ]}
              value={statusFilter}
              onChange={(value) => { setStatusFilter(value); setPage(1); }}
              placeholder="All Statuses"
              isClearable={false}
            />
          </div>
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All From Branches' },
                ...branches.map((branch: any) => ({ value: branch.id, label: branch.name }))
              ]}
              value={fromBranchFilter}
              onChange={(value) => { setFromBranchFilter(value); setPage(1); }}
              placeholder="All From Branches"
              isClearable={false}
            />
          </div>
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All To Branches' },
                ...branches.map((branch: any) => ({ value: branch.id, label: branch.name }))
              ]}
              value={toBranchFilter}
              onChange={(value) => { setToBranchFilter(value); setPage(1); }}
              placeholder="All To Branches"
              isClearable={false}
            />
          </div>
          <input
            type="date"
            className="filter-select"
            value={fromDateFilter}
            onChange={(e) => { setFromDateFilter(e.target.value); setPage(1); }}
            title="Requested from"
          />
          <input
            type="date"
            className="filter-select"
            value={toDateFilter}
            onChange={(e) => { setToDateFilter(e.target.value); setPage(1); }}
            title="Requested to"
          />
          {(searchTerm || statusFilter || fromBranchFilter || toBranchFilter || fromDateFilter || toDateFilter) && (
            <button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setStatusFilter(''); setFromBranchFilter(''); setToBranchFilter(''); setFromDateFilter(''); setToDateFilter(''); setPage(1); }}>
              ✕ Clear filters
            </button>
          )}
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
                    <SearchableSelect
                      options={[
                        { value: '', label: '— Select Branch —' },
                        ...branches.map((b: any) => ({ value: b.id, label: b.name }))
                      ]}
                      value={form.fromBranchId}
                      onChange={(value) => setForm(f => ({ ...f, fromBranchId: value, fromFloorId: '' }))}
                      placeholder="Select Branch"
                      isClearable={false}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">To Branch</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— Select Branch —' },
                        ...branches.map((b: any) => ({ value: b.id, label: b.name }))
                      ]}
                      value={form.toBranchId}
                      onChange={(value) => setForm(f => ({ ...f, toBranchId: value, toFloorId: '' }))}
                      placeholder="Select Branch"
                      isClearable={false}
                    />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">From Location</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— Select Location —' },
                        ...(form.fromBranchId
                          ? locations.filter((l: any) => l.branchId === form.fromBranchId || l.branch?.id === form.fromBranchId)
                          : locations
                        ).map((l: any) => ({
                          value: l.id,
                          label: l.branch?.name && !form.fromBranchId ? `${l.branch.name} › ${l.name}` : `${l.name} (${l.code})`
                        }))
                      ]}
                      value={form.fromFloorId}
                      onChange={(value) => setForm(f => ({ ...f, fromFloorId: value }))}
                      placeholder="Select Location"
                      isClearable={false}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">To Location</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— Select Location —' },
                        ...(form.toBranchId
                          ? locations.filter((l: any) => l.branchId === form.toBranchId || l.branch?.id === form.toBranchId)
                          : locations
                        ).map((l: any) => ({
                          value: l.id,
                          label: l.branch?.name && !form.toBranchId ? `${l.branch.name} › ${l.name}` : `${l.name} (${l.code})`
                        }))
                      ]}
                      value={form.toFloorId}
                      onChange={(value) => setForm(f => ({ ...f, toFloorId: value }))}
                      placeholder="Select Location"
                      isClearable={false}
                    />
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
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex gap-2 items-center">
                          <div className="flex-1">
                            <SearchableSelect
                              options={[
                                { value: '', label: '— Select SKU —' },
                                ...skus.map((s: any) => ({ value: s.id, label: `${s.skuCode} – ${s.name}` }))
                              ]}
                              value={line.skuId}
                              onChange={(value) => updateLine(idx, 'skuId', value)}
                              placeholder="Select SKU"
                              isClearable={false}
                            />
                          </div>
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
                        {line.skuId && (lineVariants[idx] ?? []).length > 0 && (
                          <div className="mt-2">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Variant</label>
                            <SearchableSelect
                              options={[
                                { value: '', label: '— No Variant (base SKU) —' },
                                ...(lineVariants[idx] ?? []).map((v: any) => ({
                                  value: v.id,
                                  label: `${v.name ?? v.variantCode} (${v.variantCode})`
                                }))
                              ]}
                              value={line.variantId}
                              onChange={(value) => updateLine(idx, 'variantId', value)}
                              placeholder="No Variant"
                              isClearable={false}
                            />
                          </div>
                        )}
                        {line.skuId && (lineBatches[idx] ?? []).length > 0 && (
                          <div className="mt-2">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Batch (optional)</label>
                            <SearchableSelect
                              options={[
                                { value: '', label: '— Any Batch —' },
                                ...(lineBatches[idx] ?? []).map((b: any) => ({
                                  value: b.id,
                                  label: `${b.batchNumber}${b.costPrice ? ` — Cost: ${b.costPrice}` : ''}`
                                }))
                              ]}
                              value={line.batchId}
                              onChange={(value) => updateLine(idx, 'batchId', value)}
                              placeholder="Any Batch"
                              isClearable={false}
                            />
                          </div>
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
