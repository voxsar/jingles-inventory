import { useEffect, useState } from 'react';
import { skusApi, vendorsApi, categoriesApi, settingsApi } from '../api/client';
import DataTable from '../components/DataTable';

const defaultForm = {
  skuCode: '',
  name: '',
  description: '',
  categoryId: '',
  vendorId: '',
  unitOfMeasure: '',
  unitOfMeasureId: '',
  isFragile: false,
  maxStackHeight: '',
  lowStockThreshold: '',
};

export default function SKUPage() {
  const [skus, setSkus] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedSku, setSelectedSku] = useState<any>(null);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodes, setBarcodes] = useState<any[]>([]);
  const [newBarcode, setNewBarcode] = useState({ barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' });

  const load = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: '20' };
      if (searchTerm) params.search = searchTerm;
      if (categoryFilter) params.categoryId = categoryFilter;
      if (vendorFilter) params.vendorId = vendorFilter;

      const [skuRes, vendorRes, catRes, unitRes] = await Promise.all([
        skusApi.list(params),
        vendorsApi.list(),
        categoriesApi.list(),
        settingsApi.listUnits(),
      ]);
      setSkus(skuRes.data.data.items ?? []);
      setTotal(skuRes.data.data.total ?? 0);
      setVendors(vendorRes.data);
      setCategories(catRes.data.data ?? []);
      setUnits(unitRes.data.data ?? []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, searchTerm, categoryFilter, vendorFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        maxStackHeight: form.maxStackHeight ? parseFloat(form.maxStackHeight) : null,
        lowStockThreshold: form.lowStockThreshold ? parseInt(form.lowStockThreshold) : null,
        categoryId: form.categoryId || undefined,
        unitOfMeasureId: form.unitOfMeasureId || undefined,
      };
      await skusApi.create(payload);
      setShowForm(false);
      setForm(defaultForm);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create SKU');
    }
  };

  const handleUnitChange = (unitId: string) => {
    const unit = units.find(u => u.id === unitId);
    setForm(f => ({
      ...f,
      unitOfMeasureId: unitId,
      unitOfMeasure: unit?.name ?? '',
    }));
  };

  const openBarcodes = async (sku: any) => {
    setSelectedSku(sku);
    const res = await skusApi.getBarcodes(sku.id);
    setBarcodes(res.data.data);
    setShowBarcodeModal(true);
  };

  const handleAddBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await skusApi.addBarcode(selectedSku.id, newBarcode);
      setNewBarcode({ barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' });
      const res = await skusApi.getBarcodes(selectedSku.id);
      setBarcodes(res.data.data);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to add barcode');
    }
  };

  const handleDeleteBarcode = async (bcId: string) => {
    if (!confirm('Remove this barcode?')) return;
    try {
      await skusApi.deleteBarcode(selectedSku.id, bcId);
      const res = await skusApi.getBarcodes(selectedSku.id);
      setBarcodes(res.data.data);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete barcode');
    }
  };

  const columns = [
    { key: 'skuCode', header: 'SKU Code', render: (r: any) => <span className="font-mono text-xs font-medium">{r.skuCode}</span>, sortable: true },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'category', header: 'Category', render: (r: any) => r.category?.name ?? '—' },
    { key: 'vendor', header: 'Vendor', render: (r: any) => r.vendor?.name },
    { key: 'unitOfMeasure', header: 'UoM' },
    { key: 'lowStockThreshold', header: 'Low Stock Alert', render: (r: any) => r.lowStockThreshold != null ? `≤${r.lowStockThreshold}` : '—' },
    { key: 'isFragile', header: 'Fragile', render: (r: any) => r.isFragile ? '⚠️ Yes' : 'No' },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: 'Actions',
      render: (r: any) => (
        <button onClick={e => { e.stopPropagation(); openBarcodes(r); }} className="text-xs text-primary-600 hover:underline">
          Barcodes
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏷️ SKUs</h1>
          <p className="text-sm text-gray-500 mt-1">{total} products</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">+ New SKU</button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Create SKU</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU Code *</label>
              <input type="text" value={form.skuCode} onChange={e => setForm(f => ({ ...f, skuCode: e.target.value }))} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="input-field">
                <option value="">— Select Category —</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor / Supplier *</label>
              <select value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} required className="input-field">
                <option value="">Select vendor</option>
                {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit of Measure *</label>
              {units.length > 0 ? (
                <select
                  value={form.unitOfMeasureId}
                  onChange={e => handleUnitChange(e.target.value)}
                  required
                  className="input-field"
                >
                  <option value="">— Select Unit —</option>
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.unitOfMeasure}
                  onChange={e => setForm(f => ({ ...f, unitOfMeasure: e.target.value }))}
                  required
                  className="input-field"
                  placeholder="e.g. Piece"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Stack Height (cm)</label>
              <input type="number" value={form.maxStackHeight} onChange={e => setForm(f => ({ ...f, maxStackHeight: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
              <input type="number" min="0" value={form.lowStockThreshold} onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value }))} className="input-field" placeholder="Alert when qty ≤ this value" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="isFragile" checked={form.isFragile} onChange={e => setForm(f => ({ ...f, isFragile: e.target.checked }))} className="rounded" />
              <label htmlFor="isFragile" className="text-sm font-medium text-gray-700">Fragile Item</label>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field" rows={2} />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">Create SKU</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name or code..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            className="input-field max-w-xs"
          />
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
            className="input-field max-w-xs"
          >
            <option value="">All Categories</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={vendorFilter}
            onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
            className="input-field max-w-xs"
          >
            <option value="">All Vendors</option>
            {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>

        <DataTable columns={columns} data={skus} isLoading={isLoading} emptyMessage="No SKUs found" />

        <div className="flex items-center justify-between mt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm">← Previous</button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button disabled={skus.length < 20} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm">Next →</button>
        </div>
      </div>

      {/* Barcodes Modal */}
      {showBarcodeModal && selectedSku && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Barcodes — {selectedSku.name}</h3>
              <button onClick={() => setShowBarcodeModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="space-y-2 mb-4">
              {barcodes.length === 0 ? (
                <p className="text-sm text-gray-500">No barcodes assigned. Add one below.</p>
              ) : (
                barcodes.map((bc: any) => (
                  <div key={bc.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <span className="font-mono text-sm">{bc.barcode}</span>
                      <span className="ml-2 text-xs text-gray-500">{bc.barcodeType}</span>
                      {bc.isDefault && <span className="ml-2 text-xs bg-primary-100 text-primary-700 px-1 rounded">Default</span>}
                      {bc.label && <span className="ml-2 text-xs text-gray-400">({bc.label})</span>}
                    </div>
                    <button onClick={() => handleDeleteBarcode(bc.id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddBarcode} className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Add Barcode</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Barcode value *"
                    value={newBarcode.barcode}
                    onChange={e => setNewBarcode(b => ({ ...b, barcode: e.target.value }))}
                    required
                    className="input-field"
                  />
                </div>
                <select
                  value={newBarcode.barcodeType}
                  onChange={e => setNewBarcode(b => ({ ...b, barcodeType: e.target.value }))}
                  className="input-field"
                >
                  {['EAN13', 'UPC', 'QRCode', 'Code128', 'Code39', 'Custom'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={newBarcode.label}
                  onChange={e => setNewBarcode(b => ({ ...b, label: e.target.value }))}
                  className="input-field"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="bcDefault"
                    checked={newBarcode.isDefault}
                    onChange={e => setNewBarcode(b => ({ ...b, isDefault: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="bcDefault" className="text-sm text-gray-700">Set as Default</label>
                </div>
              </div>
              <button type="submit" className="btn-primary text-sm">Add Barcode</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


export default function SKUPage() {
  const [skus, setSkus] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    skuCode: '', name: '', description: '', category: '', vendorId: '',
    unitOfMeasure: UnitOfMeasure.Piece, isFragile: false, maxStackHeight: '',
  });

  const load = async () => {
    try {
      const [skuRes, vendorRes] = await Promise.all([skusApi.list(), vendorsApi.list()]);
      setSkus(skuRes.data.data.items);
      setVendors(vendorRes.data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await skusApi.create({ ...form, maxStackHeight: form.maxStackHeight ? parseFloat(form.maxStackHeight) : null });
      setShowForm(false);
      setForm({ skuCode: '', name: '', description: '', category: '', vendorId: '', unitOfMeasure: UnitOfMeasure.Piece, isFragile: false, maxStackHeight: '' });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create SKU');
    }
  };

  const columns = [
    { key: 'skuCode', header: 'SKU Code', render: (r: any) => <span className="font-mono text-xs font-medium">{r.skuCode}</span>, sortable: true },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'category', header: 'Category', render: (r: any) => r.category ?? '—' },
    { key: 'vendor', header: 'Vendor', render: (r: any) => r.vendor?.name },
    { key: 'unitOfMeasure', header: 'UoM' },
    { key: 'isFragile', header: 'Fragile', render: (r: any) => r.isFragile ? '⚠️ Yes' : 'No' },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">SKUs</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">+ New SKU</button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Create SKU</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU Code *</label>
              <input type="text" value={form.skuCode} onChange={e => setForm(f => ({ ...f, skuCode: e.target.value }))} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              <select value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} required className="input-field">
                <option value="">Select vendor</option>
                {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit of Measure</label>
              <select value={form.unitOfMeasure} onChange={e => setForm(f => ({ ...f, unitOfMeasure: e.target.value as UnitOfMeasure }))} className="input-field">
                {Object.values(UnitOfMeasure).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Stack Height (cm)</label>
              <input type="number" value={form.maxStackHeight} onChange={e => setForm(f => ({ ...f, maxStackHeight: e.target.value }))} className="input-field" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isFragile" checked={form.isFragile} onChange={e => setForm(f => ({ ...f, isFragile: e.target.checked }))} className="rounded" />
              <label htmlFor="isFragile" className="text-sm font-medium text-gray-700">Fragile Item</label>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field" rows={2} />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">Create SKU</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <DataTable columns={columns} data={skus} isLoading={isLoading} emptyMessage="No SKUs found" />
      </div>
    </div>
  );
}
