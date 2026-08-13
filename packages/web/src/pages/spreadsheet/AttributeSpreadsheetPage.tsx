import { useNavigate } from 'react-router-dom';
import { attributesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { buildCreatedRow, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

// Mirrors VALID_TYPES in packages/backend/src/routes/attributes.ts
const TYPE_OPTIONS = ['dropdown', 'text', 'numeric', 'boolean', 'color']
  .map(type => ({ value: type, label: type }));

export default function AttributeSpreadsheetPage() {
  const navigate = useNavigate();
  const {
    rows: attributes,
    setRows: setAttributes,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(attributesApi.list, { searchParamName: '' });

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'name',
      header: 'Attribute Name',
      width: '220px',
      validate: (value) => (value ? null : 'Attribute name is required'),
    },
    {
      key: 'type',
      header: 'Type',
      options: TYPE_OPTIONS,
      width: '140px',
      validate: (value) => (value ? null : 'Type is required'),
    },
    {
      key: 'sortOrder',
      header: 'Sort Order',
      width: '110px',
      getValue: (row) => row.sortOrder ?? 0,
      setValue: (_row, value) => ({ sortOrder: value ?? 0 }),
    },
    {
      key: 'valueCount',
      header: 'Values',
      width: '90px',
      readOnly: true,
      getValue: (row) => row.values?.length ?? 0,
      render: (value) => String(value ?? 0),
    },
    {
      key: 'valuePreview',
      header: 'Value Options',
      width: '320px',
      readOnly: true,
      getValue: (row) => (row.values ?? []).map((entry: any) => entry.displayName).join(', '),
      render: (value) => String(value || '—'),
    },
    {
      key: 'isActive',
      header: 'Active',
      width: '80px',
      getValue: (row) => !!row.isActive,
      setValue: (_row, value) => ({ isActive: value }),
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: '110px',
      readOnly: true,
      render: (value) => (value ? new Date(value).toLocaleDateString() : '—'),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = await attributesApi.update(row.id, changes);
      setAttributes(current => current.map(attribute => (
        attribute.id === row.id ? mergeUpdatedRow(attribute, changes, response) : attribute
      )));
    } catch (err) {
      console.error('Failed to save attribute:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await attributesApi.delete(row.id);
      setAttributes(current => current.filter(attribute => attribute.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete attribute:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await attributesApi.create(data);
      setAttributes(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
    } catch (err) {
      console.error('Failed to create attribute:', err);
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
            <h1 className="page-title">🔖 Attributes Spreadsheet</h1>
            <p className="page-subtitle">
              Manage product attributes used to build variants. Value options are listed read-only —
              edit them from Settings so existing variant links stay intact.
            </p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={attributes}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          onLoadMore={loadMoreRows}
          getRowKey={(row) => row.id}
        />
      </div>
    </div>
  );
}
