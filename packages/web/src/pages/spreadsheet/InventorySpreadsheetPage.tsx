import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi, floorsApi, skusApi, racksApi, shelvesApi, boxesApi, branchesApi } from '../../api/client';
import { InventoryState } from '@jingles/shared';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { fetchAllSpreadsheetRows, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function InventorySpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isLookupsLoading, setIsLookupsLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [racks, setRacks] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const {
    rows: records,
    setRows: setRecords,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(inventoryApi.list, { searchTerm });

  useEffect(() => {
    const loadLookups = async () => {
      setIsLookupsLoading(true);
      try {
        const [branchData, floorData, rackData, shelfData, boxData] = await Promise.all([
          fetchAllSpreadsheetRows<any>(branchesApi.list),
          fetchAllSpreadsheetRows<any>(floorsApi.list),
          fetchAllSpreadsheetRows<any>(racksApi.list),
          fetchAllSpreadsheetRows<any>(shelvesApi.list),
          fetchAllSpreadsheetRows<any>(boxesApi.list),
        ]);

        setBranches(Array.isArray(branchData) ? branchData : []);
        setFloors(Array.isArray(floorData) ? floorData : []);
        setRacks(Array.isArray(rackData) ? rackData : []);
        setShelves(Array.isArray(shelfData) ? shelfData : []);
        setBoxes(Array.isArray(boxData) ? boxData : []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLookupsLoading(false);
      }
    };

    loadLookups();
  }, []);

  const getFloorBranchId = (floor: any) => floor?.branchId ?? floor?.branch?.id ?? '';
  const getRowBranchId = (row: any) => (
    row.floor?.branch?.id
    ?? floors.find(floor => floor.id === row.floorId)?.branchId
    ?? floors.find(floor => floor.id === row.floorId)?.branch?.id
    ?? ''
  );
  const getShelfFloorId = (shelf: any) => shelf?.floorId ?? shelf?.floor?.id ?? '';
  const getBoxShelfId = (box: any) => box?.shelfId ?? box?.shelf?.id ?? '';
  const getBoxFloorId = (box: any) => box?.floorId ?? box?.floor?.id ?? shelves.find(shelf => shelf.id === getBoxShelfId(box))?.floorId ?? '';

  const branchOptions = branches.map(b => ({ value: b.id, label: b.name }));
  const floorOptions = floors.map(f => ({
    value: f.id,
    label: f.branch?.name ? `${f.branch.name} › ${f.name}` : f.name,
  }));
  const rackOptions = racks.map(r => ({
    value: r.id,
    label: r.floor?.branch?.name ? `${r.floor.branch.name} › ${r.floor.name} › ${r.name}` : r.name || r.id,
  }));
  const shelfOptions = shelves.map(s => ({
    value: s.id,
    label: s.floor?.branch?.name ? `${s.floor.branch.name} › ${s.floor.name} › ${s.name}` : s.name || s.id,
  }));
  const boxOptions = boxes.map(b => ({
    value: b.id,
    label: b.shelf?.name ? `${b.shelf.name} › ${b.name || b.code || b.id}` : b.name || b.code || b.id,
  }));
  const stateOptions = Object.values(InventoryState).map(s => ({ value: s, label: s }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'skuId',
      header: 'SKU',
      width: '200px',
      readOnly: true,
      getValue: (row) => row.skuId || '',
      render: (value, row) => {
        const sku = row.sku;
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
      key: 'branchId',
      header: 'Branch',
      options: branchOptions,
      width: '180px',
      getValue: getRowBranchId,
      setValue: (row, value) => {
        if (!value) return { floorId: null, shelfId: null, boxId: null };

        const currentFloor = floors.find(floor => floor.id === row.floorId);
        const currentFloorStillValid = currentFloor && getFloorBranchId(currentFloor) === value;
        const nextFloorId = currentFloorStillValid
          ? currentFloor.id
          : floors.find(floor => getFloorBranchId(floor) === value)?.id ?? null;

        return { floorId: nextFloorId, shelfId: null, boxId: null };
      },
      validate: (value) => !value || floors.some(floor => getFloorBranchId(floor) === value)
        ? null
        : 'Selected branch has no floors',
    },
    {
      key: 'floorId',
      header: 'Floor',
      
      options: floorOptions,
      width: '180px',
      getValue: (row) => row.floorId || '',
      setValue: (_row, value) => ({ floorId: value || null, shelfId: null, boxId: null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'rackId',
      header: 'Rack',
      options: rackOptions,
      width: '140px',
      getValue: (row) => row.shelf?.rackId || '',
      setValue: (_row, value) => {
        if (!value) return { shelfId: null, boxId: null };
        const rack = racks.find(item => item.id === value);
        const shelf = shelves.find(item => item.rackId === value);
        return {
          floorId: shelf ? getShelfFloorId(shelf) || null : rack?.floorId ?? rack?.floor?.id ?? null,
          shelfId: shelf?.id ?? null,
          boxId: null,
        };
      },
    },
    {
      key: 'shelfId',
      header: 'Shelf',
      
      options: shelfOptions,
      width: '140px',
      getValue: (row) => row.shelfId || '',
      setValue: (_row, value) => {
        const shelf = shelves.find(item => item.id === value);
        return {
          floorId: shelf ? getShelfFloorId(shelf) || null : null,
          shelfId: value || null,
          boxId: null,
        };
      },
      render: (value, row) => String(value || ""),
    },
    {
      key: 'boxId',
      header: 'Box',
      
      options: boxOptions,
      width: '140px',
      getValue: (row) => row.boxId || '',
      setValue: (_row, value) => {
        const box = boxes.find(item => item.id === value);
        const shelfId = box ? getBoxShelfId(box) || null : null;
        return {
          floorId: box ? getBoxFloorId(box) || null : null,
          shelfId,
          boxId: value || null,
        };
      },
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
      setTotalRows(current => Math.max(0, current - 1));
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
          isLoading={isLoading || isLookupsLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onSave={handleSave}
          onDelete={handleDelete}
          onLoadMore={loadMoreRows}
          onSearchChange={setSearchTerm}
          getRowKey={(row) => row.id}
          canAdd={false}
        />
      </div>
    </div>
  );
}
