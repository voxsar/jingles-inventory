import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi, vendorsApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { fetchAllSpreadsheetRows, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

const ROLE_OPTIONS = ['Admin', 'Manager', 'Staff', 'Inspector', 'Vendor']
  .map(role => ({ value: role, label: role }));

export default function UserSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [vendors, setVendors] = useState<any[]>([]);
  const {
    rows: users,
    setRows: setUsers,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(usersApi.list, { searchTerm });

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const vendorData = await fetchAllSpreadsheetRows<any>(vendorsApi.list);
        setVendors(Array.isArray(vendorData) ? vendorData : []);
      } catch (err) {
        console.error(err);
      }
    };

    loadVendors();
  }, []);

  const vendorOptions = [
    { value: '', label: 'No vendor' },
    ...vendors.map(vendor => ({ value: vendor.id, label: vendor.name })),
  ];

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'email',
      header: 'Email',
      width: '260px',
      validate: (value) => (/^\S+@\S+\.\S+$/.test(String(value ?? '')) ? null : 'A valid email is required'),
    },
    {
      key: 'role',
      header: 'Role',
      options: ROLE_OPTIONS,
      width: '140px',
      validate: (value) => (value ? null : 'Role is required'),
    },
    {
      key: 'vendorId',
      header: 'Vendor',
      options: vendorOptions,
      width: '220px',
      getValue: (row) => row.vendorId ?? '',
      setValue: (_row, value) => ({ vendorId: value || null }),
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
      // A Vendor account without a vendor cannot see anything, and the API
      // rejects it — catch that here so the cell reports the real reason.
      const nextRole = changes.role ?? row.role;
      const nextVendorId = 'vendorId' in changes ? changes.vendorId : row.vendorId;
      if (nextRole === 'Vendor' && !nextVendorId) {
        throw new Error('The Vendor role requires a vendor to be selected.');
      }

      const response = await usersApi.update(row.id, changes);
      setUsers(current => current.map(user => (
        user.id === row.id ? mergeUpdatedRow(user, changes, response) : user
      )));
    } catch (err) {
      console.error('Failed to save user:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await usersApi.delete(row.id);
      setUsers(current => current.filter(user => user.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete user:', err);
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
            <h1 className="page-title">👥 Users Spreadsheet</h1>
            <p className="page-subtitle">
              Edit roles, vendor scoping and account status. Passwords and PINs are never shown here —
              add accounts and reset credentials from the Users page.
            </p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={users}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onSave={handleSave}
          onDelete={handleDelete}
          onLoadMore={loadMoreRows}
          onSearchChange={setSearchTerm}
          getRowKey={(row) => row.id}
          canAdd={false}
        />
      </div>
    </div>
  );
}
