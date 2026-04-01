import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../../api/client';
import { UnitType } from '@jingles/shared';
import SpreadsheetTable, { SpreadsheetColumn } from '../../components/SpreadsheetTable';
import Pagination from '../../components/Pagination';

const PAGE_SIZE = 50;

export default function UnitSpreadsheetPage() {
  const navigate = useNavigate();
  const [units, setUnits] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await settingsApi.listUnits({ page: String(page), pageSize: String(pageSize) });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setUnits(Array.isArray(data) ? data : []);
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

  const typeOptions = Object.values(UnitType).map(t => ({ value: t, label: t }));
  const baseUnitOptions = units.map(u => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }));

  const columns: SpreadsheetColumn<any>[] = [
    {
      key: 'name',
      header: 'Unit Name',
      type: 'text',
      width: '160px',
      required: true,
    },
    {
      key: 'abbreviation',
      header: 'Abbreviation',
      type: 'text',
      width: '120px',
      required: true,
      render: (row) => <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600 }}>{row.abbreviation}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      type: 'select',
      options: typeOptions,
      width: '120px',
      required: true,
    },
    {
      key: 'baseUnit',
      header: 'Base Unit',
      type: 'select',
      options: baseUnitOptions,
      width: '160px',
      getValue: (row) => row.baseUnit || '',
      setValue: (row, value) => ({ baseUnit: value || null }),
      render: (row) => {
        const base = units.find(u => u.id === row.baseUnit);
        return <span>{base ? `${base.name} (${base.abbreviation})` : '—'}</span>;
      },
    },
    {
      key: 'conversionFactor',
      header: 'Conversion Factor',
      type: 'number',
      width: '140px',
      getValue: (row) => row.conversionFactor || '',
      setValue: (row, value) => ({ conversionFactor: value || null }),
    },
    {
      key: 'isSystem',
      header: 'System',
      type: 'boolean',
      width: '80px',
      editable: false,
      getValue: (row) => !!row.isSystem,
      render: (row) => <span>{row.isSystem ? '✓' : '—'}</span>,
    },
    {
      key: 'isActive',
      header: 'Active',
      type: 'boolean',
      width: '80px',
      getValue: (row) => !!row.isActive,
      setValue: (row, value) => ({ isActive: value }),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      await settingsApi.updateUnit(row.id, changes);
      await loadData();
    } catch (err) {
      console.error('Failed to save unit:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await settingsApi.deleteUnit(row.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete unit:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      await settingsApi.createUnit(data);
      await loadData();
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
        <SpreadsheetTable
          columns={columns}
          data={units}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
          emptyMessage="No units found"
          emptyIcon="📏"
        />
      </div>

      {!isLoading && units.length > 0 && (
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
