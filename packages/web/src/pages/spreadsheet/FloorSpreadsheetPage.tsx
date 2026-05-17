import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { floorsApi, branchesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { buildCreatedRow, fetchAllSpreadsheetRows, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function FloorSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const {
    rows: floors,
    setRows: setFloors,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(floorsApi.list, { searchTerm });

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const branchData = await fetchAllSpreadsheetRows<any>(branchesApi.list);
        setBranches(Array.isArray(branchData) ? branchData : []);
      } catch (err) {
        console.error(err);
      }
    };

    loadBranches();
  }, []);

  const branchOptions = branches.map(b => ({ value: b.id, label: b.name }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'code',
      header: 'Floor Code',
      
      width: '120px',
      
      render: (value) => String(value || ""),
    },
    {
      key: 'name',
      header: 'Floor Name',
      
      width: '180px',
      
    },
    {
      key: 'branchId',
      header: 'Branch',
      options: branchOptions,
      width: '180px',
      validate: (value) => value ? null : 'Branch is required',
    },
    {
      key: 'floorNumber',
      header: 'Floor #',
      width: '90px',
      getValue: (row) => row.floorNumber ?? '',
      setValue: (_row, value) => ({ floorNumber: value ?? null }),
      validate: (value) => Number(value) >= 1 ? null : 'Floor number is required',
    },
    {
      key: 'length',
      header: 'Length (m)',
      
      width: '100px',
      getValue: (row) => row.length ?? '',
      setValue: (_row, value) => ({ length: value ?? null }),
    },
    {
      key: 'width',
      header: 'Width (m)',
      
      width: '100px',
      getValue: (row) => row.width ?? '',
      setValue: (_row, value) => ({ width: value ?? null }),
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
      setValue: (row, value) => ({ isActive: value }),
    },
    {
      key: 'createdAt',
      header: 'Created',
      
      width: '110px',
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = await floorsApi.update(row.id, changes);
      setFloors(current => current.map(floor => (
        floor.id === row.id ? mergeUpdatedRow(floor, changes, response) : floor
      )));
    } catch (err) {
      console.error('Failed to save floor:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await floorsApi.delete(row.id);
      setFloors(current => current.filter(floor => floor.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete floor:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await floorsApi.create(data);
      setFloors(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
    } catch (err) {
      console.error('Failed to create floor:', err);
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
            <h1 className="page-title">🏗️ Floors Spreadsheet</h1>
            <p className="page-subtitle">Manage warehouse floors with branch assignment and dimensions</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={floors}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          onLoadMore={loadMoreRows}
          onSearchChange={setSearchTerm}
          getRowKey={(row) => row.id}
        />
      </div>
    </div>
  );
}
