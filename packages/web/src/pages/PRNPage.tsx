import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { prnsApi, vendorsApi, skusApi, floorsApi, shelvesApi, variantsApi, batchesApi } from '../api/client';
import { PRNStatus } from '@jingles/shared/enums';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';
import { UiBadge, UiText } from '../components/UiPrimitives';

const STATUS_TONES: Record<string, string> = {
  [PRNStatus.Draft]: '',
  [PRNStatus.Submitted]: 'info',
  [PRNStatus.PickedUp]: 'success',
  [PRNStatus.Closed]: '',
};

const PAGE_SIZE = 20;

type LineDraft = {
  skuId: string;
  variantId: string;
  batchId: string;
  returnQuantity: number;
  notes: string;
};

const emptyLine = (): LineDraft => ({
  skuId: '',
  variantId: '',
  batchId: '',
  returnQuantity: 1,
  notes: '',
});

const getTodayString = () => new Date().toISOString().split('T')[0];

const initialForm = () => ({
  supplierId: '',
  inspectionRecordId: '',
  returnReason: '',
  expectedPickupDate: getTodayString(),
  notes: '',
  floorId: '',
  shelfId: '',
  lines: [emptyLine()],
});

export default function PRNPage() {
  const [prns, setPrns] = useState<any[]>([]);
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
  const [branchFilter, setBranchFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [editingPrn, setEditingPrn] = useState<any>(null);
  const [editForm, setEditForm] = useState({ supplierId: '', returnReason: '', expectedPickupDate: '', notes: '', floorId: '', shelfId: '' });
  const [locations, setLocations] = useState<any[]>([]);
  const [formShelves, setFormShelves] = useState<any[]>([]);
  const [editFormShelves, setEditFormShelves] = useState<any[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [lineVariants, setLineVariants] = useState<Record<number, any[]>>({});
  const [lineBatches, setLineBatches] = useState<Record<number, any[]>>({});
  const [form, setForm] = useState(initialForm);
  const [prefillBanner, setPrefillBanner] = useState<string>('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const prefillHandledRef = useRef(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      if (branchFilter) params.branchId = branchFilter;
      if (floorFilter) params.floorId = floorFilter;
      if (fromDateFilter) params.fromDate = fromDateFilter;
      if (toDateFilter) params.toDate = toDateFilter;
      const [prnRes, vendorRes, locationRes] = await Promise.all([
        prnsApi.list(params),
        vendorsApi.list(),
        floorsApi.list(),
      ]);
      const prnData = prnRes.data?.data?.items ?? prnRes.data?.data ?? prnRes.data ?? [];
      setPrns(Array.isArray(prnData) ? prnData : []);
      setTotal(prnRes.data?.data?.total ?? 0);
      setTotalPages(prnRes.data?.data?.totalPages ?? 1);
      setVendors(vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? []);
      setLocations(locationRes.data?.data?.items ?? locationRes.data?.data ?? locationRes.data ?? []);
    } catch (err) {
      console.error('Failed to load PRN data', err);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, [page, pageSize, debouncedSearch, statusFilter, supplierFilter, branchFilter, floorFilter, fromDateFilter, toDateFilter]);

  // Load SKUs when supplier set / search changes
  useEffect(() => {
    if (!showForm) return;
    if (!form.supplierId) { setSkus([]); return; }
    const params: Record<string, string> = { pageSize: '200', vendorId: form.supplierId };
    if (skuSearch) params.search = skuSearch;
    skusApi.list(params).then((res) => {
      setSkus(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    }).catch((err) => { console.error('Failed to load SKUs', err); });
  }, [showForm, skuSearch, form.supplierId]);

  // Handle prefill from "Return Damaged Items" GRN flow
  useEffect(() => {
    const state = location.state as any;
    if (!state?.prefill || prefillHandledRef.current) return;
    prefillHandledRef.current = true;
    const p = state.prefill;
    const prefilledLines: LineDraft[] = (p.lines ?? []).map((l: any) => ({
      skuId: l.skuId ?? '',
      variantId: l.variantId ?? '',
      batchId: l.batchId ?? '',
      returnQuantity: l.returnQuantity ?? 1,
      notes: l.notes ?? '',
    }));
    setForm({
      supplierId: p.supplierId ?? '',
      inspectionRecordId: p.inspectionRecordId ?? '',
      returnReason: p.returnReason ?? '',
      expectedPickupDate: getTodayString(),
      notes: p.notes ?? '',
      floorId: p.floorId ?? '',
      shelfId: p.shelfId ?? '',
      lines: prefilledLines.length > 0 ? prefilledLines : [emptyLine()],
    });
    if (p.floorId) {
      shelvesApi.list({ floorId: p.floorId }).then((res) => {
        setFormShelves(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
      }).catch(() => setFormShelves([]));
    }
    // Pre-load variants/batches for each prefilled line
    prefilledLines.forEach((line, idx) => {
      if (!line.skuId) return;
      variantsApi.list(line.skuId).then(res => {
        const variants = res.data?.data ?? [];
        setLineVariants(prev => ({ ...prev, [idx]: variants }));
      }).catch(() => {});
      const batchParams: Record<string, string> = { skuId: line.skuId, isActive: 'true' };
      if (line.variantId) batchParams.variantId = line.variantId;
      batchesApi.list(batchParams).then(res => {
        const batches = res.data?.data?.items ?? res.data?.data ?? [];
        setLineBatches(prev => ({ ...prev, [idx]: batches }));
      }).catch(() => {});
    });
    setShowForm(true);
    setPrefillBanner(p.banner ?? '');
    // Clear router state so a refresh doesn't re-prefill
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  const resetForm = () => {
    setForm(initialForm());
    setFormShelves([]);
    setLineVariants({});
    setLineBatches({});
    setPrefillBanner('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        supplierId: form.supplierId,
        inspectionRecordId: form.inspectionRecordId || undefined,
        returnReason: form.returnReason || undefined,
        expectedPickupDate: form.expectedPickupDate || undefined,
        notes: form.notes || undefined,
        floorId: form.floorId || undefined,
        shelfId: form.shelfId || undefined,
        lines: form.lines.map(line => ({
          skuId: line.skuId,
          variantId: line.variantId || undefined,
          batchId: line.batchId || undefined,
          returnQuantity: line.returnQuantity,
          notes: line.notes || undefined,
        })),
      };

      await prnsApi.create(payload);
      setShowForm(false);
      resetForm();
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create PRN');
    }
  };

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));

  const removeLine = (i: number) => {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
    setLineVariants(prev => { const n = { ...prev }; delete n[i]; return n; });
    setLineBatches(prev => { const n = { ...prev }; delete n[i]; return n; });
  };

  const updateLine = (i: number, field: keyof LineDraft, value: any) => {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

    if (field === 'skuId' && value) {
      variantsApi.list(value).then(res => {
        const variants = res.data?.data ?? [];
        setLineVariants(prev => ({ ...prev, [i]: variants }));
        setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, variantId: '', batchId: '' } : l) }));
      }).catch(() => setLineVariants(prev => ({ ...prev, [i]: [] })));

      batchesApi.list({ skuId: value, isActive: 'true' }).then(res => {
        const batches = res.data?.data?.items ?? res.data?.data ?? [];
        setLineBatches(prev => ({ ...prev, [i]: batches }));
      }).catch(() => setLineBatches(prev => ({ ...prev, [i]: [] })));
    } else if (field === 'skuId' && !value) {
      setLineVariants(prev => { const n = { ...prev }; delete n[i]; return n; });
      setLineBatches(prev => { const n = { ...prev }; delete n[i]; return n; });
    } else if (field === 'variantId') {
      const line = form.lines[i];
      if (!line.skuId) return;
      const params: Record<string, string> = { skuId: line.skuId, isActive: 'true' };
      if (value) params.variantId = value;
      batchesApi.list(params).then(res => {
        const batches = res.data?.data?.items ?? res.data?.data ?? [];
        setLineBatches(prev => ({ ...prev, [i]: batches }));
        setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, batchId: '' } : l) }));
      }).catch(() => setLineBatches(prev => ({ ...prev, [i]: [] })));
    }
  };

  const openEdit = (prn: any) => {
    setEditingPrn(prn);
    setEditForm({
      supplierId: prn.supplierId ?? '',
      returnReason: prn.returnReason ?? '',
      expectedPickupDate: prn.expectedPickupDate ? prn.expectedPickupDate.split('T')[0] : getTodayString(),
      notes: prn.notes ?? '',
      floorId: prn.floorId ?? '',
      shelfId: prn.shelfId ?? '',
    });
    if (prn.floorId) {
      shelvesApi.list({ floorId: prn.floorId }).then((res) => {
        setEditFormShelves(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
      }).catch(() => setEditFormShelves([]));
    } else {
      setEditFormShelves([]);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPrn) return;
    setIsSavingEdit(true);
    try {
      await prnsApi.update(editingPrn.id, editForm);
      setEditingPrn(null);
      setEditFormShelves([]);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update PRN');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const columns = [
    { key: 'id', header: 'PRN ID', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.id.slice(0, 8)}…</span> },
    { key: 'supplier', header: 'Supplier', sortable: true, render: (r: any) => r.supplier?.name },
    { key: 'returnReason', header: 'Return Reason', render: (r: any) => r.returnReason ?? <UiText>—</UiText> },
    { key: 'floor', header: 'Location', render: (r: any) => {
      if (!r.floor) return <UiText>—</UiText>;
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
        return tone ? <UiBadge tone={tone}>{r.status}</UiBadge> : <UiBadge>{r.status}</UiBadge>;
      }
    },
    { key: 'linesCount', header: 'Lines', align: 'right' as const, render: (r: any) => <span style={{ fontWeight: 600 }}>{r.lines?.length ?? 0}</span> },
    { key: 'createdAt', header: 'Created', sortable: true, render: (r: any) => <UiText>{new Date(r.createdAt).toLocaleDateString()}</UiText> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status === PRNStatus.Draft && (
            <button className="btn-sm" onClick={() => openEdit(r)}>Edit</button>
          )}
          <button className="btn-sm" onClick={() => navigate(`/prns/${r.id}`)}>View</button>
        </div>
      ),
    },
  ];

  const branchOptions = Array.from(
    new Map(
      locations
        .filter((loc: any) => loc.branch?.id)
        .map((loc: any) => [loc.branch.id, { value: loc.branch.id, label: loc.branch.name }])
    ).values()
  );

  const visibleLocations = branchFilter
    ? locations.filter((loc: any) => loc.branchId === branchFilter || loc.branch?.id === branchFilter)
    : locations;

  const hasFilters = searchTerm || statusFilter || supplierFilter || branchFilter || floorFilter || fromDateFilter || toDateFilter;

  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">↩️ Purchase Return Notes</h1>
          <p className="page-subtitle">{total.toLocaleString()} PRNs total</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ New PRN</button>
      </div>

      <div className="content-section">
        <div className="filter-bar">
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search return reason, supplier…"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Statuses' },
                ...Object.values(PRNStatus).map((s) => ({ value: s, label: s }))
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
                { value: '', label: 'All Suppliers' },
                ...vendors.map((v: any) => ({ value: v.id, label: v.name }))
              ]}
              value={supplierFilter}
              onChange={(value) => { setSupplierFilter(value); setPage(1); }}
              placeholder="All Suppliers"
              isClearable={false}
            />
          </div>
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Branches' },
                ...branchOptions,
              ]}
              value={branchFilter}
              onChange={(value) => { setBranchFilter(value); setFloorFilter(''); setPage(1); }}
              placeholder="All Branches"
              isClearable={false}
            />
          </div>
          <div style={{ width: '200px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Floors' },
                ...visibleLocations.map((loc: any) => ({ value: loc.id, label: loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : loc.name }))
              ]}
              value={floorFilter}
              onChange={(value) => { setFloorFilter(value); setPage(1); }}
              placeholder="All Floors"
              isClearable={false}
            />
          </div>
          <input
            type="date"
            className="filter-select"
            value={fromDateFilter}
            onChange={(e) => { setFromDateFilter(e.target.value); setPage(1); }}
            title="Created from"
          />
          <input
            type="date"
            className="filter-select"
            value={toDateFilter}
            onChange={(e) => { setToDateFilter(e.target.value); setPage(1); }}
            title="Created to"
          />
          {hasFilters && (
            <button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setStatusFilter(''); setSupplierFilter(''); setBranchFilter(''); setFloorFilter(''); setFromDateFilter(''); setToDateFilter(''); setPage(1); }}>
              ✕ Clear filters
            </button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={prns}
          isLoading={isLoading}
          emptyMessage="No PRNs found"
          emptyIcon="↩️"
          onRowClick={(row) => navigate(`/prns/${row.id}`)}
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

      {/* Create PRN Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel-lg">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create New PRN</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); resetForm(); }}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body form-stack">
                {prefillBanner && (
                  <div className="p-3 mb-1 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    {prefillBanner}
                  </div>
                )}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Supplier *</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: 'Select supplier' },
                        ...vendors.map((v: any) => ({ value: v.id, label: v.name }))
                      ]}
                      value={form.supplierId}
                      onChange={(value) => {
                        setForm((f) => ({
                          ...f,
                          supplierId: value,
                          lines: [emptyLine()],
                        }));
                        setSkuSearch('');
                        setLineVariants({});
                        setLineBatches({});
                      }}
                      placeholder="Select supplier"
                      isClearable={false}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Return Reason</label>
                    <input className="input-field" type="text" value={form.returnReason} placeholder="e.g. Damaged on arrival" onChange={(e) => setForm((f) => ({ ...f, returnReason: e.target.value }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Expected Pickup Date</label>
                    <input className="input-field" type="date" value={form.expectedPickupDate} onChange={(e) => setForm((f) => ({ ...f, expectedPickupDate: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input className="input-field" type="text" value={form.notes} placeholder="Optional notes…" onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Return Location — Floor</label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '— No Floor —' },
                      ...locations.map((loc: any) => ({
                        value: loc.id,
                        label: loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`
                      }))
                    ]}
                    value={form.floorId}
                    onChange={(value) => {
                      const floorId = value;
                      setForm((f) => ({ ...f, floorId, shelfId: '' }));
                      setFormShelves([]);
                      if (floorId) {
                        shelvesApi.list({ floorId }).then((res) => {
                          setFormShelves(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
                        }).catch(() => setFormShelves([]));
                      }
                    }}
                    placeholder="No Floor"
                    isClearable={false}
                  />
                </div>
                {form.floorId && (
                  <div className="form-group">
                    <label className="form-label">Return Location — Shelf</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— Select Shelf —' },
                        ...formShelves.map((s: any) => ({
                          value: s.id,
                          label: `${s.name} (${s.code})`
                        }))
                      ]}
                      value={form.shelfId}
                      onChange={(value) => setForm((f) => ({ ...f, shelfId: value }))}
                      placeholder="Select Shelf"
                      isClearable={false}
                    />
                  </div>
                )}

                {/* Line items */}
                <div>
                  {!form.supplierId && (
                    <div className="p-3 mb-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      Please select a supplier first to load available products.
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Line Items</span>
                  </div>
                  <div className="mb-3">
                    <input
                      type="search"
                      className="input-field"
                      placeholder="Filter products by name or code…"
                      value={skuSearch}
                      onChange={(e) => setSkuSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    {form.lines.map((line, i) => (
                      <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex gap-2 items-start mb-3">
                          <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Product *</label>
                            <SearchableSelect
                              options={[
                                { value: '', label: 'Select product' },
                                ...skus.map((s: any) => ({ value: s.id, label: `${s.skuCode} – ${s.name}` }))
                              ]}
                              value={line.skuId}
                              onChange={(value) => updateLine(i, 'skuId', value)}
                              placeholder="Select product"
                              isClearable={false}
                            />
                          </div>
                          <div style={{ width: '120px' }}>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Return Qty *</label>
                            <input
                              type="number"
                              className="input-field"
                              value={line.returnQuantity}
                              placeholder="Qty"
                              min="1"
                              onChange={(e) => updateLine(i, 'returnQuantity', parseInt(e.target.value) || 0)}
                              required
                            />
                          </div>
                          {form.lines.length > 1 && (
                            <button type="button" className="btn-icon text-red-500 mt-6" onClick={() => removeLine(i)}>✕</button>
                          )}
                        </div>

                        {line.skuId && (lineVariants[i] ?? []).length > 0 && (
                          <div className="mb-3">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Variant</label>
                            <SearchableSelect
                              options={[
                                { value: '', label: '— No Variant (base SKU) —' },
                                ...(lineVariants[i] ?? []).map((v: any) => ({
                                  value: v.id,
                                  label: `${v.name} (${v.variantCode})`
                                }))
                              ]}
                              value={line.variantId}
                              onChange={(value) => updateLine(i, 'variantId', value)}
                              placeholder="No Variant"
                              isClearable={false}
                            />
                          </div>
                        )}

                        {line.skuId && (
                          <div className="mb-3">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Batch (optional)</label>
                            <SearchableSelect
                              options={[
                                { value: '', label: '— Any Batch —' },
                                ...(lineBatches[i] ?? []).map((b: any) => ({
                                  value: b.id,
                                  label: b.batchNumber
                                }))
                              ]}
                              value={line.batchId}
                              onChange={(value) => updateLine(i, 'batchId', value)}
                              placeholder="Any Batch"
                              isClearable={false}
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-medium text-gray-600 block mb-1">Line Notes</label>
                          <input
                            type="text"
                            className="input-field"
                            value={line.notes}
                            placeholder="Optional line notes…"
                            onChange={(e) => updateLine(i, 'notes', e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
                    <button type="button" className="btn-sm" onClick={addLine}>+ Add Line</button>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn-primary">Create PRN</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit PRN Modal */}
      {editingPrn && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingPrn(null)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Edit PRN</h2>
                <span className="text-xs text-gray-400 font-mono">{editingPrn.id.slice(0, 8)}…</span>
              </div>
              <button className="modal-close" onClick={() => setEditingPrn(null)}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <SearchableSelect
                  options={[
                    { value: '', label: 'Select supplier' },
                    ...vendors.map((v: any) => ({ value: v.id, label: v.name }))
                  ]}
                  value={editForm.supplierId}
                  onChange={(value) => setEditForm((f) => ({ ...f, supplierId: value }))}
                  placeholder="Select supplier"
                  isClearable={false}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Return Reason</label>
                <input className="input-field" type="text" value={editForm.returnReason} onChange={(e) => setEditForm((f) => ({ ...f, returnReason: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Pickup Date</label>
                <input className="input-field" type="date" value={editForm.expectedPickupDate} onChange={(e) => setEditForm((f) => ({ ...f, expectedPickupDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="input-field" type="text" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Return Location — Floor</label>
                <SearchableSelect
                  options={[
                    { value: '', label: '— No Floor —' },
                    ...locations.map((loc: any) => ({
                      value: loc.id,
                      label: loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`
                    }))
                  ]}
                  value={editForm.floorId}
                  onChange={(value) => {
                    const floorId = value;
                    setEditForm((f) => ({ ...f, floorId, shelfId: '' }));
                    setEditFormShelves([]);
                    if (floorId) {
                      shelvesApi.list({ floorId }).then((res) => {
                        setEditFormShelves(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
                      }).catch(() => setEditFormShelves([]));
                    }
                  }}
                  placeholder="No Floor"
                  isClearable={false}
                />
              </div>
              {editForm.floorId && (
                <div className="form-group">
                  <label className="form-label">Return Location — Shelf</label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '— Select Shelf —' },
                      ...editFormShelves.map((s: any) => ({
                        value: s.id,
                        label: `${s.name} (${s.code})`
                      }))
                    ]}
                    value={editForm.shelfId}
                    onChange={(value) => setEditForm((f) => ({ ...f, shelfId: value }))}
                    placeholder="Select Shelf"
                    isClearable={false}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditingPrn(null)}>Cancel</button>
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
