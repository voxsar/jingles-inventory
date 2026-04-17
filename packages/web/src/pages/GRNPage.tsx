import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, skusApi, floorsApi, shelvesApi, variantsApi, batchesApi } from '../api/client';
import { GRNStatus } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';

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
  const [lineBatches, setLineBatches] = useState<Record<number, any[]>>({});
  const [nextBatchNumbers, setNextBatchNumbers] = useState<Record<number, string>>({});
  const [pricingCollapsed, setPricingCollapsed] = useState<Record<number, boolean>>({});
  const [showBulkPricing, setShowBulkPricing] = useState(false);
  const [bulkPricing, setBulkPricing] = useState({
    costPrice: '',
    sellingPrice: '',
    wholesalePrice: '',
    bulkPrice: '',
    marginType: '',
    marginValue: '',
  });
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
    lines: [{
      skuId: '',
      variantId: '',
      expectedQuantity: 1,
      batchId: '',
      createNewBatch: false,
      costPrice: '',
      sellingPrice: '',
      wholesalePrice: '',
      bulkPrice: '',
      marginType: '',
      marginValue: '',
      notes: '',
    }],
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
    if (!form.supplierId) {
      setSkus([]);
      return;
    }
    const params: Record<string, string> = { pageSize: '200', vendorId: form.supplierId };
    if (skuSearch) params.search = skuSearch;
    skusApi.list(params).then((res) => {
      setSkus(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    }).catch((err) => { console.error('Failed to load SKUs', err); });
  }, [showForm, skuSearch, form.supplierId]);

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
      // Transform form data to match backend API expectations
      const payload = {
        ...form,
        floorId: form.floorId || undefined,
        shelfId: form.shelfId || undefined,
        lines: form.lines.map(line => ({
          skuId: line.skuId,
          variantId: line.variantId || undefined,
          expectedQuantity: line.expectedQuantity,
          batchId: line.createNewBatch ? undefined : (line.batchId || undefined),
          createNewBatch: line.createNewBatch,
          costPrice: line.costPrice ? parseFloat(line.costPrice) : undefined,
          sellingPrice: line.sellingPrice ? parseFloat(line.sellingPrice) : undefined,
          wholesalePrice: line.wholesalePrice ? parseFloat(line.wholesalePrice) : undefined,
          bulkPrice: line.bulkPrice ? parseFloat(line.bulkPrice) : undefined,
          marginType: line.marginType || undefined,
          marginValue: line.marginValue ? parseFloat(line.marginValue) : undefined,
          notes: line.notes || undefined,
        })),
      };

      await grnsApi.create(payload);
      setShowForm(false);
      setForm({
        supplierId: '',
        invoiceReference: '',
        expectedDeliveryDate: getTodayString(),
        notes: '',
        floorId: '',
        shelfId: '',
        lines: [{
          skuId: '',
          variantId: '',
          expectedQuantity: 1,
          batchId: '',
          createNewBatch: false,
          costPrice: '',
          sellingPrice: '',
          wholesalePrice: '',
          bulkPrice: '',
          marginType: '',
          marginValue: '',
          notes: '',
        }],
      });
      setFormShelves([]);
      setLineVariants({});
      setLineBatches({});
      setNextBatchNumbers({});
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create GRN');
    }
  };

  const addLine = () => setForm((f) => ({
    ...f,
    lines: [...f.lines, {
      skuId: '',
      variantId: '',
      expectedQuantity: 1,
      batchId: '',
      createNewBatch: false,
      costPrice: '',
      sellingPrice: '',
      wholesalePrice: '',
      bulkPrice: '',
      marginType: '',
      marginValue: '',
      notes: '',
    }]
  }));

  const removeLine = (i: number) => {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
    setLineVariants(prev => { const n = { ...prev }; delete n[i]; return n; });
    setLineBatches(prev => { const n = { ...prev }; delete n[i]; return n; });
    setNextBatchNumbers(prev => { const n = { ...prev }; delete n[i]; return n; });
    setPricingCollapsed(prev => { const n = { ...prev }; delete n[i]; return n; });
  };

  const togglePricingCollapse = (i: number) => {
    setPricingCollapsed(prev => ({ ...prev, [i]: !prev[i] }));
  };

  const collapseAllPricing = () => {
    const collapsed: Record<number, boolean> = {};
    form.lines.forEach((_, i) => { collapsed[i] = true; });
    setPricingCollapsed(collapsed);
  };

  const expandAllPricing = () => {
    setPricingCollapsed({});
  };

  const applyBulkPricing = () => {
    setForm(f => ({
      ...f,
      lines: f.lines.map(line => ({
        ...line,
        costPrice: bulkPricing.costPrice || line.costPrice,
        sellingPrice: bulkPricing.sellingPrice || line.sellingPrice,
        wholesalePrice: bulkPricing.wholesalePrice || line.wholesalePrice,
        bulkPrice: bulkPricing.bulkPrice || line.bulkPrice,
        marginType: bulkPricing.marginType || line.marginType,
        marginValue: bulkPricing.marginValue || line.marginValue,
      }))
    }));
    setShowBulkPricing(false);
    setBulkPricing({
      costPrice: '',
      sellingPrice: '',
      wholesalePrice: '',
      bulkPrice: '',
      marginType: '',
      marginValue: '',
    });
  };

  const updateLine = (i: number, field: string, value: any) => {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

    if (field === 'skuId' && value) {
      // Load variants for this SKU
      variantsApi.list(value).then(res => {
        const variants = res.data?.data ?? [];
        setLineVariants(prev => ({ ...prev, [i]: variants }));
        setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, variantId: '' } : l) }));
      }).catch(() => setLineVariants(prev => ({ ...prev, [i]: [] })));

      // Load existing batches for this SKU
      batchesApi.list({ skuId: value, isActive: 'true' }).then(res => {
        const batches = res.data?.data?.items ?? res.data?.data ?? [];
        setLineBatches(prev => ({ ...prev, [i]: batches }));
      }).catch(() => setLineBatches(prev => ({ ...prev, [i]: [] })));

      // Generate next batch number preview
      batchesApi.list({ skuId: value }).then(res => {
        const batches = res.data?.data?.items ?? res.data?.data ?? [];
        const skuCode = skus.find(s => s.id === value)?.skuCode ?? 'SKU';
        const maxSeq = batches.length > 0 ? Math.max(...batches.map((b: any) => b.sequenceNumber ?? 0)) : 0;
        const nextSeq = maxSeq + 1;
        const nextBatchNum = `${skuCode}-B${String(nextSeq).padStart(3, '0')}`;
        setNextBatchNumbers(prev => ({ ...prev, [i]: nextBatchNum }));
      }).catch(() => {
        const skuCode = skus.find(s => s.id === value)?.skuCode ?? 'SKU';
        setNextBatchNumbers(prev => ({ ...prev, [i]: `${skuCode}-B001` }));
      });
    } else if (field === 'skuId' && !value) {
      setLineVariants(prev => { const n = { ...prev }; delete n[i]; return n; });
      setLineBatches(prev => { const n = { ...prev }; delete n[i]; return n; });
      setNextBatchNumbers(prev => { const n = { ...prev }; delete n[i]; return n; });
    } else if (field === 'variantId' && value) {
      // Reload batches filtered by variant
      const line = form.lines[i];
      if (line.skuId) {
        batchesApi.list({ skuId: line.skuId, variantId: value, isActive: 'true' }).then(res => {
          const batches = res.data?.data?.items ?? res.data?.data ?? [];
          setLineBatches(prev => ({ ...prev, [i]: batches }));
        }).catch(() => setLineBatches(prev => ({ ...prev, [i]: [] })));

        // Update next batch number for variant
        batchesApi.list({ skuId: line.skuId, variantId: value }).then(res => {
          const batches = res.data?.data?.items ?? res.data?.data ?? [];
          const variant = (lineVariants[i] ?? []).find(v => v.id === value);
          const variantCode = variant?.variantCode ?? 'VAR';
          const maxSeq = batches.length > 0 ? Math.max(...batches.map((b: any) => b.sequenceNumber ?? 0)) : 0;
          const nextSeq = maxSeq + 1;
          const nextBatchNum = `${variantCode}-B${String(nextSeq).padStart(3, '0')}`;
          setNextBatchNumbers(prev => ({ ...prev, [i]: nextBatchNum }));
        }).catch(() => {
          const variant = (lineVariants[i] ?? []).find(v => v.id === value);
          const variantCode = variant?.variantCode ?? 'VAR';
          setNextBatchNumbers(prev => ({ ...prev, [i]: `${variantCode}-B001` }));
        });
      }
    } else if (field === 'batchId' && value && !form.lines[i].createNewBatch) {
      // Pre-fill pricing from selected batch
      const batch = (lineBatches[i] ?? []).find((b: any) => b.id === value);
      if (batch) {
        setForm(f => ({
          ...f,
          lines: f.lines.map((l, idx) => idx === i ? {
            ...l,
            costPrice: batch.costPrice?.toString() ?? '',
            sellingPrice: batch.sellingPrice?.toString() ?? '',
            wholesalePrice: batch.wholesalePrice?.toString() ?? '',
            bulkPrice: batch.bulkPrice?.toString() ?? '',
            marginType: batch.marginType ?? '',
            marginValue: batch.marginValue?.toString() ?? '',
          } : l)
        }));
        // Auto-collapse pricing panel when existing batch is selected
        setPricingCollapsed(prev => ({ ...prev, [i]: true }));
      }
    } else if (field === 'batchId' && !value) {
      // Expand pricing when batch is deselected
      setPricingCollapsed(prev => ({ ...prev, [i]: false }));
    } else if (field === 'createNewBatch') {
      // Clear batchId when switching to create new batch
      if (value) {
        setForm(f => ({
          ...f,
          lines: f.lines.map((l, idx) => idx === i ? { ...l, batchId: '' } : l)
        }));
        // Expand pricing panel when creating new batch
        setPricingCollapsed(prev => ({ ...prev, [i]: false }));
      }
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
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Statuses' },
                ...Object.values(GRNStatus).map((s) => ({ value: s, label: s }))
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
                          lines: [{
                            skuId: '', variantId: '', expectedQuantity: 1, batchId: '',
                            createNewBatch: false, costPrice: '', sellingPrice: '',
                            wholesalePrice: '', bulkPrice: '', marginType: '', marginValue: '', notes: '',
                          }],
                        }));
                        setSkuSearch('');
                        setLineVariants({});
                        setLineBatches({});
                        setNextBatchNumbers({});
                        setPricingCollapsed({});
                      }}
                      placeholder="Select supplier"
                      isClearable={false}
                    />
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
                    <label className="form-label">Receive Location — Shelf</label>
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
                      onChange={(e) => handleSkuSearchChange(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    {form.lines.map((line, i) => (
                      <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        {/* Product Selection Row */}
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
                          <div style={{ width: '100px' }}>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Quantity *</label>
                            <input
                              type="number"
                              className="input-field"
                              value={line.expectedQuantity}
                              placeholder="Qty"
                              min="1"
                              onChange={(e) => updateLine(i, 'expectedQuantity', parseInt(e.target.value))}
                              required
                            />
                          </div>
                          {form.lines.length > 1 && (
                            <button type="button" className="btn-icon text-red-500 mt-6" onClick={() => removeLine(i)}>✕</button>
                          )}
                        </div>

                        {/* Variant Selection (if available) */}
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

                        {/* Batch Selection */}
                        {line.skuId && (
                          <div className="mb-3 p-3 bg-white rounded border border-gray-200">
                            <div className="flex items-center gap-3 mb-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`batch-mode-${i}`}
                                  checked={!line.createNewBatch}
                                  onChange={() => updateLine(i, 'createNewBatch', false)}
                                />
                                <span className="text-sm font-medium">Use Existing Batch</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`batch-mode-${i}`}
                                  checked={line.createNewBatch}
                                  onChange={() => updateLine(i, 'createNewBatch', true)}
                                />
                                <span className="text-sm font-medium">Create New Batch</span>
                              </label>
                            </div>

                            {!line.createNewBatch ? (
                              <div>
                                <SearchableSelect
                                  options={[
                                    { value: '', label: '— Select Batch (optional) —' },
                                    ...(lineBatches[i] ?? []).map((b: any) => ({
                                      value: b.id,
                                      label: `${b.batchNumber}${b.costPrice ? ` — Cost: ${b.costPrice}` : ''}`
                                    }))
                                  ]}
                                  value={line.batchId}
                                  onChange={(value) => updateLine(i, 'batchId', value)}
                                  placeholder="Select Batch (optional)"
                                  isClearable={false}
                                />
                                {line.batchId && pricingCollapsed[i] && (
                                  <button
                                    type="button"
                                    className="text-xs text-blue-600 hover:text-blue-800 mt-2"
                                    onClick={() => togglePricingCollapse(i)}
                                  >
                                    👁️ Show Pricing
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded border border-blue-200">
                                📦 New batch will be created: <span className="font-mono font-semibold">{nextBatchNumbers[i] ?? '...'}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Pricing Fields (collapsible) */}
                        {line.skuId && (line.createNewBatch || line.batchId) && !pricingCollapsed[i] && (
                          <div className="border-t pt-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-semibold text-gray-700">💰 Batch Pricing</div>
                              {line.batchId && (
                                <button
                                  type="button"
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                  onClick={() => togglePricingCollapse(i)}
                                >
                                  ▲ Collapse
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Cost Price</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input-field"
                                  value={line.costPrice}
                                  placeholder="0.00"
                                  onChange={(e) => updateLine(i, 'costPrice', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Selling Price</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input-field"
                                  value={line.sellingPrice}
                                  placeholder="0.00"
                                  onChange={(e) => updateLine(i, 'sellingPrice', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Wholesale Price</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input-field"
                                  value={line.wholesalePrice}
                                  placeholder="0.00"
                                  onChange={(e) => updateLine(i, 'wholesalePrice', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Bulk Price</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input-field"
                                  value={line.bulkPrice}
                                  placeholder="0.00"
                                  onChange={(e) => updateLine(i, 'bulkPrice', e.target.value)}
                                />
                              </div>
                            </div>

                            {/* Margin Settings */}
                            <div className="bg-purple-50 border border-purple-200 rounded p-3">
                              <div className="text-xs font-semibold text-purple-700 mb-2">🧮 Margin Calculator</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">Margin Type</label>
                                  <SearchableSelect
                                    options={[
                                      { value: '', label: 'None' },
                                      { value: 'fixed', label: 'Fixed Amount' },
                                      { value: 'percentage', label: 'Percentage (%)' }
                                    ]}
                                    value={line.marginType}
                                    onChange={(value) => updateLine(i, 'marginType', value)}
                                    placeholder="None"
                                    isClearable={false}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">Margin Value</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="input-field text-sm"
                                    value={line.marginValue}
                                    placeholder={line.marginType === 'percentage' ? '25' : '50.00'}
                                    onChange={(e) => updateLine(i, 'marginValue', e.target.value)}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Shortcuts - positioned below line items for better UX */}
                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
                    {form.lines.length > 1 && (
                      <>
                        <button type="button" className="btn-sm text-xs" onClick={collapseAllPricing}>▼ Collapse All</button>
                        <button type="button" className="btn-sm text-xs" onClick={expandAllPricing}>▲ Expand All</button>
                        <button type="button" className="btn-sm text-xs" onClick={() => setShowBulkPricing(true)}>💰 Bulk Pricing</button>
                      </>
                    )}
                    <button type="button" className="btn-sm" onClick={addLine}>+ Add Line</button>
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
                  <label className="form-label">Receive Location — Shelf</label>
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
              <button type="button" className="btn-secondary" onClick={() => setEditingGrn(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Pricing Modal */}
      {showBulkPricing && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowBulkPricing(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">💰 Apply Bulk Pricing to All Lines</h2>
              <button className="modal-close" onClick={() => setShowBulkPricing(false)}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <p className="text-sm text-gray-600 mb-4">
                Set pricing for all {form.lines.length} line items at once. Leave fields empty to keep existing values.
              </p>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Cost Price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={bulkPricing.costPrice}
                    placeholder="Leave empty to skip"
                    onChange={(e) => setBulkPricing(p => ({ ...p, costPrice: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={bulkPricing.sellingPrice}
                    placeholder="Leave empty to skip"
                    onChange={(e) => setBulkPricing(p => ({ ...p, sellingPrice: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Wholesale Price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={bulkPricing.wholesalePrice}
                    placeholder="Leave empty to skip"
                    onChange={(e) => setBulkPricing(p => ({ ...p, wholesalePrice: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Bulk Price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={bulkPricing.bulkPrice}
                    placeholder="Leave empty to skip"
                    onChange={(e) => setBulkPricing(p => ({ ...p, bulkPrice: e.target.value }))}
                  />
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Margin Settings</h3>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Margin Type</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: 'Leave empty to skip' },
                        { value: 'fixed', label: 'Fixed Amount' },
                        { value: 'percentage', label: 'Percentage (%)' }
                      ]}
                      value={bulkPricing.marginType}
                      onChange={(value) => setBulkPricing(p => ({ ...p, marginType: value }))}
                      placeholder="Leave empty to skip"
                      isClearable={false}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Margin Value</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={bulkPricing.marginValue}
                      placeholder={bulkPricing.marginType === 'percentage' ? 'e.g., 25' : 'e.g., 50.00'}
                      onChange={(e) => setBulkPricing(p => ({ ...p, marginValue: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowBulkPricing(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={applyBulkPricing}>
                Apply to {form.lines.length} Lines
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


