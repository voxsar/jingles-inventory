import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { racksApi, floorsApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import {
  buildCreatedRow,
  fetchAllSpreadsheetRows,
  mergeUpdatedRow,
  rejectImmutableChanges,
  useLazySpreadsheetRows,
} from './spreadsheetPageUtils';

export default function RackSpreadsheetPage() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState<any[]>([]);
  const {
    rows: racks,
    setRows: setRacks,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(racksApi.list, { searchParamName: '' });

  useEffect(() => {
    const loadFloors = async () => {
      try {
        const floorData = await fetchAllSpreadsheetRows<any>(floorsApi.list);
        setFloors(Array.isArray(floorData) ? floorData : []);
      } catch (err) {
        console.error(err);
      }
    };

    loadFloors();
  }, []);

  const floorOptions = floors.map(floor => ({
    value: floor.id,
    label: floor.branch?.name ? `${floor.branch.name} — ${floor.name}` : floor.name,
  }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'code',
      header: 'Rack Code',
      width: '120px',
      validate: (value) => (value ? null : 'Rack code is required'),
    },
    {
      key: 'name',
      header: 'Rack Name',
      width: '180px',
      validate: (value) => (value ? null : 'Rack name is required'),
    },
    {
      key: 'floorId',
      header: 'Floor',
      options: floorOptions,
      width: '220px',
      validate: (value) => (value ? null : 'Floor is required'),
    },
    {
      key: 'widthCm',
      header: 'Width (cm)',
      width: '110px',
      getValue: (row) => row.widthCm ?? '',
      setValue: (_row, value) => ({ widthCm: value ?? null }),
    },
    {
      key: 'heightCm',
      header: 'Height (cm)',
      width: '110px',
      getValue: (row) => row.heightCm ?? '',
      setValue: (_row, value) => ({ heightCm: value ?? null }),
    },
    {
      key: 'depthCm',
      header: 'Depth (cm)',
      width: '110px',
      getValue: (row) => row.depthCm ?? '',
      setValue: (_row, value) => ({ depthCm: value ?? null }),
    },
    {
      key: 'shelfCount',
      header: 'Shelves',
      width: '90px',
      readOnly: true,
      getValue: (row) => row.shelves?.length ?? 0,
      render: (value) => String(value ?? 0),
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '220px',
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
      // Rack placement is validated against the floor it already sits on, so the
      // API deliberately does not re-parent racks. Reposition from Warehouse 3D.
      rejectImmutableChanges(changes, [
        { key: 'floorId', message: 'A rack cannot change floor here — recreate it on the target floor.' },
      ]);
      const response = await racksApi.update(row.id, changes);
      setRacks(current => current.map(rack => (
        rack.id === row.id ? mergeUpdatedRow(rack, changes, response) : rack
      )));
    } catch (err) {
      console.error('Failed to save rack:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await racksApi.delete(row.id);
      setRacks(current => current.filter(rack => rack.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete rack:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await racksApi.create(data);
      setRacks(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
    } catch (err) {
      console.error('Failed to create rack:', err);
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
            <h1 className="page-title">📐 Racks Spreadsheet</h1>
            <p className="page-subtitle">Manage storage racks, their floor assignment and physical dimensions</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={racks}
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
