import { useEffect, useState } from 'react';
import { skusApi, vendorsApi } from '../api/client';
import { UnitOfMeasure } from '@jingles/shared';
import DataTable from '../components/DataTable';

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
