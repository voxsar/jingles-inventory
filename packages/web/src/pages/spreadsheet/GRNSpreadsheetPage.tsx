import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, floorsApi } from '../../api/client';
import { GRNStatus } from '@jingles/shared';
import SpreadsheetTable, { SpreadsheetColumn } from '../../components/SpreadsheetTable';
import Pagination from '../../components/Pagination';

const PAGE_SIZE = 50;

export default function GRNSpreadsheetPage() {
  const navigate = useNavigate();
  const [grns, setGrns] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [grnRes, vendorRes, floorRes] = await Promise.all([
        grnsApi.list({ page: String(page), pageSize: String(pageSize) }),
        vendorsApi.list(),
        floorsApi.list(),
      ]);

      const grnData = grnRes.data?.data?.items ?? grnRes.data?.data ?? grnRes.data ?? [];
      setGrns(Array.isArray(grnData) ? grnData : []);
      setTotal(grnRes.data?.data?.total ?? 0);
      setTotalPages(grnRes.data?.data?.totalPages ?? 1);

      const vendorData = vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? [];
      setVendors(Array.isArray(vendorData) ? vendorData : []);

      const floorData = floorRes.data?.data?.items ?? floorRes.data?.data ?? floorRes.data ?? [];
      setFloors(Array.isArray(floorData) ? floorData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize]);

  const vendorOptions = vendors.map(v => ({ value: v.id, label: v.name }));
  const floorOptions = floors.map(f => ({ value: f.id, label: `${f.name} (${f.branch?.name || ''})` }));
  const statusOptions = Object.values(GRNStatus).map(s => ({ value: s, label: s }));

  const columns: SpreadsheetColumn<any>[] = [
    {
      key: 'invoiceReference',
      header: 'Invoice Ref',
      type: 'text',
      width: '140px',
      render: (row) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.invoiceReference || '—'}</span>,
    },
    {
      key: 'supplierId',
      header: 'Supplier',
      type: 'select',
      options: vendorOptions,
      width: '180px',
      required: true,
      render: (row) => {
        const vendor = vendors.find(v => v.id === row.supplierId);
        return <span>{vendor?.name || '—'}</span>;
      },
    },
    {
      key: 'floorId',
      header: 'Floor',
      type: 'select',
      options: floorOptions,
      width: '180px',
      getValue: (row) => row.floorId || '',
      setValue: (row, value) => ({ floorId: value || null }),
      render: (row) => {
        const floor = floors.find(f => f.id === row.floorId);
        return <span>{floor?.name || '—'}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      type: 'select',
      options: statusOptions,
      width: '140px',
      required: true,
      render: (row) => {
        const statusColors: Record<string, string> = {
          Draft: '#6b7280',
          Submitted: '#3b82f6',
          PartiallyInspected: '#f59e0b',
          FullyInspected: '#10b981',
          Closed: '#6b7280',
        };
        return (
          <span style={{
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            backgroundColor: statusColors[row.status] || '#6b7280',
            color: 'white'
          }}>
            {row.status}
          </span>
        );
      },
    },
    {
      key: 'expectedDeliveryDate',
      header: 'Expected Date',
      type: 'date',
      width: '120px',
      getValue: (row) => row.expectedDeliveryDate || '',
      setValue: (row, value) => ({ expectedDeliveryDate: value || null }),
      render: (row, isEditing) => {
        if (isEditing || !row.expectedDeliveryDate) return null;
        return <span style={{ fontSize: '11px' }}>{new Date(row.expectedDeliveryDate).toLocaleDateString()}</span>;
      },
    },
    {
      key: 'actualDeliveryDate',
      header: 'Actual Date',
      type: 'date',
      width: '120px',
      getValue: (row) => row.actualDeliveryDate || '',
      setValue: (row, value) => ({ actualDeliveryDate: value || null }),
      render: (row, isEditing) => {
        if (isEditing || !row.actualDeliveryDate) return null;
        return <span style={{ fontSize: '11px' }}>{new Date(row.actualDeliveryDate).toLocaleDateString()}</span>;
      },
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
      await grnsApi.update(row.id, changes);
      await loadData();
    } catch (err) {
      console.error('Failed to save GRN:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await grnsApi.delete(row.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete GRN:', err);
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
            <h1 className="page-title">📋 GRNs Spreadsheet</h1>
            <p className="page-subtitle">Manage Goods Receipt Notes with supplier and floor selection</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <SpreadsheetTable
          columns={columns}
          data={grns}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          getRowKey={(row) => row.id}
          canAdd={false}
          emptyMessage="No GRNs found"
          emptyIcon="📋"
        />
      </div>

      {!isLoading && grns.length > 0 && (
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
