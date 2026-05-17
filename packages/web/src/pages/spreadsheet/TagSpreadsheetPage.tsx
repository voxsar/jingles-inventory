import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tagsApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { buildCreatedRow, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function TagSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    rows: tags,
    setRows: setTags,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(tagsApi.list, { searchTerm });

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
      const response = await tagsApi.update(row.id, changes);
      setTags(current => current.map(tag => (
        tag.id === row.id ? mergeUpdatedRow(tag, changes, response) : tag
      )));
    } catch (err) {
      console.error('Failed to save tag:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await tagsApi.delete(row.id);
      setTags(current => current.filter(tag => tag.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete tag:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await tagsApi.create(data);
      setTags(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
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
