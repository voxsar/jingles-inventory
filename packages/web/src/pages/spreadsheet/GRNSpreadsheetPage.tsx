import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, floorsApi, shelvesApi, branchesApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { fetchAllSpreadsheetRows, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

export default function GRNSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isLookupsLoading, setIsLookupsLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const {
    rows: grns,
    setRows: setGrns,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(grnsApi.list, { searchTerm });

  useEffect(() => {
    const loadLookups = async () => {
      setIsLookupsLoading(true);
      try {
        const [vendorData, branchData, floorData, shelfData] = await Promise.all([
          fetchAllSpreadsheetRows<any>(vendorsApi.list),
          fetchAllSpreadsheetRows<any>(branchesApi.list),
          fetchAllSpreadsheetRows<any>(floorsApi.list),
          fetchAllSpreadsheetRows<any>(shelvesApi.list),
        ]);

        setVendors(Array.isArray(vendorData) ? vendorData : []);
        setBranches(Array.isArray(branchData) ? branchData : []);
        setFloors(Array.isArray(floorData) ? floorData : []);
        setShelves(Array.isArray(shelfData) ? shelfData : []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLookupsLoading(false);
      }
    };

    loadLookups();
  }, []);

  const getFloorBranchId = (floor: any) => floor?.branchId ?? floor?.branch?.id ?? '';
  const getRowBranchId = (row: any) => (
    row.floor?.branch?.id
    ?? floors.find(floor => floor.id === row.floorId)?.branchId
    ?? floors.find(floor => floor.id === row.floorId)?.branch?.id
    ?? ''
  );
  const getShelfFloorId = (shelf: any) => shelf?.floorId ?? shelf?.floor?.id ?? '';
  const vendorOptions = vendors.map(v => ({ value: v.id, label: v.name }));
  const branchOptions = branches.map(b => ({ value: b.id, label: b.name }));
  const floorOptions = floors.map(f => ({
    value: f.id,
    label: f.branch?.name ? `${f.branch.name} › ${f.name}` : f.name,
  }));
  const shelfOptions = shelves.map(s => ({
    value: s.id,
    label: s.floor?.branch?.name ? `${s.floor.branch.name} › ${s.floor.name} › ${s.name}` : s.name || s.id,
  }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'invoiceReference',
      header: 'Invoice Ref',
      
      width: '140px',
      render: (value, row) => String(row.invoiceReference || '—' || ""),
    },
    {
      key: 'supplierId',
      header: 'Supplier',
      
      options: vendorOptions,
      width: '180px',
      
      render: (value, row) => String(value || ""),
    },
    {
      key: 'branchId',
      header: 'Branch',
      options: branchOptions,
      width: '180px',
      getValue: getRowBranchId,
      setValue: (row, value) => {
        if (!value) return { floorId: null, shelfId: null };

        const currentFloor = floors.find(floor => floor.id === row.floorId);
        const currentFloorStillValid = currentFloor && getFloorBranchId(currentFloor) === value;
        const nextFloorId = currentFloorStillValid
          ? currentFloor.id
          : floors.find(floor => getFloorBranchId(floor) === value)?.id ?? null;

        return { floorId: nextFloorId, shelfId: null };
      },
      validate: (value) => !value || floors.some(floor => getFloorBranchId(floor) === value)
        ? null
        : 'Selected branch has no floors',
    },
    {
      key: 'floorId',
      header: 'Floor',
      
      options: floorOptions,
      width: '180px',
      getValue: (row) => row.floorId || '',
      setValue: (_row, value) => ({ floorId: value || null, shelfId: null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'shelfId',
      header: 'Shelf',
      options: shelfOptions,
      width: '180px',
      getValue: (row) => row.shelfId || '',
      setValue: (_row, value) => {
        const shelf = shelves.find(item => item.id === value);
        return {
          floorId: shelf ? getShelfFloorId(shelf) || null : null,
          shelfId: value || null,
        };
      },
      render: (value, row) => String(value || ""),
    },
    {
      key: 'status',
      header: 'Status',
      width: '140px',
      readOnly: true,
      render: (value) => String(value || ''),
    },
    {
      key: 'expectedDeliveryDate',
      header: 'Expected Date',
      
      width: '120px',
      getValue: (row) => row.expectedDeliveryDate || '',
      setValue: (row, value) => ({ expectedDeliveryDate: value || null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'deliveryDate',
      header: 'Delivery Date',
      width: '120px',
      readOnly: true,
      getValue: (row) => row.deliveryDate || '',
      render: (value, row) => String(value || ""),
    },
    {
      key: 'createdAt',
      header: 'Created',
      
      width: '110px',
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  const handleSave = async (row: any, changes: Partial<any>) => {
    try {
      const response = await grnsApi.update(row.id, changes);
      setGrns(current => current.map(grn => (
        grn.id === row.id ? mergeUpdatedRow(grn, changes, response) : grn
      )));
    } catch (err) {
      console.error('Failed to save GRN:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await grnsApi.delete(row.id);
      setGrns(current => current.filter(grn => grn.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
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
            <p className="page-subtitle">Manage Goods Receipt Notes with supplier, branch, floor, and shelf selection</p>
          </div>
        </div>
      </div>

      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={grns}
          isLoading={isLoading || isLookupsLoading}
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
