import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { skusApi, vendorsApi, categoriesApi, settingsApi, tagsApi } from '../../api/client';
import ReactSpreadsheetWrapper, { ColumnDefinition } from '../../components/ReactSpreadsheetWrapper';
import { buildHierarchicalCategoryOptionsFromFlat } from '../../utils/categoryHelpers';
import { fetchAllSpreadsheetRows, useLazySpreadsheetRows } from './spreadsheetPageUtils';

const joinUnique = (values: Array<string | null | undefined>) => (
  Array.from(new Set(values.filter(Boolean) as string[])).join(', ')
);

const getVendorIds = (row: any) => {
  if (Array.isArray(row.vendorIds)) return row.vendorIds;
  if (Array.isArray(row.skuVendors) && row.skuVendors.length > 0) {
    return row.skuVendors.map((link: any) => link.vendorId).filter(Boolean);
  }
  return row.vendorId ? [row.vendorId] : [];
};

const getTagIds = (row: any) => {
  if (Array.isArray(row.tagIds)) return row.tagIds;
  if (Array.isArray(row.tags)) {
    return row.tags.map((link: any) => link.tagId ?? link.tag?.id ?? link.id).filter(Boolean);
  }
  return [];
};

const getDimensionValue = (row: any, key: string) => row.dimensions?.[key] ?? '';

const setDimensionValue = (row: any, key: string, value: any) => ({
  dimensions: {
    ...(row.dimensions ?? {}),
    [key]: value ?? null,
  },
});

const toDateInputValue = (value: any) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const locationRecords = (row: any) => Array.isArray(row.inventoryRecords) ? row.inventoryRecords : [];

const getResponseData = (response: any) => response?.data?.data ?? response?.data ?? {};

export default function SKUSpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isLookupsLoading, setIsLookupsLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const {
    rows: skus,
    setRows: setSkus,
    isLoading,
    isLoadingMore,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  } = useLazySpreadsheetRows<any>(skusApi.list, { searchTerm });

  useEffect(() => {
    const loadLookups = async () => {
      setIsLookupsLoading(true);
      try {
        const [vendorData, catData, unitData, tagData] = await Promise.all([
          fetchAllSpreadsheetRows<any>(vendorsApi.list),
          fetchAllSpreadsheetRows<any>(categoriesApi.list),
          fetchAllSpreadsheetRows<any>(settingsApi.listUnits),
          fetchAllSpreadsheetRows<any>(tagsApi.list),
        ]);

        setVendors(Array.isArray(vendorData) ? vendorData : []);
        setCategories(Array.isArray(catData) ? catData : []);
        setUnits(Array.isArray(unitData) ? unitData : []);
        setTags(Array.isArray(tagData) ? tagData : []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLookupsLoading(false);
      }
    };

    loadLookups();
  }, []);

  const vendorOptions = vendors.map(v => ({ value: v.id, label: v.name }));
  const categoryOptions = buildHierarchicalCategoryOptionsFromFlat(categories);
  const unitOptions = units.map(u => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }));
  const tagOptions = tags.map(t => ({ value: t.id, label: t.name }));
  const marginOptions = [
    { value: 'fixed', label: 'Fixed' },
    { value: 'percentage', label: 'Percentage' },
  ];
  const currencyOptions = ['LKR', 'USD', 'EUR', 'GBP', 'AUD', 'INR'].map(value => ({ value, label: value }));

  const decorateSkuRow = (current: any, patch: Partial<any> = {}, apiRow: any = {}) => {
    const merged = {
      ...current,
      ...apiRow,
      ...patch,
      inventoryRecords: apiRow.inventoryRecords ?? current.inventoryRecords ?? [],
      barcodes: apiRow.barcodes ?? current.barcodes ?? [],
      images: apiRow.images ?? current.images ?? [],
      _count: apiRow._count ?? current._count,
    };

    if ('vendorIds' in patch) {
      const vendorIds = Array.isArray(patch.vendorIds) ? patch.vendorIds : [];
      merged.vendorId = vendorIds[0] ?? merged.vendorId;
      merged.skuVendors = vendorIds.map((vendorId: string) => ({
        skuId: merged.id,
        vendorId,
        vendor: vendors.find(vendor => vendor.id === vendorId) ?? null,
      }));
    }

    if ('tagIds' in patch) {
      const tagIds = Array.isArray(patch.tagIds) ? patch.tagIds : [];
      merged.tags = tagIds.map((tagId: string) => ({
        skuId: merged.id,
        tagId,
        tag: tags.find(tag => tag.id === tagId) ?? null,
      }));
    }

    if ('categoryId' in patch) {
      merged.category = categories.find(category => category.id === patch.categoryId) ?? null;
    }

    if ('unitOfMeasureId' in patch) {
      const unit = units.find(item => item.id === patch.unitOfMeasureId);
      merged.unitModel = unit ?? null;
      merged.unitOfMeasure = patch.unitOfMeasure ?? unit?.name ?? merged.unitOfMeasure;
    }

    return merged;
  };

  const columns: ColumnDefinition<any>[] = [
    {
      key: 'skuCode',
      header: 'SKU Code',
      width: '140px',
      validate: (value) => value ? null : 'SKU code is required',
    },
    {
      key: 'name',
      header: 'Product Name',
      width: '220px',
      validate: (value) => value ? null : 'Product name is required',
    },
    {
      key: 'description',
      header: 'Description',
      width: '260px',
      getValue: (row) => row.description || '',
      setValue: (_row, value) => ({ description: value || null }),
    },
    {
      key: 'categoryId',
      header: 'Category',
      options: categoryOptions,
      width: '220px',
      getValue: (row) => row.categoryId || '',
      setValue: (_row, value) => ({ categoryId: value || null }),
    },
    {
      key: 'vendorIds',
      header: 'Vendors',
      options: vendorOptions,
      width: '240px',
      getValue: getVendorIds,
      setValue: (_row, value) => ({ vendorIds: value }),
      validate: (value) => Array.isArray(value) && value.length > 0 ? null : 'At least one vendor is required',
    },
    {
      key: 'tagIds',
      header: 'Tags',
      options: tagOptions,
      width: '220px',
      getValue: getTagIds,
      setValue: (_row, value) => ({ tagIds: value }),
    },
    {
      key: 'unitOfMeasureId',
      header: 'Unit',
      options: unitOptions,
      width: '170px',
      getValue: (row) => row.unitOfMeasureId || '',
      setValue: (row, value) => {
        const unit = units.find(u => u.id === value);
        return {
          unitOfMeasureId: value || null,
          unitOfMeasure: unit?.name ?? row.unitOfMeasure ?? '',
        };
      },
      validate: (value) => value ? null : 'Unit is required',
    },
    {
      key: 'costPrice',
      header: 'Cost',
      width: '100px',
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
      width: '120px',
      getValue: (row) => row.wholesalePrice ?? '',
      setValue: (_row, value) => ({ wholesalePrice: value ?? null }),
    },
    {
      key: 'bulkPrice',
      header: 'Bulk',
      width: '100px',
      getValue: (row) => row.bulkPrice ?? '',
      setValue: (_row, value) => ({ bulkPrice: value ?? null }),
    },
    {
      key: 'marginType',
      header: 'Margin Type',
      options: marginOptions,
      width: '140px',
      getValue: (row) => row.marginType || '',
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
      key: 'currency',
      header: 'Currency',
      options: currencyOptions,
      width: '110px',
      getValue: (row) => row.currency || 'LKR',
      setValue: (_row, value) => ({ currency: value || 'LKR' }),
    },
    {
      key: 'isFragile',
      header: 'Fragile',
      width: '80px',
      getValue: (row) => !!row.isFragile,
      setValue: (_row, value) => ({ isFragile: value }),
    },
    {
      key: 'maxStackHeight',
      header: 'Max Stack',
      width: '110px',
      getValue: (row) => row.maxStackHeight ?? '',
      setValue: (_row, value) => ({ maxStackHeight: value ?? null }),
    },
    {
      key: 'lowStockThreshold',
      header: 'Low Stock',
      width: '100px',
      getValue: (row) => row.lowStockThreshold || '',
      setValue: (_row, value) => ({ lowStockThreshold: value ?? null }),
    },
    {
      key: 'lengthCm',
      header: 'Length cm',
      width: '110px',
      getValue: (row) => getDimensionValue(row, 'lengthCm'),
      setValue: (row, value) => setDimensionValue(row, 'lengthCm', value),
    },
    {
      key: 'widthCm',
      header: 'Width cm',
      width: '100px',
      getValue: (row) => getDimensionValue(row, 'widthCm'),
      setValue: (row, value) => setDimensionValue(row, 'widthCm', value),
    },
    {
      key: 'heightCm',
      header: 'Height cm',
      width: '105px',
      getValue: (row) => getDimensionValue(row, 'heightCm'),
      setValue: (row, value) => setDimensionValue(row, 'heightCm', value),
    },
    {
      key: 'defaultManufacturingDate',
      header: 'Mfg Date',
      width: '120px',
      getValue: (row) => toDateInputValue(row.defaultManufacturingDate),
      setValue: (_row, value) => ({ defaultManufacturingDate: value || null }),
    },
    {
      key: 'defaultExpiryDate',
      header: 'Expiry Date',
      width: '120px',
      getValue: (row) => toDateInputValue(row.defaultExpiryDate),
      setValue: (_row, value) => ({ defaultExpiryDate: value || null }),
    },
    {
      key: 'shelfLifeDays',
      header: 'Shelf Life',
      width: '110px',
      getValue: (row) => row.shelfLifeDays ?? '',
      setValue: (_row, value) => ({ shelfLifeDays: value ?? null }),
    },
    {
      key: 'videoUrl',
      header: 'Video URL',
      width: '220px',
      getValue: (row) => row.videoUrl || '',
      setValue: (_row, value) => ({ videoUrl: value || null }),
    },
    {
      key: 'primaryBarcode',
      header: 'Barcode',
      width: '150px',
      readOnly: true,
      getValue: (row) => row.barcodes?.[0]?.barcode || '',
    },
    {
      key: 'variantCount',
      header: 'Variants',
      width: '90px',
      readOnly: true,
      getValue: (row) => row._count?.variants ?? row.variants?.length ?? 0,
    },
    {
      key: 'totalQuantity',
      header: 'On Hand',
      width: '95px',
      readOnly: true,
      getValue: (row) => locationRecords(row).reduce((sum: number, record: any) => sum + (Number(record.quantity) || 0), 0),
    },
    {
      key: 'branches',
      header: 'Branches',
      width: '220px',
      readOnly: true,
      getValue: (row) => joinUnique(locationRecords(row).map((record: any) => record.floor?.branch?.name ?? record.floor?.branch?.code)),
    },
    {
      key: 'floors',
      header: 'Floors',
      width: '220px',
      readOnly: true,
      getValue: (row) => joinUnique(locationRecords(row).map((record: any) => record.floor?.name ?? record.floor?.code)),
    },
    {
      key: 'shelves',
      header: 'Shelves',
      width: '200px',
      readOnly: true,
      getValue: (row) => joinUnique(locationRecords(row).map((record: any) => record.shelf?.name ?? record.shelf?.code)),
    },
    {
      key: 'boxes',
      header: 'Boxes',
      width: '200px',
      readOnly: true,
      getValue: (row) => joinUnique(locationRecords(row).map((record: any) => record.box?.name ?? record.box?.code)),
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
      const response = await skusApi.update(row.id, changes);
      const apiRow = getResponseData(response);
      setSkus(current => current.map(sku => (
        sku.id === row.id ? decorateSkuRow(sku, changes, apiRow) : sku
      )));
    } catch (err) {
      console.error('Failed to save SKU:', err);
      throw err;
    }
  };

  const handleDelete = async (row: any) => {
    try {
      await skusApi.delete(row.id);
      setSkus(current => current.filter(sku => sku.id !== row.id));
      setTotalRows(current => Math.max(0, current - 1));
    } catch (err) {
      console.error('Failed to delete SKU:', err);
      throw err;
    }
  };

  const handleAdd = async (data: Partial<any>) => {
    try {
      const response = await skusApi.create(data);
      const apiRow = getResponseData(response);
      const created = decorateSkuRow(apiRow, data, apiRow);
      setSkus(current => [created, ...current]);
      setTotalRows(current => current + 1);
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
            <h1 className="page-title">Products (SKUs) Spreadsheet</h1>
            <p className="page-subtitle">Catalog editing with vendors, tags, pricing, dimensions, stock, and location context</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="content-section" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactSpreadsheetWrapper
          columns={columns}
          data={skus}
          isLoading={isLoading || isLookupsLoading}
          isLoadingMore={isLoadingMore}
          totalRows={totalRows}
          hasMoreRows={hasMoreRows}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdd={handleAdd}
          onLoadMore={loadMoreRows}
          onSearchChange={setSearchTerm}
          getRowKey={(row) => row.id}
        />
      </div>

    </div>
  );
}
