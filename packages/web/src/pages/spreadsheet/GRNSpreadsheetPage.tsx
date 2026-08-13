import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, floorsApi, shelvesApi, branchesApi } from '../../api/client';
import { GRNStatus } from '@jingles/shared';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { fetchAllSpreadsheetRows, mergeUpdatedRow, useLazySpreadsheetRows } from './spreadsheetPageUtils';

const toDateInput = (value: any) => (value ? String(value).slice(0, 10) : '');

/**
 * updateDraftGRN replaces the whole document: it needs the supplier and the
 * full line set, not just the edited cells. Rebuild the payload from the row so
 * a one-cell edit round-trips the lines unchanged. batchId is carried over and
 * createNewBatch is never set, so replaying lines cannot mint new batches.
 */
const buildUpdatePayload = (row: any, changes: Record<string, any>) => ({
  supplierId: row.supplierId,
  floorId: row.floorId ?? null,
  shelfId: row.shelfId ?? null,
  invoiceReference: row.invoiceReference ?? null,
  supplierInvoiceDate: row.supplierInvoiceDate ?? null,
  expectedDeliveryDate: row.expectedDeliveryDate ?? null,
  notes: row.notes ?? null,
  ...changes,
  lines: (row.lines ?? []).map((line: any) => ({
    skuId: line.skuId,
    variantId: line.variantId ?? undefined,
    batchId: line.batchId ?? undefined,
    expectedQuantity: line.expectedQuantity,
    costPrice: line.costPrice ?? undefined,
    sellingPrice: line.sellingPrice ?? undefined,
    wholesalePrice: line.wholesalePrice ?? undefined,
    bulkPrice: line.bulkPrice ?? undefined,
    notes: line.notes ?? undefined,
  })),
});

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
      key: 'grnNumber',
      header: 'GRN #',
      width: '140px',
      readOnly: true,
      getValue: (row) => row.grnNumber ?? '',
      render: (value) => String(value || '—'),
    },
    {
      key: 'invoiceReference',
      header: 'Invoice Ref',
      width: '140px',
      getValue: (row) => row.invoiceReference || '',
      setValue: (_row, value) => ({ invoiceReference: value || null }),
    },
    {
      key: 'supplierId',
      header: 'Supplier',
      options: vendorOptions,
      width: '180px',
      validate: (value) => (value ? null : 'Supplier is required'),
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
    },
    {
      key: 'supplierInvoiceDate',
      header: 'Invoice Date',
      width: '120px',
      getValue: (row) => toDateInput(row.supplierInvoiceDate),
      setValue: (_row, value) => ({ supplierInvoiceDate: value || null }),
    },
    {
      key: 'expectedDeliveryDate',
      header: 'Expected Date',
      width: '120px',
      getValue: (row) => toDateInput(row.expectedDeliveryDate),
      setValue: (_row, value) => ({ expectedDeliveryDate: value || null }),
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '220px',
      getValue: (row) => row.notes || '',
      setValue: (_row, value) => ({ notes: value || null }),
    },
    {
      key: 'status',
      header: 'Status',
      width: '140px',
      readOnly: true,
      render: (value) => String(value || ''),
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
      key: 'deliveryDate',
      header: 'Delivery Date',
      width: '120px',
      readOnly: true,
      getValue: (row) => toDateInput(row.deliveryDate),
      render: (value) => String(value || '—'),
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
      // Submitting a GRN creates uninspected stock, so the API only allows
      // edits while the document is still a draft. Say which state blocked it.
      if (row.status !== GRNStatus.Draft) {
        throw new Error(`Only Draft GRNs can be edited — this one is ${row.status}.`);
      }
      if (!Array.isArray(row.lines) || row.lines.length === 0) {
        throw new Error('This GRN has no lines to save. Open it from the GRNs page to add one.');
      }

      const response = await grnsApi.update(row.id, buildUpdatePayload(row, changes));
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
            <p className="page-subtitle">
              Edit draft goods receipts — supplier, placement, invoice details and dates. Adding lines
              and submitting for inspection stay on the GRN detail page.
            </p>
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
