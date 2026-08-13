import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { boxesApi, floorsApi, shelvesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import {
  buildCreatedRow,
  fetchAllSpreadsheetRows,
  mergeUpdatedRow,
  useLazySpreadsheetRows,
} from './spreadsheetPageUtils';

export default function BoxSpreadsheetPage() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const {
    rows: boxes,
    setRows: setBoxes,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(boxesApi.list, { searchParamName: '' });

  useEffect(() => {
    const loadRelations = async () => {
      try {
        const [floorData, shelfData] = await Promise.all([
          fetchAllSpreadsheetRows<any>(floorsApi.list),
          fetchAllSpreadsheetRows<any>(shelvesApi.list),
        ]);
        setFloors(Array.isArray(floorData) ? floorData : []);
        setShelves(Array.isArray(shelfData) ? shelfData : []);
      } catch (err) {
        console.error(err);
      }
    };

    loadRelations();
  }, []);

  const floorOptions = [
    { value: '', label: 'No floor' },
    ...floors.map(floor => ({
      value: floor.id,
      label: floor.branch?.name ? `${floor.branch.name} — ${floor.name}` : floor.name,
    })),
  ];

  const shelfOptions = [
    { value: '', label: 'No shelf (on floor)' },
    ...shelves.map(shelf => ({ value: shelf.id, label: `${shelf.code} — ${shelf.name}` })),
  ];

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'code',
      header: 'Box Code',
      width: '140px',
      validate: (value) => (value ? null : 'Box code is required'),
    },
    {
      key: 'name',
      header: 'Box Name',
      width: '180px',
      validate: (value) => (value ? null : 'Box name is required'),
    },
    {
      key: 'shelfId',
      header: 'Shelf',
      options: shelfOptions,
      width: '200px',
      getValue: (row) => row.shelfId ?? '',
      setValue: (_row, value) => ({ shelfId: value || null }),
    },
    {
      key: 'floorId',
      header: 'Floor',
      options: floorOptions,
      width: '220px',
      getValue: (row) => row.floorId ?? '',
      setValue: (_row, value) => ({ floorId: value || null }),
    },
    {
      key: 'width',
      header: 'Width (cm)',
      width: '110px',
      getValue: (row) => row.width ?? '',
      setValue: (_row, value) => ({ width: value ?? null }),
      validate: (value) => (Number(value) > 0 ? null : 'Width must be greater than 0'),
    },
    {
      key: 'height',
      header: 'Height (cm)',
      width: '110px',
      getValue: (row) => row.height ?? '',
      setValue: (_row, value) => ({ height: value ?? null }),
      validate: (value) => (Number(value) > 0 ? null : 'Height must be greater than 0'),
    },
    {
      key: 'length',
      header: 'Length (cm)',
      width: '110px',
      getValue: (row) => row.length ?? '',
      setValue: (_row, value) => ({ length: value ?? null }),
      validate: (value) => (Number(value) > 0 ? null : 'Length must be greater than 0'),
    },
    {
      key: 'stackOrder',
      header: 'Stack Order',
      width: '110px',
      getValue: (row) => row.stackOrder ?? 0,
      setValue: (_row, value) => ({ stackOrder: value ?? 0 }),
    },
    {
      key: 'barcodeCount',
      header: 'Barcodes',
      width: '100px',
      readOnly: true,
      getValue: (row) => row.barcodes?.length ?? 0,
      render: (value) => String(value ?? 0),
    },
    {
      key: 'isActive',
      header: 'Active',
      width: '80px',
      getValue: (row) => !!row.isActive,
      setValue: (_row, value) => ({ isActive: value }),
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: '110px',
      readOnly: true,
      render: (value) => (value ? new Date(value).toLocaleDateString() : '—'),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = await boxesApi.update(row.id, changes);
      setBoxes(current => current.map(box => (
        box.id === row.id ? mergeUpdatedRow(box, changes, response) : box
      )));
    } catch (err) {
      console.error('Failed to save storage box:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await boxesApi.delete(row.id);
      setBoxes(current => current.filter(box => box.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete storage box:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await boxesApi.create({
        ...data,
        shelfId: data.shelfId || null,
        floorId: data.floorId || null,
      });
      setBoxes(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
    } catch (err) {
      console.error('Failed to create storage box:', err);
      throw err;
    }
  };

  return (
    <div>
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
            <h1 className="page-title">📦 Storage Boxes Spreadsheet</h1>
            <p className="page-subtitle">Manage storage boxes, their shelf or floor placement and dimensions</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={boxes}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          onLoadMore={loadMoreRows}
          getRowKey={(row) => row.id}
        />
      </div>
    </div>
  );
}
