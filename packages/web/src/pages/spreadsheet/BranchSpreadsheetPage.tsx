import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { branchesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { buildCreatedRow, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function BranchSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    rows: branches,
    setRows: setBranches,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(branchesApi.list, { searchTerm });

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
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete branch:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await branchesApi.create(data);
      setBranches(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
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
