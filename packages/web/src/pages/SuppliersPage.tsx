import { useEffect, useState } from 'react';
import { vendorsApi } from '../api/client';
import DataTable from '../components/DataTable';

const VENDOR_TYPES = ['Vendor', 'Supplier', 'Both'];

const defaultForm = {
  name: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
  type: 'Supplier',
  website: '',
  taxId: '',
  paymentTerms: '',
  notes: '',
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    try {
      const params: Record<string, string> = {};
      if (typeFilter) params.type = typeFilter;
      if (searchTerm) params.search = searchTerm;
      if (statusFilter) params.isActive = statusFilter;
      const res = await vendorsApi.list(params);
      setSuppliers(res.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [typeFilter, searchTerm, statusFilter]);

  const openCreate = () => {
    setEditingSupplier(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const openEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name,
      contactEmail: supplier.contactEmail,
      contactPhone: supplier.contactPhone ?? '',
      address: supplier.address ?? '',
      type: supplier.type ?? 'Vendor',
      website: supplier.website ?? '',
      taxId: supplier.taxId ?? '',
      paymentTerms: supplier.paymentTerms ?? '',
      notes: supplier.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      contactPhone: form.contactPhone || undefined,
      address: form.address || undefined,
      website: form.website || undefined,
      taxId: form.taxId || undefined,
      paymentTerms: form.paymentTerms || undefined,
      notes: form.notes || undefined,
    };
    try {
      if (editingSupplier) {
        await vendorsApi.update(editingSupplier.id, payload);
      } else {
        await vendorsApi.create(payload);
      }
      setShowForm(false);
      setEditingSupplier(null);
      setForm(defaultForm);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save');
    }
  };

  const handleToggleActive = async (supplier: any) => {
    try {
      await vendorsApi.update(supplier.id, { isActive: !supplier.isActive });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update');
    }
  };

  const columns = [
    { key: 'name', header: 'Name', sortable: true },
    {
      key: 'type', header: 'Type',
      render: (r: any) => (
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
          r.type === 'Supplier' ? 'bg-blue-100 text-blue-700' :
          r.type === 'Both' ? 'bg-purple-100 text-purple-700' :
          'bg-gray-100 text-gray-700'
        }`}>{r.type}</span>
      ),
    },
    { key: 'contactEmail', header: 'Email', sortable: true },
    { key: 'contactPhone', header: 'Phone', render: (r: any) => r.contactPhone ?? '—' },
    { key: 'paymentTerms', header: 'Payment Terms', render: (r: any) => r.paymentTerms ?? '—' },
    {
      key: 'isActive', header: 'Status',
      render: (r: any) => (
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Actions',
      render: (r: any) => (
        <div className="flex gap-2">
          <button onClick={e => { e.stopPropagation(); openEdit(r); }} className="text-xs text-primary-600 hover:underline">Edit</button>
          <button onClick={e => { e.stopPropagation(); handleToggleActive(r); }} className={`text-xs ${r.isActive ? 'text-red-600' : 'text-green-600'} hover:underline`}>
            {r.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏭 Suppliers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage suppliers and vendor contacts</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ New Supplier</button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{editingSupplier ? 'Edit Supplier' : 'New Supplier'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="input-field">
                {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} className="input-field" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="input-field" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
              <input type="text" value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
              <input type="text" value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} className="input-field" placeholder="e.g. Net 30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">{editingSupplier ? 'Update' : 'Create'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-field max-w-xs"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="input-field max-w-xs"
          >
            <option value="">All Types</option>
            {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="input-field max-w-xs"
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          emptyMessage="No suppliers found"
        />
      </div>
    </div>
  );
}
