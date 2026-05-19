import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../../api/client';
import { UnitType } from '@jingles/shared/enums';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { buildCreatedRow, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function UnitSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    rows: units,
    setRows: setUnits,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(settingsApi.listUnits, { searchTerm });

  const typeOptions = Object.values(UnitType).map(t => ({ value: t, label: t }));
  const baseUnitOptions = units.map(u => ({ value: u.name, label: `${u.name} (${u.abbreviation})` }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'name',
      header: 'Unit Name',
      
      width: '160px',
      
    },
    {
      key: 'abbreviation',
      header: 'Abbreviation',
      
      width: '120px',
      
      render: (value) => String(value || ""),
    },
    {
      key: 'type',
      header: 'Type',
      
      options: typeOptions,
      width: '120px',
      
    },
    {
      key: 'baseUnit',
      header: 'Base Unit',
      
      options: baseUnitOptions,
      width: '160px',
      getValue: (row) => row.baseUnit || '',
      setValue: (row, value) => ({ baseUnit: value || null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'conversionFactor',
      header: 'Conversion Factor',
      
      width: '140px',
      getValue: (row) => row.conversionFactor || '',
      setValue: (row, value) => ({ conversionFactor: value || null }),
    },
    {
      key: 'isSystem',
      header: 'System',
      width: '80px',
      getValue: (row) => !!row.isSystem,
      render: (value) => value ? '✓' : '—',
    },
    {
      key: 'isActive',
      header: 'Active',
      
      width: '80px',
      getValue: (row) => !!row.isActive,
      setValue: (row, value) => ({ isActive: value }),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = await settingsApi.updateUnit(row.id, changes);
      setUnits(current => current.map(unit => (
        unit.id === row.id ? mergeUpdatedRow(unit, changes, response) : unit
      )));
    } catch (err) {
      console.error('Failed to save unit:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await settingsApi.deleteUnit(row.id);
      setUnits(current => current.filter(unit => unit.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete unit:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await settingsApi.createUnit(data);
      setUnits(current => [buildCreatedRow(data, response), ...current]);
      setTotalRows(current => current + 1);
    } catch (err) {
      console.error('Failed to create unit:', err);
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
            <h1 className="page-title">📏 Units of Measure Spreadsheet</h1>
            <p className="page-subtitle">Manage measurement units with conversion factors</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={units}
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
