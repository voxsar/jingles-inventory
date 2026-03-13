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
    { key: 'code', header: 'Code', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.code}</span>, sortable: true },
    { key: 'address', header: 'Address', render: (r: any) => r.address ?? '—' },
    { key: 'phone', header: 'Phone', render: (r: any) => r.phone ?? '—' },
    { key: 'email', header: 'Email', render: (r: any) => r.email ?? '—' },
    {
      key: 'isDefault', header: 'Default',
      render: (r: any) => r.isDefault ? <s-badge tone="info">Default</s-badge> : <span>—</span>,
    },
    {
      key: 'isActive', header: 'Status',
      render: (r: any) => r.isActive
        ? <s-badge tone="success">Active</s-badge>
        : <s-badge tone="critical">Inactive</s-badge>,
    },
    {
      key: 'actions', header: 'Actions',
      render: (r: any) => (
        <div className="flex gap-2">
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEdit(r); }}>Edit</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); handleToggleActive(r); }}>
            {r.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">🏢 Branches</h1>
          <p className="page-subtitle">Manage store branches and locations</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ New Branch</button>
      </div>

      {/* Table section */}
      <div className="content-section">
        <DataTable columns={columns} data={branches} isLoading={isLoading} emptyMessage="No branches found" />
      </div>

      {/* Create / Edit Branch Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingBranch ? '✏️ Edit Branch' : '➕ New Branch'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="input-field" type="text" value={form.name} required placeholder="e.g. Main Branch" onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" value={form.code} required placeholder="e.g. MAIN" onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="input-field" type="text" value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="input-field" type="tel" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="input-field" type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                  Set as Default Branch
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingBranch ? 'Update Branch' : 'Create Branch'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
