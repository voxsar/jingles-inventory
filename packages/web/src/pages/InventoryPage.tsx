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
        <s-button
          
          onClick={(e: any) => { e.stopPropagation(); handleTransition(r); }}
          disabled={transitioning === r.id}
        >
          {transitioning === r.id ? '…' : 'Transition'}
        </s-button>
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
    <>
      <s-stack direction="inline" gap="base">
        <s-heading>📦 Inventory</s-heading>
        <s-text>{total.toLocaleString()} records</s-text>
      </s-stack>

      <s-section>
        <s-stack direction="inline" gap="base">
          <div style={{ flex: 1 }}>
            <BarcodeInput onResult={setBarcodeScanResult} />
          </div>
          {barcodeScanResult && (
            <s-banner tone="success">
              Found: {barcodeScanResult.sku?.name} — {barcodeScanResult.inventoryRecords?.length ?? 0} records
            </s-banner>
          )}
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-search-field
            label="Search"
            label-visibility="hidden"
            value={searchTerm}
            placeholder="Search by SKU or name..."
            onChange={(e: any) => handleSearchChange(e.currentTarget.value)}
          />
          <s-select label="State" label-visibility="hidden" value={stateFilter} onChange={(e: any) => { setStateFilter(e.currentTarget.value); setPage(1); }}>
            <s-option value="">All States</s-option>
            {Object.values(InventoryState).map((s) => <s-option key={s} value={s}>{s}</s-option>)}
          </s-select>
          <s-select label="Location" label-visibility="hidden" value={locationFilter} onChange={(e: any) => { setLocationFilter(e.currentTarget.value); setPage(1); }}>
            <s-option value="">All Locations</s-option>
            {locations.map((loc: any) => (
              <s-option key={loc.id} value={loc.id}>
                {[loc.floor, loc.section, loc.shelf, loc.zone].filter(Boolean).join(' › ')}
              </s-option>
            ))}
          </s-select>
          {hasFilters && <s-button  onClick={clearFilters}>Clear filters</s-button>}
        </s-stack>

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
      </s-section>
    </>
  );
}
