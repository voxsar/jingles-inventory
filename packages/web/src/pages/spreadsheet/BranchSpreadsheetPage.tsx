import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { branchesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import Pagination from '../../components/Pagination';
import { buildCreatedRow, mergeUpdatedRow } from './spreadsheetPageUtils';

const PAGE_SIZE = 50;

export default function BranchSpreadsheetPage() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await branchesApi.list({ page: String(page), pageSize: String(pageSize) });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setBranches(Array.isArray(data) ? data : []);
      setTotal(res.data?.data?.total ?? 0);
      setTotalPages(res.data?.data?.totalPages ?? 1);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize]);

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'code',
      header: 'Branch Code',
      
      width: '120px',
      
      render: (value) => String(value || ""),
    },
    {
      key: 'name',
      header: 'Branch Name',
      
      width: '200px',
      
    },
    {
      key: 'address',
      header: 'Address',
      
      width: '260px',
      getValue: (row) => row.address || '',
      setValue: (row, value) => ({ address: value || null }),
    },
    {
      key: 'phone',
      header: 'Phone',
      
      width: '140px',
      getValue: (row) => row.phone || '',
      setValue: (row, value) => ({ phone: value || null }),
    },
    {
      key: 'email',
      header: 'Email',
      
      width: '180px',
      getValue: (row) => row.email || '',
      setValue: (row, value) => ({ email: value || null }),
      validate: (value) => {
        if (value && !value.includes('@')) return 'Invalid email format';
        return null;
      },
    },
    {
      key: 'isDefault',
      header: 'Default',
      
      width: '80px',
      getValue: (row) => !!row.isDefault,
      setValue: (row, value) => ({ isDefault: value }),
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
      const response = await branchesApi.update(row.id, changes);
      setBranches(current => current.map(branch => (
        branch.id === row.id ? mergeUpdatedRow(branch, changes, response) : branch
      )));
    } catch (err) {
      console.error('Failed to save branch:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await branchesApi.delete(row.id);
      setBranches(current => current.filter(branch => branch.id !== row.id));
      setTotal(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete branch:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await branchesApi.create(data);
      setBranches(current => [buildCreatedRow(data, response), ...current].slice(0, pageSize));
      setTotal(current => current + 1);
    } catch (err) {
      console.error('Failed to create branch:', err);
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
            <h1 className="page-title">🏢 Branches Spreadsheet</h1>
            <p className="page-subtitle">Manage warehouse branches with inline editing</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={branches}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
        />
      </div>

      {/* Pagination */}
      {!isLoading && branches.length > 0 && (
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
