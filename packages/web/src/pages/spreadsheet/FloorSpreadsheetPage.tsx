import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { floorsApi, branchesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import Pagination from '../../components/Pagination';
import { buildCreatedRow, mergeUpdatedRow } from './spreadsheetPageUtils';

const PAGE_SIZE = 50;

export default function FloorSpreadsheetPage() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [floorRes, branchRes] = await Promise.all([
        floorsApi.list({ page: String(page), pageSize: String(pageSize) }),
        branchesApi.list(),
      ]);

      const floorData = floorRes.data?.data?.items ?? floorRes.data?.data ?? floorRes.data ?? [];
      setFloors(Array.isArray(floorData) ? floorData : []);
      setTotal(floorRes.data?.data?.total ?? 0);
      setTotalPages(floorRes.data?.data?.totalPages ?? 1);

      const branchData = branchRes.data?.data?.items ?? branchRes.data?.data ?? branchRes.data ?? [];
      setBranches(Array.isArray(branchData) ? branchData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize]);

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
      setTotal(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete floor:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await floorsApi.create(data);
      setFloors(current => [buildCreatedRow(data, response), ...current].slice(0, pageSize));
      setTotal(current => current + 1);
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
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
        />
      </div>

      {!isLoading && floors.length > 0 && (
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
