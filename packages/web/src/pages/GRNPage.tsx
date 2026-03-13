import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, skusApi } from '../api/client';
import { GRNStatus } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';

const STATUS_COLORS: Record<string, string> = {
  [GRNStatus.Draft]: 'bg-gray-100 text-gray-700',
  [GRNStatus.Submitted]: 'bg-blue-100 text-blue-700',
  [GRNStatus.PartiallyInspected]: 'bg-amber-100 text-amber-700',
  [GRNStatus.FullyInspected]: 'bg-green-100 text-green-700',
  [GRNStatus.Closed]: 'bg-gray-100 text-gray-500',
};

const PAGE_SIZE = 20;

export default function GRNPage() {
  const [grns, setGrns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [editingGrn, setEditingGrn] = useState<any>(null);
  const [editForm, setEditForm] = useState({ supplierId: '', invoiceReference: '', expectedDeliveryDate: '', notes: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const getTodayString = () => new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    supplierId: '',
    invoiceReference: '',
    expectedDeliveryDate: getTodayString(),
    notes: '',
    lines: [{ skuId: '', expectedQuantity: 1, batchReference: '' }],
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      const [grnRes, vendorRes, skuRes] = await Promise.all([
        grnsApi.list(params),
        vendorsApi.list(),
        skusApi.list({ pageSize: '200' }),
      ]);
      const grnData = grnRes.data?.data?.items ?? grnRes.data?.data ?? grnRes.data ?? [];
      setGrns(Array.isArray(grnData) ? grnData : []);
      setTotal(grnRes.data?.data?.total ?? 0);
      setTotalPages(grnRes.data?.data?.totalPages ?? 1);
      setVendors(vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? []);
      setSkus(skuRes.data?.data?.items ?? skuRes.data?.data ?? skuRes.data ?? []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, [page, pageSize, debouncedSearch, statusFilter, supplierFilter]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await grnsApi.create(form);
      setShowForm(false);
      setForm({ supplierId: '', invoiceReference: '', expectedDeliveryDate: getTodayString(), notes: '', lines: [{ skuId: '', expectedQuantity: 1, batchReference: '' }] });
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create GRN');
    }
  };

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { skuId: '', expectedQuantity: 1, batchReference: '' }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: string, value: any) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

  const openEdit = (grn: any) => {
    setEditingGrn(grn);
    setEditForm({
      supplierId: grn.supplierId ?? '',
      invoiceReference: grn.invoiceReference ?? '',
      expectedDeliveryDate: grn.expectedDeliveryDate ? grn.expectedDeliveryDate.split('T')[0] : getTodayString(),
      notes: grn.notes ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingGrn) return;
    setIsSavingEdit(true);
    try {
      await grnsApi.update(editingGrn.id, editForm);
      setEditingGrn(null);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update GRN');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const columns = [
    { key: 'id', header: 'GRN ID', render: (r: any) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
    { key: 'supplier', header: 'Supplier', sortable: true, render: (r: any) => r.supplier?.name },
    { key: 'invoiceReference', header: 'Invoice Ref', render: (r: any) => r.invoiceReference ?? <span className="text-gray-400">—</span> },
    { key: 'status', header: 'Status', render: (r: any) => <span className={`badge ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span> },
    { key: 'linesCount', header: 'Lines', align: 'right' as const, render: (r: any) => <span className="font-semibold">{r.lines?.length ?? 0}</span> },
    { key: 'createdAt', header: 'Created', sortable: true, render: (r: any) => <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</span> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status === GRNStatus.Draft && (
            <button onClick={() => openEdit(r)} className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1 rounded hover:bg-amber-50">Edit</button>
          )}
          <button onClick={() => navigate(`/grns/${r.id}`)} className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50">View</button>
        </div>
      ),
    },
  ];

  const hasFilters = searchTerm || statusFilter || supplierFilter;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">📋 Goods Receipt Notes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} GRNs total</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? '✕ Cancel' : '+ New GRN'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="section-title">➕ Create GRN</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Supplier *</label>
                <select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} required className="input-field">
                  <option value="">Select supplier</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Invoice Reference</label>
                <input type="text" value={form.invoiceReference} onChange={(e) => setForm((f) => ({ ...f, invoiceReference: e.target.value }))} className="input-field" placeholder="e.g. INV-2024-001" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Expected Delivery</label>
                <input type="date" value={form.expectedDeliveryDate} onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Notes</label>
                <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-field" placeholder="Optional notes..." />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</label>
                <button type="button" onClick={addLine} className="text-sm text-primary-600 hover:text-primary-800 font-medium">+ Add Line</button>
              </div>
              <div className="space-y-2">
                {form.lines.map((line, i) => (
                  <div key={i} className="flex gap-2 items-center p-2 bg-gray-50 rounded-lg">
                    <select value={line.skuId} onChange={(e) => updateLine(i, 'skuId', e.target.value)} required className="input-field flex-1">
                      <option value="">Select product</option>
                      {skus.map((s: any) => <option key={s.id} value={s.id}>{s.skuCode} – {s.name}</option>)}
                    </select>
                    <input type="number" min="1" value={line.expectedQuantity} onChange={(e) => updateLine(i, 'expectedQuantity', parseInt(e.target.value))} className="input-field w-24" placeholder="Qty" />
                    <input type="text" value={line.batchReference} onChange={(e) => updateLine(i, 'batchReference', e.target.value)} className="input-field w-32" placeholder="Batch ref" />
                    {form.lines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700 p-1">✕</button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Create GRN</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card-flat overflow-hidden">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input type="text" placeholder="Search invoice ref, supplier..." value={searchTerm} onChange={(e) => handleSearchChange(e.target.value)} className="filter-input pl-9 w-full" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="filter-input">
            <option value="">All Statuses</option>
            {Object.values(GRNStatus).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }} className="filter-input">
            <option value="">All Suppliers</option>
            {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {hasFilters && <button onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setStatusFilter(''); setSupplierFilter(''); setPage(1); }} className="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap">Clear filters</button>}
        </div>

        <DataTable
          columns={columns}
          data={grns}
          isLoading={isLoading}
          emptyMessage="No GRNs found"
          emptyIcon="📋"
          onRowClick={(row) => navigate(`/grns/${row.id}`)}
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

      {/* Edit GRN Modal (Draft only) */}
      {editingGrn && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingGrn(null)}>
          <div className="modal-panel max-w-lg">
            <div className="modal-header">
              <div>
                <h2 className="text-lg font-semibold">Edit GRN</h2>
                <span className="text-xs text-gray-500 font-mono">{editingGrn.id.slice(0, 8)}…</span>
              </div>
              <button onClick={() => setEditingGrn(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Supplier</label>
                <select value={editForm.supplierId} onChange={(e) => setEditForm((f) => ({ ...f, supplierId: e.target.value }))} className="input-field">
                  <option value="">Select supplier</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Invoice Reference</label>
                <input type="text" value={editForm.invoiceReference} onChange={(e) => setEditForm((f) => ({ ...f, invoiceReference: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Expected Delivery Date</label>
                <input type="date" value={editForm.expectedDeliveryDate} onChange={(e) => setEditForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="input-field" rows={3} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditingGrn(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveEdit} disabled={isSavingEdit} className="btn-primary min-w-[100px]">
                {isSavingEdit ? '⏳ Saving…' : '💾 Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
