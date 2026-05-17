import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { categoriesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { buildCreatedRow, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function CategorySpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    rows: categories,
    setRows: setCategories,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(categoriesApi.list, { searchTerm });

  const parentOptions = categories
    .filter(c => !c.parentId)
    .map(c => ({ value: c.id, label: c.name }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'name',
      header: 'Category Name',
      
      width: '200px',
      
    },
    {
      key: 'slug',
      header: 'Slug',
      width: '160px',
    },
    {
      key: 'description',
      header: 'Description',
      
      width: '260px',
      getValue: (row) => row.description || '',
      setValue: (row, value) => ({ description: value || null }),
    },
    {
      key: 'parentId',
      header: 'Parent Category',
      options: parentOptions,
      width: '180px',
      getValue: (row) => row.parentId || '',
      setValue: (row, value) => ({ parentId: value || null }),
      render: (value, row) => {
        const parent = categories.find(c => c.id === row.parentId);
        return parent?.name || '—';
      },
    },
    {
      key: 'sortOrder',
      header: 'Sort Order',
      
      width: '100px',
      getValue: (row) => row.sortOrder ?? 0,
      setValue: (row, value) => ({ sortOrder: value ?? 0 }),
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
      readOnly: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = await categoriesApi.update(row.id, changes);
      setCategories(current => current.map(category => (
        category.id === row.id ? mergeUpdatedRow(category, changes, response) : category
      )));
    } catch (err) {
      console.error('Failed to save category:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await categoriesApi.delete(row.id);
      setCategories(current => current.filter(category => category.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete category:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await categoriesApi.create(data);
      setCategories(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
    } catch (err) {
      console.error('Failed to create category:', err);
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
            <h1 className="page-title">🗂️ Categories Spreadsheet</h1>
            <p className="page-subtitle">Manage product categories with hierarchical parent selection</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={categories}
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
