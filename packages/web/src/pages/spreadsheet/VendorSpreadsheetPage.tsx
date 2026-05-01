import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { vendorsApi } from '../../api/client';
import { VendorType } from '@jingles/shared';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import Pagination from '../../components/Pagination';
import { buildCreatedRow, mergeUpdatedRow } from './spreadsheetPageUtils';

const PAGE_SIZE = 50;

export default function VendorSpreadsheetPage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await vendorsApi.list({ page: String(page), pageSize: String(pageSize) });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setVendors(Array.isArray(data) ? data : []);
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

  const typeOptions = Object.values(VendorType).map(t => ({ value: t, label: t }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'name',
      header: 'Vendor Name',
      
      width: '200px',
      
    },
    {
      key: 'contactEmail',
      header: 'Email',
      
      width: '200px',
      
      validate: (value) => {
        if (value && !value.includes('@')) return 'Invalid email format';
        return null;
      },
    },
    {
      key: 'contactPhone',
      header: 'Phone',
      
      width: '140px',
      getValue: (row) => row.contactPhone || '',
      setValue: (row, value) => ({ contactPhone: value || null }),
    },
    {
      key: 'type',
      header: 'Type',
      
      options: typeOptions,
      width: '120px',
      
    },
    {
      key: 'address',
      header: 'Address',
      
      width: '220px',
      getValue: (row) => row.address || '',
      setValue: (row, value) => ({ address: value || null }),
    },
    {
      key: 'website',
      header: 'Website',
      
      width: '180px',
      getValue: (row) => row.website || '',
      setValue: (row, value) => ({ website: value || null }),
    },
    {
      key: 'taxId',
      header: 'Tax ID',
      
      width: '140px',
      getValue: (row) => row.taxId || '',
      setValue: (row, value) => ({ taxId: value || null }),
    },
    {
      key: 'paymentTerms',
      header: 'Payment Terms',
      
      width: '160px',
      getValue: (row) => row.paymentTerms || '',
      setValue: (row, value) => ({ paymentTerms: value || null }),
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
      const response = await vendorsApi.update(row.id, changes);
      setVendors(current => current.map(vendor => (
        vendor.id === row.id ? mergeUpdatedRow(vendor, changes, response) : vendor
      )));
    } catch (err) {
      console.error('Failed to save vendor:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await vendorsApi.delete(row.id);
      setVendors(current => current.filter(vendor => vendor.id !== row.id));
      setTotal(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete vendor:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await vendorsApi.create(data);
      setVendors(current => [buildCreatedRow(data, response), ...current].slice(0, pageSize));
      setTotal(current => current + 1);
    } catch (err) {
      console.error('Failed to create vendor:', err);
      throw err;
    }
  };

  return (
    <div>
      {/* Page Header */}
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
            <h1 className="page-title">🤝 Vendors/Suppliers Spreadsheet</h1>
            <p className="page-subtitle">Manage vendor information with inline editing</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={vendors}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
        />
      </div>

      {/* Pagination */}
      {!isLoading && vendors.length > 0 && (
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
