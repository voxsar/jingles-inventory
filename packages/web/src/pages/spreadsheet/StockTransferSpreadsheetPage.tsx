import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stockTransfersApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

const STATUS_OPTIONS = ['Draft', 'Pending', 'Approved', 'InTransit', 'Completed', 'Cancelled']
  .map(status => ({ value: status, label: status }));

/**
 * Transfers have no generic update endpoint on purpose — moving one forward
 * moves stock. Editing Status dispatches to the same approve/complete/cancel
 * endpoints the Stock Transfers page uses, so the server-side rules still run;
 * these mirror them only to fail fast with the same wording.
 */
const TRANSITIONS: Record<string, { from: string[]; apply: (id: string) => Promise<any>; error: string }> = {
  Approved: {
    from: ['Draft', 'Pending'],
    apply: (id) => stockTransfersApi.approve(id),
    error: 'Only Draft or Pending transfers can be approved',
  },
  Completed: {
    from: ['Approved', 'InTransit'],
    apply: (id) => stockTransfersApi.complete(id),
    error: 'Only Approved or InTransit transfers can be completed',
  },
  Cancelled: {
    from: ['Draft', 'Pending', 'Approved', 'InTransit', 'Cancelled'],
    apply: (id) => stockTransfersApi.cancel(id),
    error: 'Cannot cancel a completed transfer',
  },
};

export default function StockTransferSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const {
    rows: transfers,
    setRows: setTransfers,
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
      options: STATUS_OPTIONS,
      width: '120px',
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

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const nextStatus = changes.status;
      if (nextStatus === undefined) {
        throw new Error('Only Status can be changed here — edit the rest from the Stock Transfers page.');
      }
      if (nextStatus === row.status) return;

      const transition = TRANSITIONS[nextStatus];
      if (!transition) {
        throw new Error(`A transfer cannot be moved to ${nextStatus} here — it is set when the transfer is created.`);
      }
      if (!transition.from.includes(row.status)) {
        throw new Error(transition.error);
      }

      const response = await transition.apply(row.id);
      setTransfers(current => current.map(transfer => (
        transfer.id === row.id ? mergeUpdatedRow(transfer, changes, response) : transfer
      )));
    } catch (err) {
      console.error('Failed to change transfer status:', err);
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
            <h1 className="page-title">🔄 Stock Transfers Spreadsheet</h1>
            <p className="page-subtitle">
              Review transfers and move them through approve, complete and cancel. Creating one needs
              its lines, so that stays on the Stock Transfers page.
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
          onSave={handleSave}
          onLoadMore={loadMoreRows}
          onSearchChange={setSearchTerm}
          getRowKey={(row) => row.id}
          canAdd={false}
          canDelete={false}
        />
      </div>

      <div style={{ marginTop: '16px' }}>
        <button className="btn-secondary" onClick={() => navigate('/stock-transfers')}>
          Open Stock Transfers to create a transfer →
        </button>
      </div>
    </div>
  );
}
