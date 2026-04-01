import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { categoriesApi } from '../../api/client';
import SpreadsheetTable, { SpreadsheetColumn } from '../../components/SpreadsheetTable';
import Pagination from '../../components/Pagination';

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

  const columns: SpreadsheetColumn<any>[] = [
    {
      key: 'name',
      header: 'Category Name',
      type: 'text',
      width: '200px',
      required: true,
    },
    {
      key: 'slug',
      header: 'Slug',
      type: 'text',
      width: '160px',
      required: true,
      render: (row) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.slug}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      type: 'text',
      width: '260px',
      getValue: (row) => row.description || '',
      setValue: (row, value) => ({ description: value || null }),
    },
    {
      key: 'parentId',
      header: 'Parent Category',
      type: 'select',
      options: parentOptions,
      width: '180px',
      getValue: (row) => row.parentId || '',
      setValue: (row, value) => ({ parentId: value || null }),
      render: (row) => {
        const parent = categories.find(c => c.id === row.parentId);
        return <span>{parent?.name || '—'}</span>;
      },
    },
    {
      key: 'sortOrder',
      header: 'Sort Order',
      type: 'number',
      width: '100px',
      getValue: (row) => row.sortOrder ?? 0,
      setValue: (row, value) => ({ sortOrder: value ?? 0 }),
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
      await categoriesApi.update(row.id, changes);
      await loadData();
    } catch (err) {
      console.error('Failed to save category:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await categoriesApi.delete(row.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete category:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      await categoriesApi.create(data);
      await loadData();
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
        <SpreadsheetTable
          columns={columns}
          data={categories}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
          emptyMessage="No categories found"
          emptyIcon="🗂️"
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
