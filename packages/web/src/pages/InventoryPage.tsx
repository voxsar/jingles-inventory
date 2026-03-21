import { useEffect, useRef, useState } from 'react';
import { inventoryApi, locationsApi, skusApi } from '../api/client';
import { InventoryState } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import StateBadge from '../components/StateBadge';
import BarcodeInput from '../components/BarcodeInput';

const PAGE_SIZE = 20;

const defaultNewForm = { skuId: '', locationId: '', quantity: '1', state: InventoryState.Uninspected as string, batchId: '' };
const defaultEditForm = { locationId: '', quantity: '1', batchId: '' };

export default function InventoryPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [locations, setLocations] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [barcodeScanResult, setBarcodeScanResult] = useState<any>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState(defaultNewForm);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [isSaving, setIsSaving] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInventory = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (stateFilter) params.state = stateFilter;
      if (locationFilter) params.locationId = locationFilter;
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
      const res = await locationsApi.list();
      setLocations(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    } catch { /* ignore */ }
  };

  const fetchSkus = async () => {
    try {
      const res = await skusApi.list({ pageSize: '200' });
      setSkus(res.data?.data?.items ?? []);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchLocations(); fetchSkus(); }, []);
  useEffect(() => { fetchInventory(); }, [page, pageSize, stateFilter, locationFilter, debouncedSearch]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  const handleTransition = async (record: any) => {
    const newState = prompt(`Transition "${record.sku?.name}" to new state:`);
    if (!newState) return;
    const reason = prompt('Reason (optional):') ?? undefined;
    setTransitioning(record.id);
    try {
      await inventoryApi.transition(record.id, newState, reason);
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
        locationId: newForm.locationId || undefined,
        quantity: qty,
        state: newForm.state,
        batchId: newForm.batchId || undefined,
      });
      setShowNewForm(false);
      setNewForm(defaultNewForm);
      await fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create record');
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (record: any) => {
    setEditForm({
      locationId: record.locationId ?? '',
      quantity: String(record.quantity),
      batchId: record.batchId ?? '',
    });
    setEditingRecord(record);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const qty = parseInt(editForm.quantity);
    if (isNaN(qty) || qty < 1) { alert('Quantity must be a positive number'); return; }
    setIsSaving(true);
    try {
      await inventoryApi.update(editingRecord.id, {
        locationId: editForm.locationId || null,
        quantity: qty,
        batchId: editForm.batchId || null,
      });
      setEditingRecord(null);
      await fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update record');
    } finally {
      setIsSaving(false);
    }
  };

  const formatLocation = (location: any) => {
    if (!location) return '—';
    return [location.floor, location.section, location.shelf, location.zone].filter(Boolean).join(' › ');
  };

  const columns = [
    { key: 'sku', header: 'SKU Code', sortable: true, render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.sku?.skuCode}</span> },
    { key: 'name', header: 'Product', render: (r: any) => <span>{r.sku?.name}</span> },
    { key: 'quantity', header: 'Qty', sortable: true, align: 'right' as const, render: (r: any) => <span style={{ fontWeight: 600 }}>{r.quantity}</span> },
    { key: 'state', header: 'State', render: (r: any) => <StateBadge state={r.state} /> },
    { key: 'location', header: 'Location', render: (r: any) => <s-text>{formatLocation(r.location)}</s-text> },
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
            onClick={(e: any) => { e.stopPropagation(); handleTransition(r); }}
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
    setLocationFilter('');
    setSearchTerm('');
    setDebouncedSearch('');
    setPage(1);
  };

  const hasFilters = stateFilter || locationFilter || searchTerm;

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
            value={locationFilter}
            onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Locations</option>
            {locations.map((loc: any) => (
              <option key={loc.id} value={loc.id}>
                {[loc.floor, loc.section, loc.shelf, loc.zone].filter(Boolean).join(' › ')}
              </option>
            ))}
          </select>
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
                  <select className="input-field" value={newForm.skuId} required onChange={(e) => setNewForm(f => ({ ...f, skuId: e.target.value }))}>
                    <option value="">— Select Product —</option>
                    {skus.map((s: any) => <option key={s.id} value={s.id}>{s.skuCode} – {s.name}</option>)}
                  </select>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Quantity *</label>
                    <input className="input-field" type="number" min="1" required value={newForm.quantity} onChange={(e) => setNewForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <select className="input-field" value={newForm.state} onChange={(e) => setNewForm(f => ({ ...f, state: e.target.value }))}>
                      {Object.values(InventoryState).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <select className="input-field" value={newForm.locationId} onChange={(e) => setNewForm(f => ({ ...f, locationId: e.target.value }))}>
                    <option value="">— No Location —</option>
                    {locations.map((loc: any) => (
                      <option key={loc.id} value={loc.id}>{[loc.floor, loc.section, loc.shelf, loc.zone].filter(Boolean).join(' › ')}</option>
                    ))}
                  </select>
                </div>
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
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingRecord(null)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">✏️ Edit Inventory Record</h2>
                <p className="text-xs text-gray-400 font-mono">{editingRecord.sku?.skuCode} — {editingRecord.sku?.name}</p>
              </div>
              <button className="modal-close" onClick={() => setEditingRecord(null)}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <div className="form-group">
                <label className="form-label">Location</label>
                <select className="input-field" value={editForm.locationId} onChange={(e) => setEditForm(f => ({ ...f, locationId: e.target.value }))}>
                  <option value="">— No Location —</option>
                  {locations.map((loc: any) => (
                    <option key={loc.id} value={loc.id}>{[loc.floor, loc.section, loc.shelf, loc.zone].filter(Boolean).join(' › ')}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input className="input-field" type="number" min="1" value={editForm.quantity} onChange={(e) => setEditForm(f => ({ ...f, quantity: e.target.value }))} />
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
              <button type="button" className="btn-secondary" onClick={() => setEditingRecord(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={isSaving}>
                {isSaving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

