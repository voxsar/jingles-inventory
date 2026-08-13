import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { batchesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

const MARGIN_TYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'percentage', label: 'Percentage' },
];

const toDateInput = (value: any) => (value ? String(value).slice(0, 10) : '');

export default function BatchSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    rows: batches,
    setRows: setBatches,
    isLoading,
    isLoadingMore,
    totalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(batchesApi.list, { searchTerm });

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'batchNumber',
      header: 'Batch #',
      width: '160px',
      readOnly: true,
      render: (value) => String(value || ''),
    },
    {
      key: 'skuName',
      header: 'Product',
      width: '220px',
      readOnly: true,
      getValue: (row) => row.sku?.name ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'variantName',
      header: 'Variant',
      width: '150px',
      readOnly: true,
      getValue: (row) => row.variant?.variantCode ?? row.variant?.name ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'vendorName',
      header: 'Supplier',
      width: '180px',
      readOnly: true,
      getValue: (row) => row.vendor?.name ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'costPrice',
      header: 'Cost',
      width: '110px',
      getValue: (row) => row.costPrice ?? '',
      setValue: (_row, value) => ({ costPrice: value ?? null }),
    },
    {
      key: 'sellingPrice',
      header: 'Selling',
      width: '110px',
      getValue: (row) => row.sellingPrice ?? '',
      setValue: (_row, value) => ({ sellingPrice: value ?? null }),
    },
    {
      key: 'wholesalePrice',
      header: 'Wholesale',
      width: '110px',
      getValue: (row) => row.wholesalePrice ?? '',
      setValue: (_row, value) => ({ wholesalePrice: value ?? null }),
    },
    {
      key: 'bulkPrice',
      header: 'Bulk',
      width: '110px',
      getValue: (row) => row.bulkPrice ?? '',
      setValue: (_row, value) => ({ bulkPrice: value ?? null }),
    },
    {
      key: 'currency',
      header: 'Currency',
      width: '90px',
      getValue: (row) => row.currency || 'LKR',
      setValue: (_row, value) => ({ currency: value || 'LKR' }),
    },
    {
      key: 'marginType',
      header: 'Margin Type',
      options: MARGIN_TYPE_OPTIONS,
      width: '140px',
      getValue: (row) => row.marginType ?? '',
      setValue: (_row, value) => ({ marginType: value || null }),
    },
    {
      key: 'marginValue',
      header: 'Margin',
      width: '100px',
      getValue: (row) => row.marginValue ?? '',
      setValue: (_row, value) => ({ marginValue: value ?? null }),
    },
    {
      key: 'expiryDate',
      header: 'Expiry',
      width: '120px',
      getValue: (row) => toDateInput(row.expiryDate),
      setValue: (_row, value) => ({ expiryDate: value || null }),
    },
    {
      key: 'manufacturingDate',
      header: 'Manufactured',
      width: '130px',
      getValue: (row) => toDateInput(row.manufacturingDate),
      setValue: (_row, value) => ({ manufacturingDate: value || null }),
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '220px',
      getValue: (row) => row.notes || '',
      setValue: (_row, value) => ({ notes: value || null }),
    },
    {
      key: 'isActive',
      header: 'Active',
      width: '80px',
      getValue: (row) => !!row.isActive,
      setValue: (_row, value) => ({ isActive: value }),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = await batchesApi.update(row.id, changes);
      setBatches(current => current.map(batch => (
        batch.id === row.id ? mergeUpdatedRow(batch, changes, response) : batch
      )));
    } catch (err) {
      console.error('Failed to save batch:', err);
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
            <h1 className="page-title">🏷️ Batches Spreadsheet</h1>
            <p className="page-subtitle">
              Edit batch pricing, margins and expiry dates. Batches are created by goods receipt, so
              they cannot be added or removed here.
            </p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={batches}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onSave={handleSave}
          onLoadMore={loadMoreRows}
          onSearchChange={setSearchTerm}
          getRowKey={(row) => row.id}
          canAdd={false}
          canDelete={false}
        />
      </div>
    </div>
  );
}
