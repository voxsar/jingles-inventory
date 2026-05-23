import { useEffect, useState } from 'react';
import { vendorsApi, settingsApi } from '../api/client';
import PaginatedDataTable from '../components/PaginatedDataTable';
import SearchableSelect from '../components/SearchableSelect';
import { UiBadge } from '../components/UiPrimitives';

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

type PageTab = 'suppliers' | 'duplicates';

const supplierTypeTone = (type?: string | null) =>
  type === 'Supplier' ? 'info' : type === 'Both' ? 'warning' : undefined;

const getWebsiteHost = (website?: string | null) => {
  if (!website) return '';
  try {
    const url = new URL(website.includes('://') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
};

const getSupplierMeta = (supplier: any) => ([
  supplier.contactEmail || null,
  supplier.contactPhone || null,
  getWebsiteHost(supplier.website) || null,
  supplier.taxId ? `Tax ID ${supplier.taxId}` : null,
]).filter(Boolean);

const getSupplierCounts = (supplier: any) => ([
  `${supplier._count?.skus ?? 0} primary products`,
  `${supplier._count?.skuVendors ?? 0} SKU links`,
  `${supplier._count?.grns ?? 0} GRNs`,
  `${supplier._count?.prns ?? 0} PRNs`,
  `${supplier._count?.users ?? 0} users`,
  `${supplier._count?.batches ?? 0} batches`,
]).filter(Boolean);

const emptyMergeTotals = {
  movedPrimaryProducts: 0,
  movedProductLinks: 0,
  movedUsers: 0,
  movedGrns: 0,
  movedPrns: 0,
  movedBatches: 0,
  updatedFieldCount: 0,
};

const addMergeTotals = (totals: typeof emptyMergeTotals, data: any) => ({
  movedPrimaryProducts: totals.movedPrimaryProducts + (data?.movedPrimaryProducts ?? 0),
  movedProductLinks: totals.movedProductLinks + (data?.movedProductLinks ?? 0),
  movedUsers: totals.movedUsers + (data?.movedUsers ?? 0),
  movedGrns: totals.movedGrns + (data?.movedGrns ?? 0),
  movedPrns: totals.movedPrns + (data?.movedPrns ?? 0),
  movedBatches: totals.movedBatches + (data?.movedBatches ?? 0),
  updatedFieldCount: totals.updatedFieldCount + (data?.updatedFieldCount ?? 0),
});

const formatMergeTotals = (totals: typeof emptyMergeTotals) => ({
  movedSummary: [
    `${totals.movedPrimaryProducts} primary product(s)`,
    `${totals.movedProductLinks} SKU link(s)`,
    `${totals.movedUsers} user(s)`,
    `${totals.movedGrns} GRN(s)`,
    `${totals.movedPrns} PRN(s)`,
    `${totals.movedBatches} batch(es)`,
  ].join(', '),
  updatedFieldMessage: totals.updatedFieldCount > 0
    ? ` Preserved ${totals.updatedFieldCount} target field(s) from the merged supplier.`
    : '',
});

export default function SuppliersPage() {
  const [pageTab, setPageTab] = useState<PageTab>('suppliers');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [vendorTypes, setVendorTypes] = useState<{ value: string; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [websiteFilter, setWebsiteFilter] = useState('');
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [duplicateGroupsLoading, setDuplicateGroupsLoading] = useState(false);
  const [duplicateGroupsLoaded, setDuplicateGroupsLoaded] = useState(false);
  const [duplicateActionId, setDuplicateActionId] = useState<string | null>(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [manualMergeTargetId, setManualMergeTargetId] = useState('');
  const [manualMergeBusy, setManualMergeBusy] = useState(false);

  const load = async () => {
    setIsLoading(true);
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
      setVendorTypes(items.map((status: any) => ({ value: status.value, label: status.label })));
    } catch (err) {
      console.error('Failed to load vendor types', err);
    }
  };

  const loadDuplicateGroups = async () => {
    setDuplicateGroupsLoading(true);
    try {
      const res = await vendorsApi.getDuplicateGroups({ minScore: '74', limit: '1000' });
      setDuplicateGroups(res.data?.data?.items ?? []);
      setDuplicateGroupsLoaded(true);
    } catch (err) {
      console.error('Failed to load supplier duplicate groups', err);
      setDuplicateGroups([]);
      setDuplicateGroupsLoaded(true);
    } finally {
      setDuplicateGroupsLoading(false);
    }
  };

  useEffect(() => {
    loadVendorTypes();
  }, []);

  useEffect(() => {
    load();
  }, [typeFilter, searchTerm, statusFilter]);

  useEffect(() => {
    if (pageTab === 'duplicates' && !duplicateGroupsLoaded) {
      loadDuplicateGroups();
    }
  }, [pageTab, duplicateGroupsLoaded]);

  useEffect(() => {
    setSelectedSupplierIds((current) => current.filter((id) => suppliers.some((supplier: any) => supplier.id === id)));
  }, [suppliers]);

  useEffect(() => {
    if (selectedSupplierIds.length === 0) {
      if (manualMergeTargetId) setManualMergeTargetId('');
      return;
    }
    if (!selectedSupplierIds.includes(manualMergeTargetId)) {
      setManualMergeTargetId(selectedSupplierIds[0] ?? '');
    }
  }, [selectedSupplierIds, manualMergeTargetId]);

  const filteredSuppliers = suppliers.filter((supplier: any) => {
    if (websiteFilter === 'true' && !supplier.website) return false;
    if (websiteFilter === 'false' && supplier.website) return false;
    return true;
  });
  const selectedSuppliers = suppliers.filter((supplier: any) => selectedSupplierIds.includes(supplier.id));
  const selectedSupplierOptions = selectedSuppliers.map((supplier: any) => ({
    value: supplier.id,
    label: `${supplier.name}${supplier.contactEmail ? ` - ${supplier.contactEmail}` : ''}`,
  }));

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

  const markDuplicatesDirty = async () => {
    setDuplicateGroupsLoaded(false);
    if (pageTab === 'duplicates') {
      await loadDuplicateGroups();
    }
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
      await Promise.all([load(), markDuplicatesDirty()]);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save');
    }
  };

  const handleToggleActive = async (supplier: any) => {
    try {
      await vendorsApi.update(supplier.id, { isActive: !supplier.isActive });
      await Promise.all([load(), markDuplicatesDirty()]);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update');
    }
  };

  const toggleSupplierSelection = (supplierId: string) => {
    setSelectedSupplierIds((current) => (
      current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId]
    ));
  };

  const clearManualSelection = () => {
    setSelectedSupplierIds([]);
    setManualMergeTargetId('');
  };

  const handleMergeDuplicateFor = async (targetSupplier: any, candidate: any) => {
    const candidateSupplier = candidate.vendor;
    if (!confirm(`Merge "${candidateSupplier.name}" into "${targetSupplier.name}"? Products, users, GRNs, PRNs, batches, and supplier links will move to the target supplier. Missing target contact details will be preserved from the duplicate when available.`)) return;

    setDuplicateActionId(candidateSupplier.id);
    try {
      const res = await vendorsApi.mergeDuplicate(targetSupplier.id, candidateSupplier.id);
      const data = res.data?.data;
      const { movedSummary, updatedFieldMessage } = formatMergeTotals(addMergeTotals(emptyMergeTotals, data));

      alert(`Merged ${data?.mergedVendorName ?? candidateSupplier.name}. Reassigned ${movedSummary}.${updatedFieldMessage}`);
      await Promise.all([load(), loadDuplicateGroups()]);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to merge supplier');
    } finally {
      setDuplicateActionId(null);
    }
  };

  const handleManualMergeSelected = async () => {
    if (selectedSupplierIds.length < 2 || !manualMergeTargetId) {
      alert('Select at least two suppliers and choose which one to keep.');
      return;
    }

    const targetSupplier = suppliers.find((supplier: any) => supplier.id === manualMergeTargetId);
    if (!targetSupplier) {
      alert('The supplier to keep could not be found. Please refresh and try again.');
      return;
    }

    const sourceSuppliers = selectedSuppliers.filter((supplier: any) => supplier.id !== manualMergeTargetId);
    if (sourceSuppliers.length === 0) {
      alert('Select at least one duplicate supplier to merge into the target.');
      return;
    }

    const sourceNames = sourceSuppliers.map((supplier: any) => supplier.name);
    const previewList = sourceNames.slice(0, 4).map((name) => `- ${name}`).join('\n');
    const extraCount = sourceNames.length > 4 ? `\n- and ${sourceNames.length - 4} more` : '';
    if (!confirm(`Keep "${targetSupplier.name}" and merge ${sourceSuppliers.length} other supplier(s) into it?\n\n${previewList}${extraCount}`)) return;

    setManualMergeBusy(true);
    let totals = { ...emptyMergeTotals };
    let mergedCount = 0;

    try {
      for (const sourceSupplier of sourceSuppliers) {
        const res = await vendorsApi.mergeDuplicate(targetSupplier.id, sourceSupplier.id);
        totals = addMergeTotals(totals, res.data?.data);
        mergedCount += 1;
      }

      const { movedSummary, updatedFieldMessage } = formatMergeTotals(totals);
      clearManualSelection();
      await Promise.all([load(), markDuplicatesDirty()]);
      alert(`Merged ${mergedCount} supplier(s) into ${targetSupplier.name}. Reassigned ${movedSummary}.${updatedFieldMessage}`);
    } catch (err: any) {
      await Promise.all([load(), markDuplicatesDirty()]);
      if (mergedCount > 0) {
        const { movedSummary, updatedFieldMessage } = formatMergeTotals(totals);
        alert(`Merged ${mergedCount} supplier(s) into ${targetSupplier.name} before the process stopped. Reassigned ${movedSummary}.${updatedFieldMessage} ${err.response?.data?.error ?? 'Failed to merge the remaining supplier.'}`);
      } else {
        alert(err.response?.data?.error ?? 'Failed to merge selected suppliers');
      }
    } finally {
      setManualMergeBusy(false);
    }
  };

  const columns = [
    {
      key: 'select',
      header: 'Select',
      align: 'center' as const,
      isAction: true,
      render: (row: any) => (
        <input
          type="checkbox"
          aria-label={`Select supplier ${row.name}`}
          checked={selectedSupplierIds.includes(row.id)}
          disabled={manualMergeBusy}
          onChange={(e) => {
            e.stopPropagation();
            toggleSupplierSelection(row.id);
          }}
        />
      ),
    },
    { key: 'name', header: 'Name', sortable: true },
    {
      key: 'type',
      header: 'Type',
      render: (row: any) => <UiBadge tone={supplierTypeTone(row.type)}>{row.type ?? 'Vendor'}</UiBadge>,
    },
    { key: 'contactEmail', header: 'Email', sortable: true },
    { key: 'contactPhone', header: 'Phone', render: (row: any) => row.contactPhone ?? '—' },
    { key: 'paymentTerms', header: 'Payment Terms', render: (row: any) => row.paymentTerms ?? '—' },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: any) => row.isActive
        ? <UiBadge tone="success">Active</UiBadge>
        : <UiBadge tone="critical">Inactive</UiBadge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: any) => (
        <div className="flex gap-2">
          <button className="btn-sm" disabled={manualMergeBusy} onClick={(e: any) => { e.stopPropagation(); openEdit(row); }}>Edit</button>
          <button className="btn-sm" disabled={manualMergeBusy} onClick={(e: any) => { e.stopPropagation(); handleToggleActive(row); }}>
            {row.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ];

  const pageSubtitle = pageTab === 'duplicates'
    ? 'Review likely duplicate suppliers and consolidate them into the best target record'
    : 'Manage suppliers and vendor contacts';

  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">🏭 Suppliers</h1>
          <p className="page-subtitle">{pageSubtitle}</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ New Supplier</button>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setPageTab('suppliers')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${pageTab === 'suppliers' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Suppliers
        </button>
        <button
          type="button"
          onClick={() => setPageTab('duplicates')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${pageTab === 'duplicates' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Possible Duplicates
        </button>
      </div>

      {pageTab === 'suppliers' && (
        <div className="content-section">
          <div className="filter-bar">
            <input
              type="search"
              className="filter-input-wide"
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div style={{ width: '180px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: 'All Types' },
                  ...vendorTypes.map((type) => ({ value: type.value, label: type.label })),
                ]}
                value={typeFilter}
                onChange={(value) => setTypeFilter(value)}
                placeholder="All Types"
                isClearable={false}
              />
            </div>
            <div style={{ width: '180px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'true', label: 'Active' },
                  { value: 'false', label: 'Inactive' },
                ]}
                value={statusFilter}
                onChange={(value) => setStatusFilter(value)}
                placeholder="All Statuses"
                isClearable={false}
              />
            </div>
            <div style={{ width: '180px' }}>
              <SearchableSelect
                options={[
                  { value: '', label: 'All Websites' },
                  { value: 'true', label: 'Has Website' },
                  { value: 'false', label: 'No Website' },
                ]}
                value={websiteFilter}
                onChange={(value) => setWebsiteFilter(value)}
                placeholder="All Websites"
                isClearable={false}
              />
            </div>
            {(searchTerm || typeFilter || statusFilter || websiteFilter) && (
              <button
                className="btn-secondary text-xs"
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('');
                  setStatusFilter('');
                  setWebsiteFilter('');
                }}
              >
                ✕ Clear filters
              </button>
            )}
          </div>
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">Manual merge selection</p>
                <p className="text-xs text-gray-500 mt-1">Select two or more suppliers from the table, choose which one to keep, then merge the others into it.</p>
              </div>
              {selectedSupplierIds.length > 0 && (
                <button className="btn-secondary text-xs" disabled={manualMergeBusy} onClick={clearManualSelection}>
                  Clear selection
                </button>
              )}
            </div>
            {selectedSupplierIds.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div style={{ width: '280px', maxWidth: '100%' }}>
                  <label className="form-label">Keep this supplier</label>
                  <SearchableSelect
                    options={selectedSupplierOptions}
                    value={manualMergeTargetId}
                    onChange={(value) => setManualMergeTargetId(value)}
                    placeholder="Choose supplier to keep"
                    isClearable={false}
                    isDisabled={manualMergeBusy || selectedSupplierOptions.length === 0}
                  />
                </div>
                <div className="text-xs text-gray-500 pb-2">
                  {selectedSupplierIds.length} selected
                  {selectedSupplierIds.length > 1 ? ` • ${selectedSupplierIds.length - 1} will merge into the target` : ' • select at least one more supplier to merge'}
                </div>
                <button
                  className="btn-primary"
                  disabled={manualMergeBusy || selectedSupplierIds.length < 2 || !manualMergeTargetId}
                  onClick={handleManualMergeSelected}
                >
                  {manualMergeBusy ? 'Merging…' : `Merge ${Math.max(selectedSupplierIds.length - 1, 0)} Into Target`}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-500">Use the checkboxes in the table to build a manual merge set.</p>
            )}
          </div>
          <PaginatedDataTable
            columns={columns}
            data={filteredSuppliers}
            isLoading={isLoading}
            emptyMessage="No suppliers found"
          />
        </div>
      )}

      {pageTab === 'duplicates' && (
        <div className="content-section">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-700">Possible duplicate suppliers</p>
              <p className="text-xs text-gray-500 mt-1">Review suppliers that share names or contact details, then merge them into the target record you want to keep.</p>
            </div>
            <button className="btn-secondary text-sm" onClick={loadDuplicateGroups} disabled={duplicateGroupsLoading}>
              {duplicateGroupsLoading ? 'Scanning…' : 'Rescan'}
            </button>
          </div>
          {duplicateGroupsLoading ? (
            <p className="px-4 py-8 text-sm text-gray-400">Scanning suppliers…</p>
          ) : duplicateGroups.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-2">🔎</div>
              <p className="text-sm text-gray-400">No likely duplicate suppliers found.</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {duplicateGroups.map((group: any) => {
                const target = group.target;
                return (
                  <div key={target.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-800">{target.name}</span>
                          <UiBadge tone={supplierTypeTone(target.type)}>{target.type ?? 'Vendor'}</UiBadge>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                          {getSupplierMeta(target).map((item, index) => <span key={`${target.id}-meta-${index}`}>{item}</span>)}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                          {getSupplierCounts(target).map((item, index) => <span key={`${target.id}-count-${index}`}>{item}</span>)}
                        </div>
                      </div>
                      <button className="btn-sm text-xs" onClick={() => openEdit(target)}>Open Target</button>
                    </div>
                    <div className="table-scroll-region overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-gray-50">
                            {['Actions', 'Candidate', 'Match', 'Counts', 'Shared Data'].map((header, index) => (
                              <th
                                key={header}
                                className={`px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200 ${index === 0 ? 'table-sticky-cell table-sticky-cell--header bg-gray-50' : ''}`}
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((candidate: any) => {
                            const supplier = candidate.vendor;
                            const isWorking = duplicateActionId === supplier.id;
                            return (
                              <tr key={supplier.id} className="group border-b border-gray-100 last:border-0 align-top">
                                <td className="table-sticky-cell px-3 py-3 bg-white group-hover:bg-gray-50">
                                  <button
                                    className="btn-sm text-red-600 text-xs"
                                    disabled={isWorking}
                                    onClick={() => handleMergeDuplicateFor(target, candidate)}
                                  >
                                    {isWorking ? 'Working…' : 'Merge'}
                                  </button>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="font-medium text-gray-800">{supplier.name}</div>
                                    <UiBadge tone={supplierTypeTone(supplier.type)}>{supplier.type ?? 'Vendor'}</UiBadge>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                                    {getSupplierMeta(supplier).map((item, index) => <span key={`${supplier.id}-meta-${index}`}>{item}</span>)}
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">
                                    Duplicate
                                  </span>
                                  <div className="text-xs text-gray-500 mt-1">{candidate.score}% match</div>
                                  <div className="text-xs text-gray-400">{candidate.reason}</div>
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-500">
                                  {getSupplierCounts(supplier).map((item, index) => <div key={`${supplier.id}-count-${index}`}>{item}</div>)}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    {candidate.matchedSignals?.length > 0 ? candidate.matchedSignals.map((signal: any) => (
                                      <span
                                        key={`${supplier.id}-${signal.key}-${signal.value ?? 'match'}`}
                                        className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                                      >
                                        {signal.label}
                                        {signal.value ? `: ${signal.value}` : ''}
                                      </span>
                                    )) : (
                                      <span className="text-xs text-gray-400">Name match only</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                    <input className="input-field" type="text" value={form.name} required onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type *</label>
                    <SearchableSelect
                      options={vendorTypes.length === 0
                        ? [{ value: '', label: 'Loading…' }]
                        : vendorTypes.map((type) => ({ value: type.value, label: type.label }))
                      }
                      value={form.type}
                      onChange={(value) => setForm((current) => ({ ...current, type: value }))}
                      placeholder="Select Type"
                      isClearable={false}
                    />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input className="input-field" type="email" value={form.contactEmail} required onChange={(e) => setForm((current) => ({ ...current, contactEmail: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="input-field" type="tel" value={form.contactPhone} onChange={(e) => setForm((current) => ({ ...current, contactPhone: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="input-field" type="text" value={form.address} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Website</label>
                    <input className="input-field" type="url" value={form.website} placeholder="https://…" onChange={(e) => setForm((current) => ({ ...current, website: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tax ID</label>
                    <input className="input-field" type="text" value={form.taxId} onChange={(e) => setForm((current) => ({ ...current, taxId: e.target.value }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Payment Terms</label>
                    <input className="input-field" type="text" value={form.paymentTerms} placeholder="e.g. Net 30" onChange={(e) => setForm((current) => ({ ...current, paymentTerms: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input className="input-field" type="text" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
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
