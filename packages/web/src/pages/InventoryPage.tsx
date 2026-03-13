import { useEffect, useRef, useState } from 'react';
import { inventoryApi, locationsApi } from '../api/client';
import { InventoryState } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import StateBadge from '../components/StateBadge';
import BarcodeInput from '../components/BarcodeInput';

const PAGE_SIZE = 20;

export default function InventoryPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [locations, setLocations] = useState<any[]>([]);
  const [barcodeScanResult, setBarcodeScanResult] = useState<any>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
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

  useEffect(() => { fetchLocations(); }, []);
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

  const formatLocation = (location: any) => {
    if (!location) return '—';
    return [location.floor, location.section, location.shelf, location.zone].filter(Boolean).join(' › ');
  };

  const columns = [
    { key: 'sku', header: 'SKU Code', sortable: true, render: (r: any) => <span className="font-mono text-xs font-medium bg-gray-100 px-2 py-0.5 rounded">{r.sku?.skuCode}</span> },
    { key: 'name', header: 'Product', render: (r: any) => <span className="font-medium">{r.sku?.name}</span> },
    { key: 'quantity', header: 'Qty', sortable: true, align: 'right' as const, render: (r: any) => <span className="font-semibold">{r.quantity}</span> },
    { key: 'state', header: 'State', render: (r: any) => <StateBadge state={r.state} /> },
    { key: 'location', header: 'Location', render: (r: any) => <span className="text-sm text-gray-600">{formatLocation(r.location)}</span> },
    { key: 'batchId', header: 'Batch', render: (r: any) => r.batchId ? <span className="font-mono text-xs text-gray-500">{r.batchId}</span> : <span className="text-gray-400">—</span> },
    { key: 'updatedAt', header: 'Updated', sortable: true, render: (r: any) => <span className="text-xs text-gray-500">{new Date(r.updatedAt).toLocaleDateString()}</span> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleTransition(r); }}
          disabled={transitioning === r.id}
          className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50 disabled:opacity-50"
        >
          {transitioning === r.id ? '…' : 'Transition'}
        </button>
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
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">📦 Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} records</p>
        </div>
      </div>

      {/* Barcode scan */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Quick Barcode Lookup</label>
            <BarcodeInput onResult={setBarcodeScanResult} />
          </div>
          {barcodeScanResult && (
            <div className="flex-1 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <strong className="text-green-800">Found:</strong> {barcodeScanResult.sku?.name}
              <span className="ml-2 text-green-600">— {barcodeScanResult.inventoryRecords?.length ?? 0} records</span>
            </div>
          )}
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input type="text" placeholder="Search by SKU or name..." value={searchTerm} onChange={(e) => handleSearchChange(e.target.value)} className="filter-input pl-9 w-full" />
          </div>
          <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setPage(1); }} className="filter-input">
            <option value="">All States</option>
            {Object.values(InventoryState).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }} className="filter-input">
            <option value="">All Locations</option>
            {locations.map((loc: any) => (
              <option key={loc.id} value={loc.id}>
                {[loc.floor, loc.section, loc.shelf, loc.zone].filter(Boolean).join(' › ')}
              </option>
            ))}
          </select>
          {hasFilters && <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap">Clear filters</button>}
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
    </div>
  );
}
