import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../../api/client';
import SpreadsheetTable, { SpreadsheetColumn } from '../../components/SpreadsheetTable';

export default function TagSpreadsheetPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await settingsApi.listTags();
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

  const columns: SpreadsheetColumn<any>[] = [
    {
      key: 'name',
      header: 'Tag Name',
      type: 'text',
      width: '200px',
      required: true,
    },
    {
      key: 'color',
      header: 'Color',
      type: 'text',
      width: '140px',
      getValue: (row) => row.color || '',
      setValue: (row, value) => ({ color: value || null }),
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {row.color && (
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              backgroundColor: row.color,
              border: '1px solid #e1e3e5'
            }} />
          )}
          <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.color || '—'}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      type: 'readonly',
      width: '120px',
      render: (row) => <span style={{ fontSize: '11px' }}>{new Date(row.createdAt).toLocaleDateString()}</span>,
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      await settingsApi.updateTag(row.id, changes);
      await loadData();
    } catch (err) {
      console.error('Failed to save tag:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await settingsApi.deleteTag(row.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete tag:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      await settingsApi.createTag(data);
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
        <SpreadsheetTable
          columns={columns}
          data={tags}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
          emptyMessage="No tags found"
          emptyIcon="🏷️"
        />
      </div>
    </div>
  );
}
