import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { categoriesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import Pagination from '../../components/Pagination';
import { buildCreatedRow, mergeUpdatedRow } from './spreadsheetPageUtils';

const PAGE_SIZE = 50;

export default function CategorySpreadsheetPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await categoriesApi.list({ page: String(page), pageSize: String(pageSize) });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setCategories(Array.isArray(data) ? data : []);
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
      setTotal(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete category:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await categoriesApi.create(data);
      setCategories(current => [buildCreatedRow(data, response), ...current].slice(0, pageSize));
      setTotal(current => current + 1);
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
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
        />
      </div>

      {!isLoading && categories.length > 0 && (
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
