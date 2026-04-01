import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { skusApi, vendorsApi, categoriesApi, settingsApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import Pagination from '../../components/Pagination';

const PAGE_SIZE = 50;

export default function SKUSpreadsheetPage() {
  const navigate = useNavigate();
  const [skus, setSkus] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [skuRes, vendorRes, catRes, unitRes] = await Promise.all([
        skusApi.list({ page: String(page), pageSize: String(pageSize) }),
        vendorsApi.list(),
        categoriesApi.list(),
        settingsApi.listUnits(),
      ]);

      const skuData = skuRes.data?.data?.items ?? skuRes.data?.data ?? skuRes.data ?? [];
      setSkus(Array.isArray(skuData) ? skuData : []);
      setTotal(skuRes.data?.data?.total ?? 0);
      setTotalPages(skuRes.data?.data?.totalPages ?? 1);

      const vendorData = vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? [];
      setVendors(Array.isArray(vendorData) ? vendorData : []);

      const catData = catRes.data?.data?.items ?? catRes.data?.data ?? catRes.data ?? [];
      setCategories(Array.isArray(catData) ? catData : []);

      const unitData = unitRes.data?.data?.items ?? unitRes.data?.data ?? unitRes.data ?? [];
      setUnits(Array.isArray(unitData) ? unitData : []);
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
  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }));
  const unitOptions = units.map(u => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }));

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'skuCode',
      header: 'SKU Code',
      
      width: '140px',
      
      render: (value) => String(value || ""),
    },
    {
      key: 'name',
      header: 'Product Name',
      
      
      width: '220px',
    },
    {
      key: 'description',
      header: 'Description',
      
      width: '200px',
    },
    {
      key: 'categoryId',
      header: 'Category',
      
      options: categoryOptions,
      width: '160px',
      getValue: (row) => row.categoryId || '',
      setValue: (row, value) => ({ categoryId: value || null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'vendorIds',
      header: 'Vendors',
      
      options: vendorOptions,
      width: '200px',
      getValue: (row) => row.vendorIds || [],
      setValue: (row, value) => ({ vendorIds: value }),
      render: (value, row) => {
        const vendorIds = row.vendorIds || [];
        const vendorNames = vendorIds.map((vid: string) => {
          const vendor = vendors.find(v => v.id === vid);
          return vendor ? vendor.name : null;
        }).filter(Boolean);
        return vendorNames.join(', ');
      },
    },
    {
      key: 'unitOfMeasureId',
      header: 'Unit',
      
      options: unitOptions,
      width: '140px',
      getValue: (row) => row.unitOfMeasureId || '',
      setValue: (row, value) => ({ unitOfMeasureId: value || null }),
      render: (value, row) => String(value || ""),
    },
    {
      key: 'isFragile',
      header: 'Fragile',
      
      width: '80px',
      getValue: (row) => !!row.isFragile,
      setValue: (row, value) => ({ isFragile: value }),
    },
    {
      key: 'lowStockThreshold',
      header: 'Low Stock',
      
      width: '100px',
      getValue: (row) => row.lowStockThreshold || '',
      setValue: (row, value) => ({ lowStockThreshold: value || null }),
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
      await skusApi.update(row.id, changes);
      await loadData();
    } catch (err) {
      console.error('Failed to save SKU:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await skusApi.delete(row.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete SKU:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      await skusApi.create(data);
      await loadData();
    } catch (err) {
      console.error('Failed to create SKU:', err);
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
            <h1 className="page-title">🎵 Products (SKUs) Spreadsheet</h1>
            <p className="page-subtitle">Inline editing with dropdown search for categories, vendors, and units</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={skus}
          isLoading={isLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getRowKey={(row) => row.id}
        />
      </div>

      {/* Pagination */}
      {!isLoading && skus.length > 0 && (
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
