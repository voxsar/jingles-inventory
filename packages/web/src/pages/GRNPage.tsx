import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, skusApi, floorsApi, shelvesApi, variantsApi } from '../api/client';
import { GRNStatus } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';

const STATUS_TONES: Record<string, string> = {
  [GRNStatus.Draft]: '',
  [GRNStatus.Submitted]: 'info',
  [GRNStatus.PartiallyInspected]: 'warning',
  [GRNStatus.FullyInspected]: 'success',
  [GRNStatus.Closed]: '',
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
  const [skuSearch, setSkuSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [editingGrn, setEditingGrn] = useState<any>(null);
  const [editForm, setEditForm] = useState({ supplierId: '', invoiceReference: '', expectedDeliveryDate: '', notes: '', floorId: '', shelfId: '' });
  const [locations, setLocations] = useState<any[]>([]);
  const [formShelves, setFormShelves] = useState<any[]>([]);
  const [editFormShelves, setEditFormShelves] = useState<any[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [lineVariants, setLineVariants] = useState<Record<number, any[]>>({});
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const getTodayString = () => new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    supplierId: '',
    invoiceReference: '',
    expectedDeliveryDate: getTodayString(),
    notes: '',
    floorId: '',
    shelfId: '',
    lines: [{ skuId: '', variantId: '', expectedQuantity: 1, batchReference: '' }],
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      const [grnRes, vendorRes, locationRes] = await Promise.all([
        grnsApi.list(params),
        vendorsApi.list(),
        floorsApi.list(),
      ]);
      const grnData = grnRes.data?.data?.items ?? grnRes.data?.data ?? grnRes.data ?? [];
      setGrns(Array.isArray(grnData) ? grnData : []);
      setTotal(grnRes.data?.data?.total ?? 0);
      setTotalPages(grnRes.data?.data?.totalPages ?? 1);
      setVendors(vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? []);
      setLocations(locationRes.data?.data?.items ?? locationRes.data?.data ?? locationRes.data ?? []);
    } catch (err) {
      console.error('Failed to load GRN data', err);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, [page, pageSize, debouncedSearch, statusFilter, supplierFilter]);

  useEffect(() => {
    if (!showForm) return;
    const params: Record<string, string> = { pageSize: '50' };
    if (skuSearch) params.search = skuSearch;
    skusApi.list(params).then((res) => {
      setSkus(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    }).catch((err) => { console.error('Failed to load SKUs', err); });
  }, [showForm, skuSearch]);

  const handleSkuSearchChange = (value: string) => {
    setSkuSearch(value);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await grnsApi.create({ ...form, floorId: form.floorId || undefined, shelfId: form.shelfId || undefined });
      setShowForm(false);
      setForm({ supplierId: '', invoiceReference: '', expectedDeliveryDate: getTodayString(), notes: '', floorId: '', shelfId: '', lines: [{ skuId: '', variantId: '', expectedQuantity: 1, batchReference: '' }] });
      setFormShelves([]);
      setLineVariants({});
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create GRN');
    }
  };

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { skuId: '', variantId: '', expectedQuantity: 1, batchReference: '' }] }));
  const removeLine = (i: number) => { setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) })); setLineVariants(prev => { const n = { ...prev }; delete n[i]; return n; }); };
  const updateLine = (i: number, field: string, value: any) => {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));
    if (field === 'skuId' && value) {
      variantsApi.list(value).then(res => {
        const variants = res.data?.data ?? [];
        setLineVariants(prev => ({ ...prev, [i]: variants }));
        // Reset variantId for this line
        setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, variantId: '' } : l) }));
      }).catch(() => setLineVariants(prev => ({ ...prev, [i]: [] })));
    } else if (field === 'skuId' && !value) {
      setLineVariants(prev => { const n = { ...prev }; delete n[i]; return n; });
    }
  };

  const openEdit = (grn: any) => {
    setEditingGrn(grn);
    setEditForm({
      supplierId: grn.supplierId ?? '',
      invoiceReference: grn.invoiceReference ?? '',
      expectedDeliveryDate: grn.expectedDeliveryDate ? grn.expectedDeliveryDate.split('T')[0] : getTodayString(),
      notes: grn.notes ?? '',
      floorId: grn.floorId ?? '',
      shelfId: grn.shelfId ?? '',
    });
    if (grn.floorId) {
      shelvesApi.list({ floorId: grn.floorId }).then((res) => {
        setEditFormShelves(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
      }).catch(() => setEditFormShelves([]));
    } else {
      setEditFormShelves([]);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingGrn) return;
    setIsSavingEdit(true);
    try {
      await grnsApi.update(editingGrn.id, editForm);
      setEditingGrn(null);
      setEditFormShelves([]);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update GRN');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const columns = [
    { key: 'id', header: 'GRN ID', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.id.slice(0, 8)}…</span> },
    { key: 'supplier', header: 'Supplier', sortable: true, render: (r: any) => r.supplier?.name },
    { key: 'invoiceReference', header: 'Invoice Ref', render: (r: any) => r.invoiceReference ?? <s-text>—</s-text> },
    { key: 'floor', header: 'Location', render: (r: any) => {
      if (!r.floor) return <s-text>—</s-text>;
      const floorLabel = r.floor.branch?.name ? `🏢 ${r.floor.branch.name} › ${r.floor.name}` : r.floor.name;
      return (
        <span className="text-xs">
          {floorLabel} <span className="text-gray-400">({r.floor.code})</span>
          {r.shelf && <span className="text-gray-500"> › {r.shelf.name}</span>}
        </span>
      );
    }},
    {
      key: 'status', header: 'Status', render: (r: any) => {
        const tone = STATUS_TONES[r.status] ?? '';
        return tone ? <s-badge tone={tone as any}>{r.status}</s-badge> : <s-badge>{r.status}</s-badge>;
      }
    },
    { key: 'linesCount', header: 'Lines', align: 'right' as const, render: (r: any) => <span style={{ fontWeight: 600 }}>{r.lines?.length ?? 0}</span> },
    { key: 'createdAt', header: 'Created', sortable: true, render: (r: any) => <s-text>{new Date(r.createdAt).toLocaleDateString()}</s-text> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status === GRNStatus.Draft && (
            <button className="btn-sm" onClick={() => openEdit(r)}>Edit</button>
          )}
          <button className="btn-sm" onClick={() => navigate(`/grns/${r.id}`)}>View</button>
        </div>
      ),
    },
  ];

  const hasFilters = searchTerm || statusFilter || supplierFilter;

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">📋 Goods Receipt Notes</h1>
          <p className="page-subtitle">{total.toLocaleString()} GRNs total</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ New GRN</button>
      </div>

      {/* Table section */}
      <div className="content-section">
        {/* Filter bar */}
        <div className="filter-bar">
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search invoice ref, supplier…"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            {Object.values(GRNStatus).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="filter-select"
            value={supplierFilter}
            onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Suppliers</option>
            {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {hasFilters && (
            <button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setStatusFilter(''); setSupplierFilter(''); setPage(1); }}>
              ✕ Clear filters
            </button>
          )}
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

      {/* Create GRN Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel-lg">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create New GRN</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Supplier *</label>
                    <select className="input-field" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} required>
                      <option value="">Select supplier</option>
                      {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Invoice Reference</label>
                    <input className="input-field" type="text" value={form.invoiceReference} placeholder="e.g. INV-2024-001" onChange={(e) => setForm((f) => ({ ...f, invoiceReference: e.target.value }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Expected Delivery</label>
                    <input className="input-field" type="date" value={form.expectedDeliveryDate} onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input className="input-field" type="text" value={form.notes} placeholder="Optional notes…" onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Receive Location — Floor</label>
                  <select className="input-field" value={form.floorId} onChange={(e) => {
                    const floorId = e.target.value;
                    setForm((f) => ({ ...f, floorId, shelfId: '' }));
                    setFormShelves([]);
                    if (floorId) {
                      shelvesApi.list({ floorId }).then((res) => {
                        setFormShelves(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
                      }).catch(() => setFormShelves([]));
                    }
                  }}>
                    <option value="">— No Floor —</option>
                    {locations.map((loc: any) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`}
                      </option>
                    ))}
                  </select>
                </div>
                {form.floorId && (
                  <div className="form-group">
                    <label className="form-label">Receive Location — Shelf</label>
                    <select className="input-field" value={form.shelfId} onChange={(e) => setForm((f) => ({ ...f, shelfId: e.target.value }))}>
                      <option value="">— Select Shelf —</option>
                      {formShelves.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Line items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Line Items</span>
                    <button type="button" className="btn-sm" onClick={addLine}>+ Add Line</button>
                  </div>
                  <div className="mb-3">
                    <input
                      type="search"
                      className="input-field"
                      placeholder="Filter products by name or code…"
                      value={skuSearch}
                      onChange={(e) => handleSkuSearchChange(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    {form.lines.map((line, i) => (
                      <div key={i} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex gap-2 items-center">
                          <select
                            className="input-field flex-1"
                            value={line.skuId}
                            onChange={(e) => updateLine(i, 'skuId', e.target.value)}
                          >
                            <option value="">Select product</option>
                            {skus.map((s: any) => <option key={s.id} value={s.id}>{s.skuCode} – {s.name}</option>)}
                          </select>
                          <input
                            type="number"
                            className="input-field"
                            style={{ width: '80px' }}
                            value={line.expectedQuantity}
                            placeholder="Qty"
                            min="1"
                            onChange={(e) => updateLine(i, 'expectedQuantity', parseInt(e.target.value))}
                          />
                          <input
                            type="text"
                            className="input-field"
                            style={{ width: '140px' }}
                            value={line.batchReference}
                            placeholder="Batch ref"
                            onChange={(e) => updateLine(i, 'batchReference', e.target.value)}
                          />
                          {form.lines.length > 1 && (
                            <button type="button" className="btn-icon text-red-500" onClick={() => removeLine(i)}>✕</button>
                          )}
                        </div>
                        {line.skuId && (lineVariants[i] ?? []).length > 0 && (
                          <select
                            className="input-field"
                            value={line.variantId}
                            onChange={(e) => updateLine(i, 'variantId', e.target.value)}
                          >
                            <option value="">— No Variant (base SKU) —</option>
                            {(lineVariants[i] ?? []).map((v: any) => (
                              <option key={v.id} value={v.id}>{v.name} ({v.variantCode})</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create GRN</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit GRN Modal */}
      {editingGrn && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingGrn(null)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Edit GRN</h2>
                <span className="text-xs text-gray-400 font-mono">{editingGrn.id.slice(0, 8)}…</span>
              </div>
              <button className="modal-close" onClick={() => setEditingGrn(null)}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <select className="input-field" value={editForm.supplierId} onChange={(e) => setEditForm((f) => ({ ...f, supplierId: e.target.value }))}>
                  <option value="">Select supplier</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Reference</label>
                <input className="input-field" type="text" value={editForm.invoiceReference} onChange={(e) => setEditForm((f) => ({ ...f, invoiceReference: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Delivery Date</label>
                <input className="input-field" type="date" value={editForm.expectedDeliveryDate} onChange={(e) => setEditForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="input-field" type="text" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Receive Location — Floor</label>
                <select className="input-field" value={editForm.floorId} onChange={(e) => {
                  const floorId = e.target.value;
                  setEditForm((f) => ({ ...f, floorId, shelfId: '' }));
                  setEditFormShelves([]);
                  if (floorId) {
                    shelvesApi.list({ floorId }).then((res) => {
                      setEditFormShelves(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
                    }).catch(() => setEditFormShelves([]));
                  }
                }}>
                  <option value="">— No Floor —</option>
                  {locations.map((loc: any) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`}
                    </option>
                  ))}
                </select>
              </div>
              {editForm.floorId && (
                <div className="form-group">
                  <label className="form-label">Receive Location — Shelf</label>
                  <select className="input-field" value={editForm.shelfId} onChange={(e) => setEditForm((f) => ({ ...f, shelfId: e.target.value }))}>
                    <option value="">— Select Shelf —</option>
                    {editFormShelves.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditingGrn(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


