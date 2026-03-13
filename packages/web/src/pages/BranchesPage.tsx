import { useEffect, useState } from 'react';
import { branchesApi } from '../api/client';
import DataTable from '../components/DataTable';

const defaultForm = {
  name: '',
  code: '',
  address: '',
  phone: '',
  email: '',
  isDefault: false,
};

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);

  const load = async () => {
    try {
      const res = await branchesApi.list();
      setBranches(res.data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingBranch(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const openEdit = (branch: any) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
      isDefault: branch.isDefault,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
    };
    try {
      if (editingBranch) {
        await branchesApi.update(editingBranch.id, payload);
      } else {
        await branchesApi.create(payload);
      }
      setShowForm(false);
      setEditingBranch(null);
      setForm(defaultForm);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save branch');
    }
  };

  const handleToggleActive = async (branch: any) => {
    try {
      await branchesApi.update(branch.id, { isActive: !branch.isActive });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update');
    }
  };

  const columns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs">{r.code}</span>, sortable: true },
    { key: 'address', header: 'Address', render: (r: any) => r.address ?? '—' },
    { key: 'phone', header: 'Phone', render: (r: any) => r.phone ?? '—' },
    { key: 'email', header: 'Email', render: (r: any) => r.email ?? '—' },
    {
      key: 'isDefault', header: 'Default',
      render: (r: any) => r.isDefault ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Default</span> : '—',
    },
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
          <h1 className="text-2xl font-bold text-gray-900">🏢 Branches</h1>
          <p className="text-sm text-gray-500 mt-1">Manage store branches and locations</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ New Branch</button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{editingBranch ? 'Edit Branch' : 'New Branch'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="input-field" placeholder="e.g. Main Branch" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required className="input-field" placeholder="e.g. MAIN" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
              <label htmlFor="isDefault" className="text-sm font-medium text-gray-700">Set as Default Branch</label>
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">{editingBranch ? 'Update Branch' : 'Create Branch'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <DataTable columns={columns} data={branches} isLoading={isLoading} emptyMessage="No branches found" />
      </div>
    </div>
  );
}
