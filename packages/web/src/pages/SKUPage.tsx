import { useEffect, useRef, useState } from 'react';
import { skusApi, vendorsApi, categoriesApi, settingsApi, inventoryApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

const defaultForm = {
  skuCode: '',
  name: '',
  description: '',
  categoryId: '',
  vendorId: '',
  unitOfMeasure: '',
  unitOfMeasureId: '',
  isFragile: false,
  isActive: true,
  maxStackHeight: '',
  lowStockThreshold: '',
};

type ModalTab = 'details' | 'tags' | 'barcodes' | 'locations';

export default function SKUPage() {
  const [skus, setSkus] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [editingSku, setEditingSku] = useState<any>(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNewTagInput, setEditNewTagInput] = useState('');
  const [modalTab, setModalTab] = useState<ModalTab>('details');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [barcodes, setBarcodes] = useState<any[]>([]);
  const [newBarcode, setNewBarcode] = useState({ barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' });
  const [inventoryLocations, setInventoryLocations] = useState<any[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [transitioningInv, setTransitioningInv] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter) params.categoryId = categoryFilter;
      if (vendorFilter) params.vendorId = vendorFilter;
      const [skuRes, vendorRes, catRes, unitRes, tagRes] = await Promise.all([
        skusApi.list(params),
        vendorsApi.list(),
        categoriesApi.list(),
        settingsApi.listUnits(),
        skusApi.getAllTags(),
      ]);
      setSkus(skuRes.data.data.items ?? []);
      setTotal(skuRes.data.data.total ?? 0);
      setTotalPages(skuRes.data.data.totalPages ?? 1);
      setVendors(vendorRes.data?.data?.items ?? vendorRes.data ?? []);
      setCategories(catRes.data.data ?? []);
      setUnits(unitRes.data.data ?? []);
      setAllTags(tagRes.data.data ?? []);
    } catch (err) {
      console.error('Failed to load SKUs', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, pageSize, debouncedSearch, categoryFilter, vendorFilter]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  const handleUnitChange = (unitId: string, setter: any) => {
    const unit = units.find((u: any) => u.id === unitId);
    setter((f: any) => ({ ...f, unitOfMeasureId: unitId, unitOfMeasure: unit?.name ?? '' }));
  };

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
      const res = await skusApi.create(payload);
      const newSku = res.data.data;
      await Promise.all(formTags.map((tagId) => skusApi.addTag(newSku.id, tagId)));
      setShowCreateForm(false);
      setForm(defaultForm);
      setFormTags([]);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create SKU');
    }
  };

  const openEdit = async (sku: any) => {
    const unit = units.find((u: any) => u.name === sku.unitOfMeasure);
    setEditForm({
      skuCode: sku.skuCode, name: sku.name, description: sku.description ?? '',
      categoryId: sku.categoryId ?? '', vendorId: sku.vendorId ?? '',
      unitOfMeasure: sku.unitOfMeasure ?? '', unitOfMeasureId: unit?.id ?? '',
      isFragile: sku.isFragile ?? false, isActive: sku.isActive ?? true,
      maxStackHeight: sku.maxStackHeight != null ? String(sku.maxStackHeight) : '',
      lowStockThreshold: sku.lowStockThreshold != null ? String(sku.lowStockThreshold) : '',
    });
    setEditTags(sku.tags?.map((t: any) => t.tagId ?? t.tag?.id).filter(Boolean) ?? []);
    setEditingSku(sku);
    setModalTab('details');
    setSaveSuccess(false);
    setBarcodes([]);
    setInventoryLocations([]);
  };

  const handleSaveEdit = async () => {
    if (!editingSku) return;
    setIsSaving(true);
    try {
      const payload = {
        ...editForm,
        maxStackHeight: editForm.maxStackHeight ? parseFloat(editForm.maxStackHeight) : null,
        lowStockThreshold: editForm.lowStockThreshold ? parseInt(editForm.lowStockThreshold) : null,
        categoryId: editForm.categoryId || undefined,
        unitOfMeasureId: editForm.unitOfMeasureId || undefined,
      };
      await skusApi.update(editingSku.id, payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save SKU');
    } finally {
      setIsSaving(false);
    }
  };

  const resolveOrCreateTag = async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = allTags.find((t: any) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const res = await skusApi.createTag(trimmed);
    const newTag = res.data.data;
    setAllTags((prev: any[]) => [...prev, newTag]);
    return newTag.id;
  };

  const addFormTag = async () => {
    const id = await resolveOrCreateTag(newTagInput);
    if (id && !formTags.includes(id)) setFormTags((p) => [...p, id]);
    setNewTagInput('');
  };

  const addEditTag = async (tagId: string) => {
    if (editTags.includes(tagId)) return;
    await skusApi.addTag(editingSku.id, tagId);
    setEditTags((p) => [...p, tagId]);
  };

  const addEditTagByName = async () => {
    const id = await resolveOrCreateTag(editNewTagInput);
    if (id) await addEditTag(id);
    setEditNewTagInput('');
  };

  const removeEditTag = async (tagId: string) => {
    await skusApi.removeTag(editingSku.id, tagId);
    setEditTags((p) => p.filter((t) => t !== tagId));
  };

  const loadBarcodes = async () => {
    if (!editingSku) return;
    const res = await skusApi.getBarcodes(editingSku.id);
    setBarcodes(res.data.data ?? []);
  };

  const handleAddBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await skusApi.addBarcode(editingSku.id, newBarcode);
      setNewBarcode({ barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' });
      await loadBarcodes();
    } catch (err: any) { alert(err.response?.data?.error ?? 'Failed to add barcode'); }
  };

  const handleDeleteBarcode = async (bcId: string) => {
    if (!confirm('Remove this barcode?')) return;
    await skusApi.deleteBarcode(editingSku.id, bcId);
    await loadBarcodes();
  };

  const loadLocations = async () => {
    if (!editingSku) return;
    setLocationsLoading(true);
    try {
      const res = await skusApi.getInventoryLocations(editingSku.id);
      setInventoryLocations(res.data?.data?.items ?? []);
    } catch { setInventoryLocations([]); }
    finally { setLocationsLoading(false); }
  };

  const handleTabChange = (tab: ModalTab) => {
    setModalTab(tab);
    if (tab === 'barcodes') loadBarcodes();
    if (tab === 'locations') loadLocations();
  };

  const handleTransitionInv = async (record: any) => {
    const newState = prompt(`Transition to new state (current: ${record.state}):`);
    if (!newState) return;
    const reason = prompt('Reason (optional):') ?? undefined;
    setTransitioningInv(record.id);
    try {
      await inventoryApi.transition(record.id, newState, reason);
      await loadLocations();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Transition failed');
    } finally {
      setTransitioningInv(null);
    }
  };

  const getTagName = (id: string) => allTags.find((t: any) => t.id === id)?.name ?? id;

  const columns = [
    { key: 'skuCode', header: 'SKU Code', sortable: true, render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.skuCode}</span> },
    { key: 'name', header: 'Product Name', sortable: true },
    { key: 'category', header: 'Category', render: (r: any) => r.category?.name ?? <s-text>—</s-text> },
    { key: 'vendor', header: 'Vendor', render: (r: any) => r.vendor?.name },
    { key: 'unitOfMeasure', header: 'UoM' },
    {
      key: 'tags', header: 'Tags',
      render: (r: any) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {r.tags?.slice(0, 3).map((t: any) => <s-badge key={t.id} tone="info">{t.tag?.name ?? t.name}</s-badge>)}
          {r.tags?.length > 3 && <s-badge>+{r.tags.length - 3}</s-badge>}
        </div>
      ),
    },
    { key: 'lowStockThreshold', header: 'Low Stock', render: (r: any) => r.lowStockThreshold != null ? <span style={{ color: '#d97706', fontWeight: 500 }}>≤{r.lowStockThreshold}</span> : <s-text>—</s-text> },
    { key: 'isFragile', header: 'Fragile', render: (r: any) => r.isFragile ? <s-badge tone="warning">⚠️ Fragile</s-badge> : <s-text>No</s-text> },
    { key: 'isActive', header: 'Status', render: (r: any) => r.isActive ? <s-badge tone="success">● Active</s-badge> : <s-badge>○ Inactive</s-badge> },
    { key: 'actions', header: '', render: (r: any) => <s-button  onClick={(e: any) => { e.stopPropagation(); openEdit(r); }}>Edit</s-button> },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">🏷️ Products (SKUs)</h1>
          <p className="page-subtitle">{total.toLocaleString()} products total</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateForm(true)}>+ New Product</button>
      </div>

      {/* Table section */}
      <div className="content-section">
        {/* Filter bar */}
        <div className="filter-bar">
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search products…"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Categories</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            className="filter-select"
            value={vendorFilter}
            onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Vendors</option>
            {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {(searchTerm || categoryFilter || vendorFilter) && (
            <button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setCategoryFilter(''); setVendorFilter(''); setPage(1); }}>
              ✕ Clear filters
            </button>
          )}
        </div>
        <DataTable columns={columns} data={skus} isLoading={isLoading} emptyMessage="No products found." emptyIcon="🏷️" onRowClick={openEdit} />
        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </div>

      {/* Create Product Modal */}
      {showCreateForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreateForm(false)}>
          <div className="modal-panel-lg">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create New Product</h2>
              <button className="modal-close" onClick={() => { setShowCreateForm(false); setForm(defaultForm); setFormTags([]); }}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">SKU Code *</label>
                    <input className="input-field" type="text" value={form.skuCode} required placeholder="e.g. WDG-001" onChange={(e) => setForm((f) => ({ ...f, skuCode: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Product Name *</label>
                    <input className="input-field" type="text" value={form.name} required onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="input-field" value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
                      <option value="">— No Category —</option>
                      {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vendor *</label>
                    <select className="input-field" value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}>
                      <option value="">Select vendor</option>
                      {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Unit of Measure *</label>
                    {units.length > 0 ? (
                      <select className="input-field" value={form.unitOfMeasureId} onChange={(e) => handleUnitChange(e.target.value, setForm)}>
                        <option value="">— Select Unit —</option>
                        {units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                      </select>
                    ) : (
                      <input className="input-field" type="text" value={form.unitOfMeasure} required placeholder="e.g. Piece" onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} />
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Low Stock Alert</label>
                    <input className="input-field" type="number" value={form.lowStockThreshold} placeholder="Alert when qty ≤ value" onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input className="input-field" type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <p className="form-label mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formTags.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1">
                        <s-badge tone="info">{getTagName(id)}</s-badge>
                        <button type="button" onClick={() => setFormTags((p) => p.filter((t) => t !== id))} className="modal-close text-sm">✕</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" className="input-field flex-1" placeholder="Add or create tag…" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormTag(); } }} list="create-tag-opts" />
                    <datalist id="create-tag-opts">{allTags.map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
                    <button type="button" className="btn-secondary" onClick={addFormTag}>Add Tag</button>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" checked={form.isFragile} onChange={(e) => setForm((f) => ({ ...f, isFragile: e.target.checked }))} />
                    ⚠️ Fragile
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                    Active
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => { setShowCreateForm(false); setForm(defaultForm); setFormTags([]); }}>Cancel</button>
                <button type="submit" className="btn-primary">Create Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit SKU Modal */}
      {editingSku && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingSku(null)}>
          <div className="modal-panel-lg">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{editingSku.name}</h2>
                <span className="text-xs text-gray-400 font-mono">{editingSku.skuCode}</span>
              </div>
              <div className="flex items-center gap-3">
                {saveSuccess && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
                <button className="modal-close" onClick={() => setEditingSku(null)}>✕</button>
              </div>
            </div>
            {/* Tab nav */}
            <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-gray-200 bg-white">
              {(['details', 'tags', 'barcodes', 'locations'] as ModalTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabChange(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                    modalTab === tab
                      ? 'bg-white border-gray-200 text-primary-700 -mb-px z-10'
                      : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'details' && '📝 '}
                  {tab === 'tags' && '🏷️ '}
                  {tab === 'barcodes' && '📊 '}
                  {tab === 'locations' && '📍 '}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="modal-body">
              {modalTab === 'details' && (
                <div className="form-stack">
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">SKU Code</label>
                      <input className="input-field" type="text" value={editForm.skuCode} onChange={(e) => setEditForm((f) => ({ ...f, skuCode: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Product Name</label>
                      <input className="input-field" type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select className="input-field" value={editForm.categoryId} onChange={(e) => setEditForm((f) => ({ ...f, categoryId: e.target.value }))}>
                        <option value="">— No Category —</option>
                        {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Vendor</label>
                      <select className="input-field" value={editForm.vendorId} onChange={(e) => setEditForm((f) => ({ ...f, vendorId: e.target.value }))}>
                        <option value="">Select vendor</option>
                        {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label className="form-label">Unit of Measure</label>
                      {units.length > 0 ? (
                        <select className="input-field" value={editForm.unitOfMeasureId} onChange={(e) => handleUnitChange(e.target.value, setEditForm)}>
                          <option value="">— Select —</option>
                          {units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                        </select>
                      ) : (
                        <input className="input-field" type="text" value={editForm.unitOfMeasure} onChange={(e) => setEditForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} />
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Low Stock Threshold</label>
                      <input className="input-field" type="number" value={editForm.lowStockThreshold} onChange={(e) => setEditForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Max Stack Height (cm)</label>
                      <input className="input-field" type="number" value={editForm.maxStackHeight} onChange={(e) => setEditForm((f) => ({ ...f, maxStackHeight: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <input className="input-field" type="text" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={editForm.isFragile} onChange={(e) => setEditForm((f) => ({ ...f, isFragile: e.target.checked }))} />
                      ⚠️ Fragile
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      Active
                    </label>
                  </div>
                </div>
              )}
              {modalTab === 'tags' && (
                <div className="form-stack">
                  <p className="text-sm text-gray-500">Assign tags for filtering and organization.</p>
                  <div className="flex flex-wrap gap-2 min-h-[36px]">
                    {editTags.length === 0 ? <span className="text-sm text-gray-400">No tags assigned</span>
                      : editTags.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1">
                          <s-badge tone="info">{getTagName(id)}</s-badge>
                          <button onClick={() => removeEditTag(id)} className="modal-close text-sm">✕</button>
                        </span>
                      ))}
                  </div>
                  <div className="border-t border-gray-100 pt-4 flex gap-2">
                    <input type="text" className="input-field flex-1" placeholder="Type tag name…" value={editNewTagInput} onChange={(e) => setEditNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditTagByName(); } }} list="edit-tag-opts" />
                    <datalist id="edit-tag-opts">{allTags.filter((t: any) => !editTags.includes(t.id)).map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
                    <button type="button" className="btn-primary" onClick={addEditTagByName}>+ Add</button>
                  </div>
                  <p className="text-xs text-gray-400">New tags are created automatically.</p>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {allTags.length === 0 ? <span className="text-sm text-gray-400">No tags yet.</span>
                        : allTags.map((t: any) => (
                          <button key={t.id} onClick={() => addEditTag(t.id)} disabled={editTags.includes(t.id)} style={{ fontSize: '13px', padding: '4px 12px', borderRadius: '9999px', border: '1px solid', borderColor: editTags.includes(t.id) ? '#b5c4ff' : '#c9cccf', background: editTags.includes(t.id) ? '#e8efff' : 'white', color: editTags.includes(t.id) ? '#3b5bdb' : '#6d7175', cursor: editTags.includes(t.id) ? 'default' : 'pointer' }}>
                            {editTags.includes(t.id) ? '✓ ' : '+ '}{t.name}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
              {modalTab === 'barcodes' && (
                <div className="form-stack">
                  {barcodes.length === 0 ? <p className="text-sm text-gray-400">No barcodes assigned.</p>
                    : barcodes.map((bc: any) => (
                      <div key={bc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm">{bc.barcode}</span>
                          <s-badge>{bc.barcodeType}</s-badge>
                          {bc.isDefault && <s-badge tone="info">Default</s-badge>}
                          {bc.label && <span className="text-xs text-gray-500">({bc.label})</span>}
                        </div>
                        <button type="button" className="btn-sm text-red-600" onClick={() => handleDeleteBarcode(bc.id)}>Remove</button>
                      </div>
                    ))}
                  <form onSubmit={handleAddBarcode} className="border-t border-gray-100 pt-4 form-stack">
                    <p className="text-sm font-semibold text-gray-700">Add Barcode</p>
                    <div className="form-group">
                      <label className="form-label">Barcode value *</label>
                      <input className="input-field" type="text" value={newBarcode.barcode} required onChange={(e) => setNewBarcode((b) => ({ ...b, barcode: e.target.value }))} />
                    </div>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <select className="input-field" value={newBarcode.barcodeType} onChange={(e) => setNewBarcode((b) => ({ ...b, barcodeType: e.target.value }))}>
                          {['EAN13', 'UPC', 'QRCode', 'Code128', 'Code39', 'Custom'].map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Label (optional)</label>
                        <input className="input-field" type="text" value={newBarcode.label} onChange={(e) => setNewBarcode((b) => ({ ...b, label: e.target.value }))} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={newBarcode.isDefault} onChange={(e) => setNewBarcode((b) => ({ ...b, isDefault: e.target.checked }))} />
                      Set as Default
                    </label>
                    <button type="submit" className="btn-primary self-start">Add Barcode</button>
                  </form>
                </div>
              )}
              {modalTab === 'locations' && (
                <div>
                  <p className="text-sm text-gray-500 mb-4">Current inventory by location for this product. Click Transition to change state.</p>
                  {locationsLoading ? (
                    <p className="text-sm text-gray-400">Loading…</p>
                  ) : inventoryLocations.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-4xl mb-2">📭</div>
                      <p className="text-sm text-gray-400">No inventory records found</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {Object.entries(
                        inventoryLocations.reduce((acc: any, r: any) => {
                          const loc = r.location ? [r.location.floor, r.location.section, r.location.shelf, r.location.zone].filter(Boolean).join('-') : 'Unlocated';
                          if (!acc[loc]) acc[loc] = { location: r.location, records: [] };
                          acc[loc].records.push(r);
                          return acc;
                        }, {})
                      ).map(([locKey, val]: [string, any]) => {
                        const totalQty = val.records.reduce((s: number, r: any) => s + (r.quantity || 0), 0);
                        const isLowStock = editingSku?.lowStockThreshold != null && totalQty <= editingSku.lowStockThreshold;
                        return (
                          <div key={locKey} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                              <span className="font-medium text-sm">📍 {val.location ? [val.location.floor, val.location.section, val.location.shelf, val.location.zone].filter(Boolean).join(' › ') : 'No Location'}</span>
                              <div className="flex items-center gap-2">
                                {isLowStock && <s-badge tone="warning">⚠️ Low Stock</s-badge>}
                                <s-badge tone="info">{totalQty} units</s-badge>
                              </div>
                            </div>
                            {val.records.map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm border-b border-gray-100 last:border-0">
                                <div className="flex items-center gap-3">
                                  <s-badge>{r.state}</s-badge>
                                  {r.batchId && <span className="text-xs text-gray-500">Batch: {r.batchId}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-medium">{r.quantity} {editingSku?.unitOfMeasure}</span>
                                  <button
                                    className="btn-sm"
                                    disabled={transitioningInv === r.id}
                                    onClick={() => handleTransitionInv(r)}
                                  >
                                    {transitioningInv === r.id ? '…' : 'Transition'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditingSku(null)}>Close</button>
              {modalTab === 'details' && (
                <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? '⏳ Saving…' : '💾 Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
