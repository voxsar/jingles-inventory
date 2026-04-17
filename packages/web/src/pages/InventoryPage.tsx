import { useEffect, useRef, useState } from 'react';
import { inventoryApi, floorsApi, branchesApi, skusApi, variantsApi, shelvesApi, boxesApi, racksApi, batchesApi } from '../api/client';
import { InventoryState, ALLOWED_TRANSITIONS } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import StateBadge from '../components/StateBadge';
import BarcodeInput from '../components/BarcodeInput';
import SearchableSelect from '../components/SearchableSelect';

const PAGE_SIZE = 20;

const defaultNewForm = { skuId: '', variantId: '', floorId: '', shelfId: '', boxId: '', quantity: '1', state: InventoryState.Uninspected as string, batchId: '' };
const defaultEditForm = { floorId: '', shelfId: '', boxId: '', quantity: '1', batchId: '' };
const defaultTransitionForm = { toState: '', reason: '' };

const QTY_SHORTCUTS = [
  { label: '-10', delta: -10, cls: 'bg-red-600 hover:bg-red-700' },
  { label: '-1',  delta:  -1, cls: 'bg-red-400 hover:bg-red-500' },
  { label: '+1',  delta:   1, cls: 'bg-green-500 hover:bg-green-600' },
  { label: '+10', delta:  10, cls: 'bg-green-600 hover:bg-green-700' },
  { label: '+20', delta:  20, cls: 'bg-blue-500 hover:bg-blue-600' },
  { label: '+100', delta: 100, cls: 'bg-blue-600 hover:bg-blue-700' },
  { label: '+500', delta: 500, cls: 'bg-indigo-600 hover:bg-indigo-700' },
] as const;

function applyQtyDelta(current: string, delta: number): string {
  return String(Math.max(1, (parseInt(current) || 0) + delta));
}

export default function InventoryPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [rackFilter, setRackFilter] = useState('');
  const [shelfFilter, setShelfFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [locations, setLocations] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [filterRacks, setFilterRacks] = useState<any[]>([]);
  const [filterShelves, setFilterShelves] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  // Shelves and boxes for new-record form (cascade: floor → shelf → box)
  const [newFormShelves, setNewFormShelves] = useState<any[]>([]);
  const [newFormBoxes, setNewFormBoxes] = useState<any[]>([]);
  // Shelves and boxes for edit form (cascade: floor → shelf → box)
  const [editFormShelves, setEditFormShelves] = useState<any[]>([]);
  const [editFormBoxes, setEditFormBoxes] = useState<any[]>([]);
  // Batches for new and edit forms
  const [newFormBatches, setNewFormBatches] = useState<any[]>([]);
  const [editFormBatches, setEditFormBatches] = useState<any[]>([]);
  const [barcodeScanResult, setBarcodeScanResult] = useState<any>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [transitionRecord, setTransitionRecord] = useState<any>(null);
  const [transitionForm, setTransitionForm] = useState(defaultTransitionForm);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState(defaultNewForm);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [isSaving, setIsSaving] = useState(false);
  const [skuVariants, setSkuVariants] = useState<any[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInventory = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (stateFilter) params.state = stateFilter;
      if (shelfFilter) params.shelfId = shelfFilter;
      else if (rackFilter) params.rackId = rackFilter;
      else if (locationFilter) params.floorId = locationFilter;
      else if (branchFilter) params.branchId = branchFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await inventoryApi.list(params);
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setRecords(Array.isArray(data) ? data : []);
      setTotal(res.data?.data?.total ?? 0);
      setTotalPages(res.data?.data?.totalPages ?? 1);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await floorsApi.list();
      setLocations(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    } catch { /* ignore */ }
  };

  const fetchBranches = async () => {
    try {
      const res = await branchesApi.list();
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setBranches(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const fetchSkus = async () => {
    try {
      const res = await skusApi.list({ pageSize: '200' });
      setSkus(res.data?.data?.items ?? []);
    } catch { /* ignore */ }
  };

  const fetchShelves = async (floorId: string, setter: (s: any[]) => void) => {
    if (!floorId) { setter([]); return; }
    try {
      const res = await shelvesApi.list({ floorId });
      setter(Array.isArray(res.data) ? res.data : []);
    } catch { setter([]); }
  };

  const fetchBoxes = async (opts: { shelfId?: string; floorId?: string }, setter: (b: any[]) => void) => {
    const params: Record<string, string> = {};
    if (opts.shelfId) params.shelfId = opts.shelfId;
    else if (opts.floorId) params.floorId = opts.floorId;
    else { setter([]); return; }
    try {
      const res = await boxesApi.list(params);
      setter(Array.isArray(res.data) ? res.data : []);
    } catch { setter([]); }
  };

  useEffect(() => { fetchLocations(); fetchSkus(); fetchBranches(); }, []);
  useEffect(() => { fetchInventory(); }, [page, pageSize, stateFilter, branchFilter, locationFilter, rackFilter, shelfFilter, debouncedSearch]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  const openTransition = (record: any) => {
    const currentState = record.state as InventoryState;
    const allowedNext = ALLOWED_TRANSITIONS[currentState] ?? [];
    const firstNext = allowedNext.length > 0 ? allowedNext[0] : '';
    setTransitionRecord(record);
    setTransitionForm({ toState: firstNext, reason: '' });
  };

  const handleTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionRecord || !transitionForm.toState) return;
    setTransitioning(transitionRecord.id);
    try {
      await inventoryApi.transition(transitionRecord.id, transitionForm.toState, transitionForm.reason || undefined);
      setTransitionRecord(null);
      setTransitionForm(defaultTransitionForm);
      await fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Transition failed');
    } finally {
      setTransitioning(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(newForm.quantity);
    if (isNaN(qty) || qty < 1) { alert('Quantity must be a positive number'); return; }
    setIsSaving(true);
    try {
      await inventoryApi.create({
        skuId: newForm.skuId,
        variantId: newForm.variantId || undefined,
        floorId: newForm.floorId || undefined,
        shelfId: newForm.shelfId || undefined,
        boxId: newForm.boxId || undefined,
        quantity: qty,
        state: newForm.state,
        batchId: newForm.batchId || undefined,
      });
      closeNewForm();
      await fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create record');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewFormSkuChange = async (skuId: string) => {
    setNewForm(f => ({ ...f, skuId, variantId: '', batchId: '' }));
    if (skuId) {
      try {
        const [variantsRes, batchesRes] = await Promise.all([
          variantsApi.list(skuId),
          batchesApi.list({ skuId, isActive: 'true' })
        ]);
        setSkuVariants(variantsRes.data?.data ?? []);
        const batchData = batchesRes.data?.data?.items ?? batchesRes.data?.data ?? batchesRes.data ?? [];
        setNewFormBatches(Array.isArray(batchData) ? batchData : []);
      } catch {
        setSkuVariants([]);
        setNewFormBatches([]);
      }
    } else {
      setSkuVariants([]);
      setNewFormBatches([]);
    }
  };

  const closeNewForm = () => {
    setShowNewForm(false);
    setNewForm(defaultNewForm);
    setSkuVariants([]);
    setNewFormShelves([]);
    setNewFormBoxes([]);
    setNewFormBatches([]);
  };

  const closeEditForm = () => {
    setEditingRecord(null);
    setEditFormShelves([]);
    setEditFormBoxes([]);
    setEditFormBatches([]);
  };

  const openEdit = (record: any) => {
    const floorId = record.floorId ?? '';
    const shelfId = record.shelfId ?? '';
    const boxId = record.boxId ?? '';
    setEditForm({
      floorId,
      shelfId,
      boxId,
      quantity: String(record.quantity),
      batchId: record.batchId ?? '',
    });
    setEditingRecord(record);
    // Pre-load cascading dropdowns
    if (floorId) {
      fetchShelves(floorId, setEditFormShelves);
      if (shelfId) fetchBoxes({ shelfId }, setEditFormBoxes);
      else fetchBoxes({ floorId }, setEditFormBoxes);
    }
    // Pre-load batches for the SKU
    if (record.skuId) {
      const params: Record<string, string> = { skuId: record.skuId, isActive: 'true' };
      if (record.variantId) params.variantId = record.variantId;
      batchesApi.list(params).then((res) => {
        const batchData = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
        setEditFormBatches(Array.isArray(batchData) ? batchData : []);
      }).catch(() => setEditFormBatches([]));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const qty = parseInt(editForm.quantity);
    if (isNaN(qty) || qty < 1) { alert('Quantity must be a positive number'); return; }
    setIsSaving(true);
    try {
      await inventoryApi.update(editingRecord.id, {
        floorId: editForm.floorId || null,
        shelfId: editForm.shelfId || null,
        boxId: editForm.boxId || null,
        quantity: qty,
        batchId: editForm.batchId || null,
      });
      closeEditForm();
      await fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update record');
    } finally {
      setIsSaving(false);
    }
  };

  const formatLocation = (record: any) => {
    const parts: string[] = [];
    if (record.floor) {
      const branchName = record.floor.branch?.name;
      parts.push(branchName ? `🏢 ${branchName} › ${record.floor.name}` : `${record.floor.name} (${record.floor.code})`);
    }
    if (record.shelf) parts.push(`📚 ${record.shelf.name}`);
    if (record.box) parts.push(`📦 ${record.box.name}`);
    return parts.length > 0 ? parts.join(' › ') : '—';
  };

  const columns = [
    { key: 'sku', header: 'SKU Code', sortable: true, render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.sku?.skuCode}</span> },
    { key: 'name', header: 'Product', render: (r: any) => (
      <div>
        <span>{r.sku?.name}</span>
        {r.variant && <div className="text-xs text-indigo-600 mt-0.5">🧩 {r.variant.name}</div>}
      </div>
    )},
    { key: 'quantity', header: 'Qty', sortable: true, align: 'right' as const, render: (r: any) => <span style={{ fontWeight: 600 }}>{r.quantity}</span> },
    { key: 'state', header: 'State', render: (r: any) => <StateBadge state={r.state} /> },
    { key: 'floor', header: 'Location', render: (r: any) => <s-text>{formatLocation(r)}</s-text> },
    { key: 'batchId', header: 'Batch', render: (r: any) => r.batch ? <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.batch.batchNumber}</span> : <s-text>—</s-text> },
    { key: 'updatedAt', header: 'Updated', sortable: true, render: (r: any) => <s-text>{new Date(r.updatedAt).toLocaleDateString()}</s-text> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-1">
          <button
            className="btn-sm"
            onClick={(e: any) => { e.stopPropagation(); openEdit(r); }}
          >
            Edit
          </button>
          <button
            className="btn-sm"
            onClick={(e: any) => { e.stopPropagation(); openTransition(r); }}
            disabled={transitioning === r.id}
          >
            {transitioning === r.id ? '…' : 'Transition'}
          </button>
        </div>
      ),
    },
  ];

  const clearFilters = () => {
    setStateFilter('');
    setBranchFilter('');
    setLocationFilter('');
    setRackFilter('');
    setShelfFilter('');
    setFilterRacks([]);
    setFilterShelves([]);
    setSearchTerm('');
    setDebouncedSearch('');
    setPage(1);
  };

  const hasFilters = stateFilter || branchFilter || locationFilter || rackFilter || shelfFilter || searchTerm;

  // Floors visible in dropdowns: filter by selected branch when applicable
  const visibleLocations = branchFilter
    ? locations.filter((l: any) => l.branchId === branchFilter || l.branch?.id === branchFilter)
    : locations;

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">📦 Inventory</h1>
          <p className="page-subtitle">{total.toLocaleString()} records</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNewForm(true)}>+ New Record</button>
      </div>

      {/* Barcode scan section */}
      <div className="content-section">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <BarcodeInput onResult={setBarcodeScanResult} />
            </div>
            {barcodeScanResult && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <span>✅</span>
                <span>Found: <strong>{barcodeScanResult.sku?.name}</strong> — {barcodeScanResult.inventoryRecords?.length ?? 0} records</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table section */}
      <div className="content-section">
        {/* Filter bar */}
        <div className="filter-bar">
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search by SKU or name…"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All States' },
                ...Object.values(InventoryState).map((s) => ({ value: s, label: s }))
              ]}
              value={stateFilter}
              onChange={(value) => { setStateFilter(value); setPage(1); }}
              placeholder="All States"
              isClearable={false}
            />
          </div>
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Branches' },
                ...branches.map((b: any) => ({ value: b.id, label: b.name }))
              ]}
              value={branchFilter}
              onChange={(value) => { setBranchFilter(value); setLocationFilter(''); setRackFilter(''); setShelfFilter(''); setFilterRacks([]); setFilterShelves([]); setPage(1); }}
              placeholder="All Branches"
              isClearable={false}
            />
          </div>
          <div style={{ width: '180px' }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Floors' },
                ...visibleLocations.map((loc: any) => ({
                  value: loc.id,
                  label: loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`
                }))
              ]}
              value={locationFilter}
              onChange={async (value) => {
                const floorId = value;
                setLocationFilter(floorId);
                setRackFilter('');
                setShelfFilter('');
                setFilterShelves([]);
                setPage(1);
                if (floorId) {
                  try {
                    const res = await racksApi.list({ floorId });
                    setFilterRacks(Array.isArray(res.data?.data?.items ?? res.data?.data ?? res.data) ? (res.data?.data?.items ?? res.data?.data ?? res.data) : []);
                  } catch { setFilterRacks([]); }
                } else {
                  setFilterRacks([]);
                }
              }}
              placeholder="All Floors"
              isClearable={false}
            />
          </div>
          {filterRacks.length > 0 && (
            <div style={{ width: '180px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: 'All Racks' },
                  ...filterRacks.map((r: any) => ({ value: r.id, label: `${r.name} (${r.code})` }))
                ]}
                value={rackFilter}
                onChange={async (value) => {
                  const rackId = value;
                  setRackFilter(rackId);
                  setShelfFilter('');
                  setPage(1);
                  if (rackId) {
                    try {
                      const res = await shelvesApi.list({ rackId });
                      const data = res.data?.data?.items ?? res.data?.data ?? res.data;
                      setFilterShelves(Array.isArray(data) ? data : []);
                    } catch { setFilterShelves([]); }
                  } else {
                    setFilterShelves([]);
                  }
                }}
                placeholder="All Racks"
                isClearable={false}
              />
            </div>
          )}
          {filterShelves.length > 0 && (
            <div style={{ width: '180px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: 'All Shelves' },
                  ...filterShelves.map((s: any) => ({ value: s.id, label: `${s.name} (${s.code})` }))
                ]}
                value={shelfFilter}
                onChange={(value) => { setShelfFilter(value); setPage(1); }}
                placeholder="All Shelves"
                isClearable={false}
              />
            </div>
          )}
          {hasFilters && (
            <button className="btn-secondary text-xs" onClick={clearFilters}>
              ✕ Clear filters
            </button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={records}
          isLoading={isLoading}
          emptyMessage="No inventory records found"
          emptyIcon="📦"
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

      {/* New Record Modal */}
      {showNewForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeNewForm()}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">➕ New Inventory Record</h2>
              <button className="modal-close" onClick={closeNewForm}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body form-stack">
                <div className="form-group">
                  <label className="form-label">Product (SKU) *</label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '— Select Product —' },
                      ...skus.map((s: any) => ({ value: s.id, label: `${s.skuCode} – ${s.name}` }))
                    ]}
                    value={newForm.skuId}
                    onChange={(value) => handleNewFormSkuChange(value)}
                    placeholder="Select Product"
                    isClearable={false}
                  />
                </div>
                {skuVariants.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Variant</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— No Variant (base SKU) —' },
                        ...skuVariants.map((v: any) => ({ value: v.id, label: `${v.name} (${v.variantCode})` }))
                      ]}
                      value={newForm.variantId}
                      onChange={(value) => setNewForm(f => ({ ...f, variantId: value }))}
                      placeholder="No Variant"
                      isClearable={false}
                    />
                  </div>
                )}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Quantity *</label>
                    <input className="input-field" type="number" min="1" required value={newForm.quantity} onChange={(e) => setNewForm(f => ({ ...f, quantity: e.target.value }))} />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {QTY_SHORTCUTS.map(({ label, delta, cls }) => (
                        <button key={label} type="button" className={`px-2 py-0.5 text-xs text-white rounded font-medium transition-colors ${cls}`} onClick={() => setNewForm(f => ({ ...f, quantity: applyQtyDelta(f.quantity, delta) }))}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <SearchableSelect
                      options={Object.values(InventoryState).map((s) => ({ value: s, label: s }))}
                      value={newForm.state}
                      onChange={(value) => setNewForm(f => ({ ...f, state: value }))}
                      placeholder="Select State"
                      isClearable={false}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Floor</label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '— No Floor —' },
                      ...locations.map((loc: any) => ({
                        value: loc.id,
                        label: loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`
                      }))
                    ]}
                    value={newForm.floorId}
                    onChange={(value) => {
                      const floorId = value;
                      setNewForm(f => ({ ...f, floorId, shelfId: '', boxId: '' }));
                      fetchShelves(floorId, setNewFormShelves);
                      setNewFormBoxes([]);
                      if (floorId) fetchBoxes({ floorId }, setNewFormBoxes);
                    }}
                    placeholder="No Floor"
                    isClearable={false}
                  />
                </div>
                {newForm.floorId && (
                  <div className="form-group">
                    <label className="form-label">Shelf <span className="text-gray-400 font-normal">(optional)</span></label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— No Shelf —' },
                        ...newFormShelves.map((s: any) => ({
                          value: s.id,
                          label: `${s.name} (${s.code})${s.rack ? ` · ${s.rack.name}` : ''}`
                        }))
                      ]}
                      value={newForm.shelfId}
                      onChange={(value) => {
                        const shelfId = value;
                        setNewForm(f => ({ ...f, shelfId, boxId: '' }));
                        if (shelfId) fetchBoxes({ shelfId }, setNewFormBoxes);
                        else fetchBoxes({ floorId: newForm.floorId }, setNewFormBoxes);
                      }}
                      placeholder="No Shelf"
                      isClearable={false}
                    />
                  </div>
                )}
                {newForm.floorId && newFormBoxes.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Box <span className="text-gray-400 font-normal">(optional)</span></label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— No Box —' },
                        ...newFormBoxes.map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))
                      ]}
                      value={newForm.boxId}
                      onChange={(value) => setNewForm(f => ({ ...f, boxId: value }))}
                      placeholder="No Box"
                      isClearable={false}
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Batch ID</label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '— No Batch —' },
                      ...newFormBatches.map((b: any) => ({
                        value: b.id,
                        label: `${b.batchNumber}${b.costPrice ? ` — Cost: ${b.costPrice}` : ''}${b.expiryDate ? ` — Exp: ${new Date(b.expiryDate).toLocaleDateString()}` : ''}`
                      }))
                    ]}
                    value={newForm.batchId}
                    onChange={(value) => setNewForm(f => ({ ...f, batchId: value }))}
                    placeholder="No Batch"
                    isClearable={false}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeNewForm}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSaving}>{isSaving ? '⏳ Saving…' : '💾 Create Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { closeEditForm(); } }}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">✏️ Edit Inventory Record</h2>
                <p className="text-xs text-gray-400 font-mono">{editingRecord.sku?.skuCode} — {editingRecord.sku?.name}</p>
              </div>
              <button type="button" className="modal-close" onClick={closeEditForm}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <div className="form-group">
                <label className="form-label">Floor</label>
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
                    setEditForm(f => ({ ...f, floorId, shelfId: '', boxId: '' }));
                    fetchShelves(floorId, setEditFormShelves);
                    setEditFormBoxes([]);
                    if (floorId) fetchBoxes({ floorId }, setEditFormBoxes);
                  }}
                  placeholder="No Floor"
                  isClearable={false}
                />
              </div>
              {editForm.floorId && (
                <div className="form-group">
                  <label className="form-label">Shelf <span className="text-gray-400 font-normal">(optional)</span></label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '— No Shelf —' },
                      ...editFormShelves.map((s: any) => ({
                        value: s.id,
                        label: `${s.name} (${s.code})${s.rack ? ` · ${s.rack.name}` : ''}`
                      }))
                    ]}
                    value={editForm.shelfId}
                    onChange={(value) => {
                      const shelfId = value;
                      setEditForm(f => ({ ...f, shelfId, boxId: '' }));
                      if (shelfId) fetchBoxes({ shelfId }, setEditFormBoxes);
                      else fetchBoxes({ floorId: editForm.floorId }, setEditFormBoxes);
                    }}
                    placeholder="No Shelf"
                    isClearable={false}
                  />
                </div>
              )}
              {editForm.floorId && editFormBoxes.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Box <span className="text-gray-400 font-normal">(optional)</span></label>
                  <SearchableSelect
                    options={[
                      { value: '', label: '— No Box —' },
                      ...editFormBoxes.map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))
                    ]}
                    value={editForm.boxId}
                    onChange={(value) => setEditForm(f => ({ ...f, boxId: value }))}
                    placeholder="No Box"
                    isClearable={false}
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input className="input-field" type="number" min="1" value={editForm.quantity} onChange={(e) => setEditForm(f => ({ ...f, quantity: e.target.value }))} />
                <div className="flex flex-wrap gap-1 mt-1">
                  {QTY_SHORTCUTS.map(({ label, delta, cls }) => (
                    <button key={label} type="button" className={`px-2 py-0.5 text-xs text-white rounded font-medium transition-colors ${cls}`} onClick={() => setEditForm(f => ({ ...f, quantity: applyQtyDelta(f.quantity, delta) }))}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Batch ID</label>
                <SearchableSelect
                  options={[
                    { value: '', label: '— No Batch —' },
                    ...editFormBatches.map((b: any) => ({
                      value: b.id,
                      label: `${b.batchNumber}${b.costPrice ? ` — Cost: ${b.costPrice}` : ''}${b.expiryDate ? ` — Exp: ${new Date(b.expiryDate).toLocaleDateString()}` : ''}`
                    }))
                  ]}
                  value={editForm.batchId}
                  onChange={(value) => setEditForm(f => ({ ...f, batchId: value }))}
                  placeholder="No Batch"
                  isClearable={false}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Current State</label>
                <div className="flex items-center gap-2">
                  <StateBadge state={editingRecord.state} />
                  <span className="text-xs text-gray-500">Use "Transition" button to change state</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={closeEditForm}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={isSaving}>
                {isSaving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transition Modal */}
      {transitionRecord && (() => {
        const currentState = transitionRecord.state as InventoryState;
        const allowedNext = (ALLOWED_TRANSITIONS[currentState] ?? []) as InventoryState[];
        const allStates = Object.values(InventoryState);
        return (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setTransitionRecord(null)}>
            <div className="modal-panel-md">
              <div className="modal-header">
                <div>
                  <h2 className="modal-title">🔄 State Transition</h2>
                  <p className="text-xs text-gray-400 font-mono">{transitionRecord.sku?.skuCode} — {transitionRecord.sku?.name}</p>
                </div>
                <button className="modal-close" onClick={() => setTransitionRecord(null)}>✕</button>
              </div>
              <form onSubmit={handleTransition}>
                <div className="modal-body form-stack">
                  <div className="form-group">
                    <label className="form-label">Current State</label>
                    <StateBadge state={transitionRecord.state} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Transition To *</label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '— Select new state —' },
                        ...allowedNext.map(s => ({ value: s, label: `✅ ${s}` })),
                        ...allStates
                          .filter(s => s !== currentState && !allowedNext.includes(s as InventoryState))
                          .map(s => ({ value: s, label: `⚠️ ${s} (Override)` }))
                      ]}
                      value={transitionForm.toState}
                      onChange={(value) => setTransitionForm(f => ({ ...f, toState: value }))}
                      placeholder="Select new state"
                      isClearable={false}
                    />
                    {allowedNext.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">⚠️ No valid transitions from "{currentState}". Override requires Manager or Admin role.</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reason</label>
                    <input
                      className="input-field"
                      type="text"
                      placeholder="Optional reason for this transition"
                      value={transitionForm.reason}
                      onChange={(e) => setTransitionForm(f => ({ ...f, reason: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setTransitionRecord(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={!transitionForm.toState || transitioning === transitionRecord.id}>
                    {transitioning === transitionRecord.id ? '⏳ Transitioning…' : '🔄 Apply Transition'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

