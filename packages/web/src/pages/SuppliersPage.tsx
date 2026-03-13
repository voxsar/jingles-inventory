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
          <s-heading>🏭 Suppliers</s-heading>
          <s-text>Manage suppliers and vendor contacts</s-text>
        </div>
        <s-button variant="primary" onClick={openCreate}>+ New Supplier</s-button>
      </s-stack>

      {showForm && (
        <s-section heading={editingSupplier ? 'Edit Supplier' : 'New Supplier'}>
          <form onSubmit={handleSubmit}>
            <s-stack gap="base">
              <s-stack direction="inline" gap="base">
                <s-text-field label="Name *" value={form.name} required onChange={(e: any) => setForm(f => ({ ...f, name: e.currentTarget.value }))} />
                <s-select label="Type *" value={form.type} onChange={(e: any) => setForm(f => ({ ...f, type: e.currentTarget.value }))}>
                  {VENDOR_TYPES.map(t => <s-option key={t} value={t}>{t}</s-option>)}
                </s-select>
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-text-field label="Email *" type="email" value={form.contactEmail} required onChange={(e: any) => setForm(f => ({ ...f, contactEmail: e.currentTarget.value }))} />
                <s-text-field label="Phone" type="tel" value={form.contactPhone} onChange={(e: any) => setForm(f => ({ ...f, contactPhone: e.currentTarget.value }))} />
              </s-stack>
              <s-text-field label="Address" value={form.address} onChange={(e: any) => setForm(f => ({ ...f, address: e.currentTarget.value }))} />
              <s-stack direction="inline" gap="base">
                <s-text-field label="Website" type="url" value={form.website} placeholder="https://..." onChange={(e: any) => setForm(f => ({ ...f, website: e.currentTarget.value }))} />
                <s-text-field label="Tax ID" value={form.taxId} onChange={(e: any) => setForm(f => ({ ...f, taxId: e.currentTarget.value }))} />
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-text-field label="Payment Terms" value={form.paymentTerms} placeholder="e.g. Net 30" onChange={(e: any) => setForm(f => ({ ...f, paymentTerms: e.currentTarget.value }))} />
                <s-text-field label="Notes" value={form.notes} onChange={(e: any) => setForm(f => ({ ...f, notes: e.currentTarget.value }))} />
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-button variant="primary" type="submit">{editingSupplier ? 'Update' : 'Create'}</s-button>
                <s-button type="button" onClick={() => setShowForm(false)}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      )}

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-search-field label="Search" label-visibility="hidden" value={searchTerm} placeholder="Search by name or email..." onChange={(e: any) => setSearchTerm(e.currentTarget.value)} />
          <s-select label="Type" label-visibility="hidden" value={typeFilter} onChange={(e: any) => setTypeFilter(e.currentTarget.value)}>
            <s-option value="">All Types</s-option>
            {VENDOR_TYPES.map(t => <s-option key={t} value={t}>{t}</s-option>)}
          </s-select>
          <s-select label="Status" label-visibility="hidden" value={statusFilter} onChange={(e: any) => setStatusFilter(e.currentTarget.value)}>
            <s-option value="">All Statuses</s-option>
            <s-option value="true">Active</s-option>
            <s-option value="false">Inactive</s-option>
          </s-select>
        </s-stack>
        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          emptyMessage="No suppliers found"
        />
      </s-section>
    </>
  );
}
