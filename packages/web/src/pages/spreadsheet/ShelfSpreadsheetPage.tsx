import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shelvesApi, floorsApi, racksApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import {
  buildCreatedRow,
  fetchAllSpreadsheetRows,
  mergeUpdatedRow,
  rejectImmutableChanges,
  useLazySpreadsheetRows,
} from './spreadsheetPageUtils';

export default function ShelfSpreadsheetPage() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState<any[]>([]);
  const [racks, setRacks] = useState<any[]>([]);
  const {
    rows: shelves,
    setRows: setShelves,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(shelvesApi.list, { searchParamName: '' });

  useEffect(() => {
    const loadRelations = async () => {
      try {
        const [floorData, rackData] = await Promise.all([
          fetchAllSpreadsheetRows<any>(floorsApi.list),
          fetchAllSpreadsheetRows<any>(racksApi.list),
        ]);
        setFloors(Array.isArray(floorData) ? floorData : []);
        setRacks(Array.isArray(rackData) ? rackData : []);
      } catch (err) {
        console.error(err);
      }
    };

    loadRelations();
  }, []);

  const floorOptions = floors.map(floor => ({
    value: floor.id,
    label: floor.branch?.name ? `${floor.branch.name} — ${floor.name}` : floor.name,
  }));

  const rackOptions = [
    { value: '', label: 'No rack (free-standing)' },
    ...racks.map(rack => ({ value: rack.id, label: `${rack.code} — ${rack.name}` })),
  ];

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'code',
      header: 'Shelf Code',
      width: '120px',
      validate: (value) => (value ? null : 'Shelf code is required'),
    },
    {
      key: 'name',
      header: 'Shelf Name',
      width: '180px',
      validate: (value) => (value ? null : 'Shelf name is required'),
    },
    {
      key: 'floorId',
      header: 'Floor',
      options: floorOptions,
      width: '220px',
      validate: (value) => (value ? null : 'Floor is required'),
    },
    {
      key: 'rackId',
      header: 'Rack',
      options: rackOptions,
      width: '200px',
      getValue: (row) => row.rackId ?? '',
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
      key: 'levelIndex',
      header: 'Level',
      width: '80px',
      getValue: (row) => row.levelIndex ?? '',
      setValue: (_row, value) => ({ levelIndex: value ?? null }),
    },
    {
      key: 'elevationCm',
      header: 'Elevation (cm)',
      width: '130px',
      getValue: (row) => row.elevationCm ?? '',
      setValue: (_row, value) => ({ elevationCm: value ?? null }),
    },
    {
      key: 'hasFreezer',
      header: 'Freezer',
      width: '90px',
      getValue: (row) => !!row.hasFreezer,
      setValue: (_row, value) => ({ hasFreezer: value }),
    },
    {
      key: 'hasLock',
      header: 'Lock',
      width: '80px',
      getValue: (row) => !!row.hasLock,
      setValue: (_row, value) => ({ hasLock: value }),
    },
    {
      key: 'boxCount',
      header: 'Boxes',
      width: '80px',
      readOnly: true,
      getValue: (row) => row.boxes?.length ?? 0,
      render: (value) => String(value ?? 0),
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '200px',
      getValue: (row) => row.notes || '',
      setValue: (_row, value) => ({ notes: value || null }),
    },
    {
      key: 'isActive',
      header: 'Active',
      width: '80px',
      getValue: (row) => !!row.isActive,
      setValue: (_row, value) => ({ isActive: value }),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      // The shelves PUT handler intentionally omits floorId/rackId so a shelf
      // cannot be re-parented without the placement checks the create path runs.
      rejectImmutableChanges(changes, [
        { key: 'floorId', message: 'A shelf cannot change floor here — recreate it on the target floor.' },
        { key: 'rackId', message: 'A shelf cannot change rack here — recreate it on the target rack.' },
      ]);
      const response = await shelvesApi.update(row.id, changes);
      setShelves(current => current.map(shelf => (
        shelf.id === row.id ? mergeUpdatedRow(shelf, changes, response) : shelf
      )));
    } catch (err) {
      console.error('Failed to save shelf:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await shelvesApi.delete(row.id);
      setShelves(current => current.filter(shelf => shelf.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete shelf:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await shelvesApi.create({ ...data, rackId: data.rackId || null });
      setShelves(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
    } catch (err) {
      console.error('Failed to create shelf:', err);
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
            <h1 className="page-title">📚 Shelves Spreadsheet</h1>
            <p className="page-subtitle">Manage storage shelves with rack placement, dimensions and capacity flags</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={shelves}
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
