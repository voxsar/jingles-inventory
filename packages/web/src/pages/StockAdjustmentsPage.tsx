import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { inventoryApi, floorsApi, branchesApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import StateBadge from '../components/StateBadge';
import BarcodeInput from '../components/BarcodeInput';
import SearchableSelect from '../components/SearchableSelect';
import StockAdjustmentModal from '../components/StockAdjustmentModal';
import { UiText } from '../components/UiPrimitives';
import { formatInventoryLocation } from '../utils/location';
import { formatQuantity } from '../utils/quantity';

const PAGE_SIZE = 20;

export default function StockAdjustmentsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [scanResult, setScanResult] = useState<any>(null);
  const [adjustRecord, setAdjustRecord] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (skuFilter) params.skuId = skuFilter;
      if (floorFilter) params.floorId = floorFilter;
      else if (branchFilter) params.branchId = branchFilter;
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

  useEffect(() => {
    branchesApi.list()
      .then((res) => {
        const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
        setBranches(Array.isArray(data) ? data : []);
      })
      .catch(() => { /* ignore */ });
    floorsApi.list()
      .then((res) => setFloors(res.data?.data?.items ?? res.data?.data ?? res.data ?? []))
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [page, pageSize, debouncedSearch, skuFilter, branchFilter, floorFilter]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  // A scan narrows the table to the scanned product so it can be adjusted.
  const handleScan = (result: any) => {
    setScanResult(result);
    if (result?.sku?.id) {
      setSkuFilter(result.sku.id);
      setPage(1);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSkuFilter('');
    setBranchFilter('');
    setFloorFilter('');
    setScanResult(null);
    setPage(1);
  };

  const hasFilters = searchTerm || skuFilter || branchFilter || floorFilter;

  const visibleFloors = branchFilter
    ? floors.filter((f: any) => f.branchId === branchFilter || f.branch?.id === branchFilter)
    : floors;

  const columns = [
    { key: 'sku', header: 'SKU Code', sortable: true, render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.sku?.skuCode}</span> },
    { key: 'name', header: 'Product', render: (r: any) => (
      <div>
        <span>{r.sku?.name}</span>
        {r.variant && <div className="text-xs text-indigo-600 mt-0.5">🧩 {r.variant.name}</div>}
      </div>
    )},
    { key: 'floor', header: 'Location', render: (r: any) => <UiText>{formatInventoryLocation(r)}</UiText> },
    { key: 'batchId', header: 'Batch', render: (r: any) => r.batch ? <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.batch.batchNumber}</span> : <UiText>—</UiText> },
    { key: 'state', header: 'State', render: (r: any) => <StateBadge state={r.state} /> },
    { key: 'quantity', header: 'Qty', sortable: true, align: 'right' as const, render: (r: any) => <span style={{ fontWeight: 600 }}>{formatQuantity(r.quantity)}</span> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <button
          className="btn-sm"
          onClick={(e: any) => { e.stopPropagation(); setAdjustRecord(r); }}
        >
          📊 Adjust
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">📊 Stock Adjustments</h1>
          <p className="page-subtitle">Stock up or down with a recorded reason — {total.toLocaleString()} records</p>
        </div>
        <Link className="btn-secondary" to="/reports">📄 Adjustment history</Link>
      </div>

      {/* Scan to jump straight to a product */}
      <div className="content-section">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <BarcodeInput onResult={handleScan} />
            </div>
            {scanResult && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <span>✅</span>
                <span>
                  Showing: <strong>{scanResult.sku?.name}</strong>
                  {scanResult.variant && <> <span className="text-green-800">/ {scanResult.variant.name ?? scanResult.variant.variantCode}</span></>}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="content-section">
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
                { value: '', label: 'All Branches' },
                ...branches.map((b: any) => ({ value: b.id, label: b.name }))
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
                ...visibleFloors.map((floor: any) => ({
                  value: floor.id,
                  label: floor.branch?.name ? `${floor.branch.name} › ${floor.name}` : `${floor.name} (${floor.code})`
                }))
              ]}
              value={floorFilter}
              onChange={(value) => { setFloorFilter(value); setPage(1); }}
              placeholder="All Floors"
              isClearable={false}
            />
          </div>
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
          emptyIcon="📊"
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

      {adjustRecord && (
        <StockAdjustmentModal
          record={adjustRecord}
          onClose={() => setAdjustRecord(null)}
          onAdjusted={fetchRecords}
        />
      )}
    </div>
  );
}
