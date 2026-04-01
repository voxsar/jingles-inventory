import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tagsApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';

export default function TagSpreadsheetPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await tagsApi.list();
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setTags(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'name',
      header: 'Tag Name',
      width: '200px',
    },
    {
      key: 'color',
      header: 'Color',
      width: '140px',
      getValue: (row) => row.color || '',
      setValue: (row, value) => ({ color: value || null }),
      render: (value) => value || '—',
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: '120px',
      readOnly: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      await tagsApi.update(row.id, changes);
      await loadData();
    } catch (err) {
      console.error('Failed to save tag:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await tagsApi.delete(row.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete tag:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      await tagsApi.create(data);
      await loadData();
    } catch (err) {
      console.error('Failed to create tag:', err);
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
            <h1 className="page-title">🏷️ Tags Spreadsheet</h1>
            <p className="page-subtitle">Manage product tags with color codes</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={tags}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
        />
      </div>
    </div>
  );
}
