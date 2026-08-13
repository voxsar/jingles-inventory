import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stockTransfersApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function StockTransferSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    rows: transfers,
    isLoading,
    isLoadingMore,
    totalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(stockTransfersApi.list, { searchTerm });

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'referenceNumber',
      header: 'Reference',
      width: '160px',
      readOnly: true,
      render: (value) => String(value || ''),
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      readOnly: true,
      render: (value) => String(value || ''),
    },
    {
      key: 'fromBranchName',
      header: 'From Branch',
      width: '180px',
      readOnly: true,
      getValue: (row) => row.fromBranch?.name ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'fromFloorName',
      header: 'From Floor',
      width: '160px',
      readOnly: true,
      getValue: (row) => row.fromFloor?.name ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'toBranchName',
      header: 'To Branch',
      width: '180px',
      readOnly: true,
      getValue: (row) => row.toBranch?.name ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'toFloorName',
      header: 'To Floor',
      width: '160px',
      readOnly: true,
      getValue: (row) => row.toFloor?.name ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'lineCount',
      header: 'Lines',
      width: '80px',
      readOnly: true,
      getValue: (row) => row.lines?.length ?? 0,
      render: (value) => String(value ?? 0),
    },
    {
      key: 'requesterEmail',
      header: 'Requested By',
      width: '220px',
      readOnly: true,
      getValue: (row) => row.requester?.email ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'requestedAt',
      header: 'Requested',
      width: '120px',
      readOnly: true,
      render: (value) => (value ? new Date(value).toLocaleDateString() : '—'),
    },
    {
      key: 'approvedAt',
      header: 'Approved',
      width: '120px',
      readOnly: true,
      render: (value) => (value ? new Date(value).toLocaleDateString() : '—'),
    },
    {
      key: 'completedAt',
      header: 'Completed',
      width: '120px',
      readOnly: true,
      render: (value) => (value ? new Date(value).toLocaleDateString() : '—'),
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '240px',
      readOnly: true,
      render: (value) => String(value || '—'),
    },
  ];

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
            <h1 className="page-title">🔄 Stock Transfers Spreadsheet</h1>
            <p className="page-subtitle">
              Read-only view for reviewing and exporting transfers. Approving, completing and cancelling
              move stock, so those stay on the Stock Transfers page where the state machine runs.
            </p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={transfers}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onLoadMore={loadMoreRows}
          onSearchChange={setSearchTerm}
          getRowKey={(row) => row.id}
          canAdd={false}
          canEdit={false}
          canDelete={false}
        />
      </div>

      <div style={{ marginTop: '16px' }}>
        <button className="btn-secondary" onClick={() => navigate('/stock-transfers')}>
          Open Stock Transfers to approve or complete →
        </button>
      </div>
    </div>
  );
}
