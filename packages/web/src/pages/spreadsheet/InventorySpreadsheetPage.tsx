import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi, floorsApi, skusApi, racksApi, shelvesApi, boxesApi } from '../../api/client';
import { InventoryState } from '@jingles/shared';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import Pagination from '../../components/Pagination';
import StateBadge from '../../components/StateBadge';
import { mergeUpdatedRow } from './spreadsheetPageUtils';

const PAGE_SIZE = 50;

export default function InventorySpreadsheetPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [skus, setSkus] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [racks, setRacks] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [invRes, skuRes, floorRes, rackRes, shelfRes, boxRes] = await Promise.all([
        inventoryApi.list({ page: String(page), pageSize: String(pageSize) }),
        skusApi.list({ pageSize: '1000' }),
        floorsApi.list(),
        fetch('/api/racks').then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/shelves').then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/boxes').then(r => r.json()).catch(() => ({ data: [] })),
      ]);

      const invData = invRes.data?.data?.items ?? invRes.data?.data ?? invRes.data ?? [];
      setRecords(Array.isArray(invData) ? invData : []);
      setTotal(invRes.data?.data?.total ?? 0);
      setTotalPages(invRes.data?.data?.totalPages ?? 1);

      const skuData = skuRes.data?.data?.items ?? skuRes.data?.data ?? skuRes.data ?? [];
      setSkus(Array.isArray(skuData) ? skuData : []);

      const floorData = floorRes.data?.data?.items ?? floorRes.data?.data ?? floorRes.data ?? [];
      setFloors(Array.isArray(floorData) ? floorData : []);

      const rackData = rackRes.data?.data?.items ?? rackRes.data?.data ?? rackRes.data ?? [];
      setRacks(Array.isArray(rackData) ? rackData : []);

      const shelfData = shelfRes.data?.data?.items ?? shelfRes.data?.data ?? shelfRes.data ?? [];
      setShelves(Array.isArray(shelfData) ? shelfData : []);

      const boxData = boxRes.data?.data?.items ?? boxRes.data?.data ?? boxRes.data ?? [];
      setBoxes(Array.isArray(boxData) ? boxData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize]);

  const floorOptions = floors.map(f => ({ value: f.id, label: `${f.name} (${f.branch?.name || ''})` }));
  const rackOptions = racks.map(r => ({ value: r.id, label: r.name || r.id }));
  const shelfOptions = shelves.map(s => ({ value: s.id, label: s.name || s.id }));
  const boxOptions = boxes.map(b => ({ value: b.id, label: b.name || b.id }));
  const stateOptions = Object.values(InventoryState).map(s => ({ value: s, label: s }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'skuId',
      header: 'SKU',
      width: '200px',
      readOnly: true,
      getValue: (row) => row.skuId || '',
      render: (value, row) => {
        const sku = skus.find(s => s.id === row.skuId);
        return sku ? `${sku.skuCode} - ${sku.name}` : '';
      },
    },
    {
      key: 'quantity',
      header: 'Quantity',
      
      width: '100px',
      
      validate: (value) => {
        if (!value || value < 0) return 'Must be positive';
        return null;
      },
    },
    {
      key: 'state',
      header: 'State',
      
      options: stateOptions,
      width: '140px',
      render: (value) => String(value || ''),
    },
    {
      key: 'floorId',
      header: 'Floor',
      
      options: floorOptions,
      width: '180px',
      getValue: (row) => row.floorId || '',
      setValue: (row, value) => ({ floorId: value || null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'rackId',
      header: 'Rack',
      options: rackOptions,
      width: '140px',
      readOnly: true,
      getValue: (row) => row.shelf?.rackId || '',
    },
    {
      key: 'shelfId',
      header: 'Shelf',
      
      options: shelfOptions,
      width: '140px',
      getValue: (row) => row.shelfId || '',
      setValue: (row, value) => ({ shelfId: value || null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'boxId',
      header: 'Box',
      
      options: boxOptions,
      width: '140px',
      getValue: (row) => row.boxId || '',
      setValue: (row, value) => ({ boxId: value || null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'batchId',
      header: 'Batch',

      width: '120px',
      render: (value, row) => row.batch?.batchNumber || '—',
    },
    {
      key: 'updatedAt',
      header: 'Last Updated',
      
      width: '120px',
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = changes.state !== undefined
        ? await inventoryApi.transition(row.id, changes.state)
        : await inventoryApi.update(row.id, changes);
      setRecords(current => current.map(record => (
        record.id === row.id ? mergeUpdatedRow(record, changes, response) : record
      )));
    } catch (err) {
      console.error('Failed to save inventory:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await inventoryApi.delete(row.id);
      setRecords(current => current.filter(record => record.id !== row.id));
      setTotal(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete inventory:', err);
      throw err;
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="page-header-left">
          <button
            onClick={() => navigate('/spreadsheet')}
            className="btn-secondary"
            style={{ marginRight: '16px', padding: '6px 12px', fontSize: '13px' }}
          >
            ← Back
          </button>
          <div>
            <h1 className="page-title">📦 Inventory Records Spreadsheet</h1>
            <p className="page-subtitle">Edit quantities, states, and locations with dropdown search</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={records}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          getRowKey={(row) => row.id}
          canAdd={false}
        />
      </div>

      {/* Pagination */}
      {!isLoading && records.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <Pagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
