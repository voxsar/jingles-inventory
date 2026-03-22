import { useEffect, useState } from 'react';
import { vendorsApi, settingsApi } from '../api/client';
import DataTable from '../components/DataTable';

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
  const [vendorTypes, setVendorTypes] = useState<{ value: string; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    try {
      const queryParams: Record<string, string> = {};
      if (typeFilter) queryParams.type = typeFilter;
      if (searchTerm) queryParams.search = searchTerm;
      if (statusFilter) queryParams.isActive = statusFilter;
      const res = await vendorsApi.list(queryParams);
      setSuppliers(res.data);
    } catch (err) {
      console.error('Failed to load suppliers', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadVendorTypes = async () => {
    try {
      const res = await settingsApi.listStatuses('vendor_type');
      const items: any[] = res.data?.data ?? res.data ?? [];
      setVendorTypes(items.map((s: any) => ({ value: s.value, label: s.label })));
    } catch (err) {
      console.error('Failed to load vendor types', err);
    }
  };

  useEffect(() => { loadVendorTypes(); }, []);
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
      render: (r: any) => {
        const tone = r.type === 'Supplier' ? 'info' : r.type === 'Both' ? 'warning' : '';
        return tone ? <s-badge tone={tone as any}>{r.type}</s-badge> : <s-badge>{r.type}</s-badge>;
      },
    },
    { key: 'contactEmail', header: 'Email', sortable: true },
    { key: 'contactPhone', header: 'Phone', render: (r: any) => r.contactPhone ?? '—' },
    { key: 'paymentTerms', header: 'Payment Terms', render: (r: any) => r.paymentTerms ?? '—' },
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
          <h1 className="page-title">🏭 Suppliers</h1>
          <p className="page-subtitle">Manage suppliers and vendor contacts</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ New Supplier</button>
      </div>

      {/* Table section */}
      <div className="content-section">
        {/* Filter bar */}
        <div className="filter-bar">
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search by name or email…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {vendorTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          {(searchTerm || typeFilter || statusFilter) && (
            <button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setTypeFilter(''); setStatusFilter(''); }}>
              ✕ Clear filters
            </button>
          )}
        </div>
        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          emptyMessage="No suppliers found"
        />
      </div>

      {/* Create / Edit Supplier Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingSupplier ? '✏️ Edit Supplier' : '➕ New Supplier'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="input-field" type="text" value={form.name} required onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type *</label>
                    <select className="input-field" value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}>
                      {vendorTypes.length === 0
                        ? <option value="">Loading…</option>
                        : vendorTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)
                      }
                    </select>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input className="input-field" type="email" value={form.contactEmail} required onChange={(e) => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="input-field" type="tel" value={form.contactPhone} onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="input-field" type="text" value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Website</label>
                    <input className="input-field" type="url" value={form.website} placeholder="https://…" onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tax ID</label>
                    <input className="input-field" type="text" value={form.taxId} onChange={(e) => setForm(f => ({ ...f, taxId: e.target.value }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Payment Terms</label>
                    <input className="input-field" type="text" value={form.paymentTerms} placeholder="e.g. Net 30" onChange={(e) => setForm(f => ({ ...f, paymentTerms: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input className="input-field" type="text" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingSupplier ? 'Update Supplier' : 'Create Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
