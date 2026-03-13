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
        <div style={{ display: 'flex', gap: '8px' }}>
          <s-button  onClick={(e: any) => { e.stopPropagation(); openEdit(r); }}>Edit</s-button>
          <s-button  onClick={(e: any) => { e.stopPropagation(); handleToggleActive(r); }}>
            {r.isActive ? 'Disable' : 'Enable'}
          </s-button>
        </div>
      ),
    },
  ];

  return (
    <>
      <s-stack direction="inline" gap="base">
        <div>
          <s-heading>🏢 Branches</s-heading>
          <s-text>Manage store branches and locations</s-text>
        </div>
        <s-button variant="primary" onClick={openCreate}>+ New Branch</s-button>
      </s-stack>

      {showForm && (
        <s-section heading={editingBranch ? 'Edit Branch' : 'New Branch'}>
          <form onSubmit={handleSubmit}>
            <s-stack gap="base">
              <s-stack direction="inline" gap="base">
                <s-text-field label="Name *" value={form.name} required placeholder="e.g. Main Branch" onChange={(e: any) => setForm(f => ({ ...f, name: e.currentTarget.value }))} />
                <s-text-field label="Code *" value={form.code} required placeholder="e.g. MAIN" onChange={(e: any) => setForm(f => ({ ...f, code: e.currentTarget.value.toUpperCase() }))} />
              </s-stack>
              <s-text-field label="Address" value={form.address} onChange={(e: any) => setForm(f => ({ ...f, address: e.currentTarget.value }))} />
              <s-stack direction="inline" gap="base">
                <s-text-field label="Phone" type="tel" value={form.phone} onChange={(e: any) => setForm(f => ({ ...f, phone: e.currentTarget.value }))} />
                <s-text-field label="Email" type="email" value={form.email} onChange={(e: any) => setForm(f => ({ ...f, email: e.currentTarget.value }))} />
              </s-stack>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
                <span>Set as Default Branch</span>
              </label>
              <s-stack direction="inline" gap="base">
                <s-button variant="primary" type="submit">{editingBranch ? 'Update Branch' : 'Create Branch'}</s-button>
                <s-button type="button" onClick={() => setShowForm(false)}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      )}

      <s-section>
        <DataTable columns={columns} data={branches} isLoading={isLoading} emptyMessage="No branches found" />
      </s-section>
    </>

  );
}
