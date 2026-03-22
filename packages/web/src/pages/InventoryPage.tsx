import { useEffect, useRef, useState } from 'react';
import { inventoryApi, floorsApi, branchesApi, skusApi, variantsApi, shelvesApi, boxesApi, racksApi } from '../api/client';
import { InventoryState, ALLOWED_TRANSITIONS } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import StateBadge from '../components/StateBadge';
import BarcodeInput from '../components/BarcodeInput';

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
      setShowNewForm(false);
      setNewForm(defaultNewForm);
      setSkuVariants([]);
      setNewFormShelves([]);
      setNewFormBoxes([]);
      await fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create record');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewFormSkuChange = async (skuId: string) => {
    setNewForm(f => ({ ...f, skuId, variantId: '' }));
    if (skuId) {
      try {
        const res = await variantsApi.list(skuId);
        setSkuVariants(res.data?.data ?? []);
      } catch { setSkuVariants([]); }
    } else {
      setSkuVariants([]);
    }
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
      setEditingRecord(null);
      setEditFormShelves([]);
      setEditFormBoxes([]);
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
    { key: 'batchId', header: 'Batch', render: (r: any) => r.batchId ? <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.batchId}</span> : <s-text>—</s-text> },
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
          <select
            className="filter-select"
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
          >
            <option value="">All States</option>
            {Object.values(InventoryState).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="filter-select"
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setLocationFilter(''); setRackFilter(''); setShelfFilter(''); setFilterRacks([]); setFilterShelves([]); setPage(1); }}
          >
            <option value="">All Branches</option>
            {branches.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={locationFilter}
            onChange={async (e) => {
              const floorId = e.target.value;
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
          >
            <option value="">All Floors</option>
            {visibleLocations.map((loc: any) => (
              <option key={loc.id} value={loc.id}>
                {loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`}
              </option>
            ))}
          </select>
          {filterRacks.length > 0 && (
            <select
              className="filter-select"
              value={rackFilter}
              onChange={async (e) => {
                const rackId = e.target.value;
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
            >
              <option value="">All Racks</option>
              {filterRacks.map((r: any) => (
                <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
              ))}
            </select>
          )}
          {filterShelves.length > 0 && (
            <select
              className="filter-select"
              value={shelfFilter}
              onChange={(e) => { setShelfFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Shelves</option>
              {filterShelves.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
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
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowNewForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">➕ New Inventory Record</h2>
              <button className="modal-close" onClick={() => setShowNewForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body form-stack">
                <div className="form-group">
                  <label className="form-label">Product (SKU) *</label>
                  <select className="input-field" value={newForm.skuId} required onChange={(e) => handleNewFormSkuChange(e.target.value)}>
                    <option value="">— Select Product —</option>
                    {skus.map((s: any) => <option key={s.id} value={s.id}>{s.skuCode} – {s.name}</option>)}
                  </select>
                </div>
                {skuVariants.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Variant</label>
                    <select className="input-field" value={newForm.variantId} onChange={(e) => setNewForm(f => ({ ...f, variantId: e.target.value }))}>
                      <option value="">— No Variant (base SKU) —</option>
                      {skuVariants.map((v: any) => <option key={v.id} value={v.id}>{v.name} ({v.variantCode})</option>)}
                    </select>
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
                    <select className="input-field" value={newForm.state} onChange={(e) => setNewForm(f => ({ ...f, state: e.target.value }))}>
                      {Object.values(InventoryState).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Floor</label>
                  <select className="input-field" value={newForm.floorId} onChange={(e) => {
                    const floorId = e.target.value;
                    setNewForm(f => ({ ...f, floorId, shelfId: '', boxId: '' }));
                    fetchShelves(floorId, setNewFormShelves);
                    setNewFormBoxes([]);
                    if (floorId) fetchBoxes({ floorId }, setNewFormBoxes);
                  }}>
                    <option value="">— No Floor —</option>
                    {locations.map((loc: any) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.branch?.name ? `${loc.branch.name} › ${loc.name}` : `${loc.name} (${loc.code})`}
                      </option>
                    ))}
                  </select>
                </div>
                {newForm.floorId && (
                  <div className="form-group">
                    <label className="form-label">Shelf <span className="text-gray-400 font-normal">(optional)</span></label>
                    <select className="input-field" value={newForm.shelfId} onChange={(e) => {
                      const shelfId = e.target.value;
                      setNewForm(f => ({ ...f, shelfId, boxId: '' }));
                      if (shelfId) fetchBoxes({ shelfId }, setNewFormBoxes);
                      else fetchBoxes({ floorId: newForm.floorId }, setNewFormBoxes);
                    }}>
                      <option value="">— No Shelf —</option>
                      {newFormShelves.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code}){s.rack ? ` · ${s.rack.name}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                {newForm.floorId && newFormBoxes.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Box <span className="text-gray-400 font-normal">(optional)</span></label>
                    <select className="input-field" value={newForm.boxId} onChange={(e) => setNewForm(f => ({ ...f, boxId: e.target.value }))}>
                      <option value="">— No Box —</option>
                      {newFormBoxes.map((b: any) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Batch ID</label>
                  <input className="input-field" type="text" placeholder="Optional batch reference" value={newForm.batchId} onChange={(e) => setNewForm(f => ({ ...f, batchId: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowNewForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSaving}>{isSaving ? '⏳ Saving…' : '💾 Create Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setEditingRecord(null); setEditFormShelves([]); setEditFormBoxes([]); } }}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">✏️ Edit Inventory Record</h2>
                <p className="text-xs text-gray-400 font-mono">{editingRecord.sku?.skuCode} — {editingRecord.sku?.name}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => { setEditingRecord(null); setEditFormShelves([]); setEditFormBoxes([]); }}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <div className="form-group">
                <label className="form-label">Floor</label>
                <select className="input-field" value={editForm.floorId} onChange={(e) => {
                  const floorId = e.target.value;
                  setEditForm(f => ({ ...f, floorId, shelfId: '', boxId: '' }));
                  fetchShelves(floorId, setEditFormShelves);
                  setEditFormBoxes([]);
                  if (floorId) fetchBoxes({ floorId }, setEditFormBoxes);
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
                  <label className="form-label">Shelf <span className="text-gray-400 font-normal">(optional)</span></label>
                  <select className="input-field" value={editForm.shelfId} onChange={(e) => {
                    const shelfId = e.target.value;
                    setEditForm(f => ({ ...f, shelfId, boxId: '' }));
                    if (shelfId) fetchBoxes({ shelfId }, setEditFormBoxes);
                    else fetchBoxes({ floorId: editForm.floorId }, setEditFormBoxes);
                  }}>
                    <option value="">— No Shelf —</option>
                    {editFormShelves.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code}){s.rack ? ` · ${s.rack.name}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {editForm.floorId && editFormBoxes.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Box <span className="text-gray-400 font-normal">(optional)</span></label>
                  <select className="input-field" value={editForm.boxId} onChange={(e) => setEditForm(f => ({ ...f, boxId: e.target.value }))}>
                    <option value="">— No Box —</option>
                    {editFormBoxes.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
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
                <input className="input-field" type="text" placeholder="Optional batch reference" value={editForm.batchId} onChange={(e) => setEditForm(f => ({ ...f, batchId: e.target.value }))} />
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
              <button type="button" className="btn-secondary" onClick={() => { setEditingRecord(null); setEditFormShelves([]); setEditFormBoxes([]); }}>Cancel</button>
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
                    <select
                      className="input-field"
                      required
                      value={transitionForm.toState}
                      onChange={(e) => setTransitionForm(f => ({ ...f, toState: e.target.value }))}
                    >
                      <option value="">— Select new state —</option>
                      {allowedNext.length > 0 && (
                        <optgroup label="✅ Valid transitions">
                          {allowedNext.map(s => <option key={s} value={s}>{s}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="⚠️ Override (Manager/Admin only)">
                        {allStates.filter(s => s !== currentState && !allowedNext.includes(s as InventoryState)).map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </optgroup>
                    </select>
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

