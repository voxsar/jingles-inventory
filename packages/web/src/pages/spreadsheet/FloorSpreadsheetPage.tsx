import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { floorsApi, branchesApi } from '../../api/client';
import SpreadsheetTable, { SpreadsheetColumn } from '../../components/SpreadsheetTable';
import Pagination from '../../components/Pagination';

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

  const columns: SpreadsheetColumn<any>[] = [
    {
      key: 'code',
      header: 'Floor Code',
      type: 'text',
      width: '120px',
      required: true,
      render: (row) => <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600 }}>{row.code}</span>,
    },
    {
      key: 'name',
      header: 'Floor Name',
      type: 'text',
      width: '180px',
      required: true,
    },
    {
      key: 'branchId',
      header: 'Branch',
      type: 'select',
      options: branchOptions,
      width: '180px',
      required: true,
      render: (row) => {
        const branch = branches.find(b => b.id === row.branchId);
        return <span>{branch?.name || '—'}</span>;
      },
    },
    {
      key: 'lengthMeters',
      header: 'Length (m)',
      type: 'number',
      width: '100px',
      getValue: (row) => row.lengthMeters || '',
      setValue: (row, value) => ({ lengthMeters: value || null }),
    },
    {
      key: 'widthMeters',
      header: 'Width (m)',
      type: 'number',
      width: '100px',
      getValue: (row) => row.widthMeters || '',
      setValue: (row, value) => ({ widthMeters: value || null }),
    },
    {
      key: 'isActive',
      header: 'Active',
      type: 'boolean',
      width: '80px',
      getValue: (row) => !!row.isActive,
      setValue: (row, value) => ({ isActive: value }),
    },
    {
      key: 'createdAt',
      header: 'Created',
      type: 'readonly',
      width: '110px',
      render: (row) => <span style={{ fontSize: '11px' }}>{new Date(row.createdAt).toLocaleDateString()}</span>,
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      await floorsApi.update(row.id, changes);
      await loadData();
    } catch (err) {
      console.error('Failed to save floor:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await floorsApi.delete(row.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete floor:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      await floorsApi.create(data);
      await loadData();
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
        <SpreadsheetTable
          columns={columns}
          data={floors}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
          emptyMessage="No floors found"
          emptyIcon="🏗️"
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
