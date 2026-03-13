import { useEffect, useRef, useState } from 'react';
import { skusApi, vendorsApi, categoriesApi, settingsApi } from '../api/client';
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
      for (const tagId of formTags) { await skusApi.addTag(newSku.id, tagId); }
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

  const getTagName = (id: string) => allTags.find((t: any) => t.id === id)?.name ?? id;

  const columns = [
    { key: 'skuCode', header: 'SKU Code', sortable: true, render: (r: any) => <span className="font-mono text-xs font-medium bg-gray-100 px-2 py-0.5 rounded">{r.skuCode}</span> },
    { key: 'name', header: 'Product Name', sortable: true },
    { key: 'category', header: 'Category', render: (r: any) => r.category?.name ?? <span className="text-gray-400">—</span> },
    { key: 'vendor', header: 'Vendor', render: (r: any) => r.vendor?.name },
    { key: 'unitOfMeasure', header: 'UoM' },
    {
      key: 'tags', header: 'Tags',
      render: (r: any) => (
        <div className="flex flex-wrap gap-1">
          {r.tags?.slice(0, 3).map((t: any) => <span key={t.id} className="badge bg-indigo-50 text-indigo-700">{t.tag?.name ?? t.name}</span>)}
          {r.tags?.length > 3 && <span className="badge bg-gray-100 text-gray-500">+{r.tags.length - 3}</span>}
        </div>
      ),
    },
    { key: 'lowStockThreshold', header: 'Low Stock', render: (r: any) => r.lowStockThreshold != null ? <span className="text-amber-600 font-medium">≤{r.lowStockThreshold}</span> : <span className="text-gray-400">—</span> },
    { key: 'isFragile', header: 'Fragile', render: (r: any) => r.isFragile ? <span className="badge bg-orange-50 text-orange-700">⚠️ Fragile</span> : <span className="text-gray-400">No</span> },
    { key: 'isActive', header: 'Status', render: (r: any) => r.isActive ? <span className="badge bg-green-50 text-green-700">● Active</span> : <span className="badge bg-gray-100 text-gray-500">○ Inactive</span> },
    { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50">Edit</button> },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏷️ Products (SKUs)</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} products total</p>
        </div>
        <button onClick={() => setShowCreateForm(!showCreateForm)} className="btn-primary">
          {showCreateForm ? '✕ Cancel' : '+ New Product'}
        </button>
      </div>

      {showCreateForm && (
        <div className="card">
          <h2 className="section-title">➕ Create New Product</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">SKU Code *</label><input type="text" value={form.skuCode} onChange={(e) => setForm((f) => ({ ...f, skuCode: e.target.value }))} required className="input-field" placeholder="e.g. WDG-001" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Product Name *</label><input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="input-field" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Category</label><select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className="input-field"><option value="">— No Category —</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Vendor *</label><select value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))} required className="input-field"><option value="">Select vendor</option>{vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Unit of Measure *</label>
                {units.length > 0 ? <select value={form.unitOfMeasureId} onChange={(e) => handleUnitChange(e.target.value, setForm)} required className="input-field"><option value="">— Select Unit —</option>{units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}</select>
                : <input type="text" value={form.unitOfMeasure} onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} required className="input-field" placeholder="e.g. Piece" />}
              </div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Low Stock Alert</label><input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} className="input-field" placeholder="Alert when qty ≤ value" /></div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field" rows={2} /></div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">{formTags.map((id) => <span key={id} className="inline-flex items-center gap-1 badge bg-indigo-50 text-indigo-700">{getTagName(id)}<button type="button" onClick={() => setFormTags((p) => p.filter((t) => t !== id))} className="ml-1 text-indigo-400 hover:text-indigo-700">✕</button></span>)}</div>
              <div className="flex gap-2">
                <input type="text" placeholder="Add or create tag..." value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormTag(); } }} list="create-tag-opts" className="input-field max-w-xs" />
                <datalist id="create-tag-opts">{allTags.map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
                <button type="button" onClick={addFormTag} className="btn-secondary text-xs">Add Tag</button>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isFragile} onChange={(e) => setForm((f) => ({ ...f, isFragile: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm text-gray-700">⚠️ Fragile</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm text-gray-700">Active</span></label>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-primary">Create Product</button>
              <button type="button" onClick={() => { setShowCreateForm(false); setForm(defaultForm); setFormTags([]); }} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card-flat overflow-hidden">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input type="text" placeholder="Search products..." value={searchTerm} onChange={(e) => handleSearchChange(e.target.value)} className="filter-input pl-9 w-full" />
          </div>
          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="filter-input"><option value="">All Categories</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }} className="filter-input"><option value="">All Vendors</option>{vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          {(searchTerm || categoryFilter || vendorFilter) && <button onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setCategoryFilter(''); setVendorFilter(''); setPage(1); }} className="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap">Clear filters</button>}
        </div>
        <DataTable columns={columns} data={skus} isLoading={isLoading} emptyMessage="No products found." emptyIcon="🏷️" onRowClick={openEdit} />
        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </div>

      {editingSku && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingSku(null)}>
          <div className="modal-panel max-w-2xl">
            <div className="modal-header">
              <div>
                <h2 className="text-lg font-semibold">{editingSku.name}</h2>
                <span className="font-mono text-xs text-gray-500">{editingSku.skuCode}</span>
              </div>
              <div className="flex items-center gap-3">
                {saveSuccess && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
                <button onClick={() => setEditingSku(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>
            <div className="border-b border-gray-200 px-6">
              <nav className="flex">
                {(['details', 'tags', 'barcodes', 'locations'] as ModalTab[]).map((tab) => (
                  <button key={tab} onClick={() => handleTabChange(tab)} className={`py-3 px-3 text-sm font-medium border-b-2 transition-colors ${modalTab === tab ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {tab === 'details' && '📝 '}{tab === 'tags' && '🏷️ '}{tab === 'barcodes' && '📊 '}{tab === 'locations' && '📍 '}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </nav>
            </div>
            <div className="modal-body">
              {modalTab === 'details' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">SKU Code</label><input type="text" value={editForm.skuCode} onChange={(e) => setEditForm((f) => ({ ...f, skuCode: e.target.value }))} className="input-field" /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Product Name</label><input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="input-field" /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Category</label><select value={editForm.categoryId} onChange={(e) => setEditForm((f) => ({ ...f, categoryId: e.target.value }))} className="input-field"><option value="">— No Category —</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Vendor</label><select value={editForm.vendorId} onChange={(e) => setEditForm((f) => ({ ...f, vendorId: e.target.value }))} className="input-field"><option value="">Select vendor</option>{vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Unit of Measure</label>
                      {units.length > 0 ? <select value={editForm.unitOfMeasureId} onChange={(e) => handleUnitChange(e.target.value, setEditForm)} className="input-field"><option value="">— Select —</option>{units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}</select>
                      : <input type="text" value={editForm.unitOfMeasure} onChange={(e) => setEditForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} className="input-field" />}
                    </div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Low Stock Threshold</label><input type="number" min="0" value={editForm.lowStockThreshold} onChange={(e) => setEditForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} className="input-field" /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Max Stack Height (cm)</label><input type="number" value={editForm.maxStackHeight} onChange={(e) => setEditForm((f) => ({ ...f, maxStackHeight: e.target.value }))} className="input-field" /></div>
                  </div>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description</label><textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="input-field" rows={3} /></div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editForm.isFragile} onChange={(e) => setEditForm((f) => ({ ...f, isFragile: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm">⚠️ Fragile</span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm">Active</span></label>
                  </div>
                </div>
              )}
              {modalTab === 'tags' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Assign tags for filtering and organization.</p>
                  <div className="flex flex-wrap gap-2 min-h-[36px]">
                    {editTags.length === 0 ? <p className="text-sm text-gray-400 italic">No tags assigned</p>
                      : editTags.map((id) => <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-indigo-100 text-indigo-800">{getTagName(id)}<button onClick={() => removeEditTag(id)} className="text-indigo-400 hover:text-indigo-700">✕</button></span>)}
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex gap-2">
                      <input type="text" placeholder="Type tag name..." value={editNewTagInput} onChange={(e) => setEditNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditTagByName(); } }} list="edit-tag-opts" className="input-field" />
                      <datalist id="edit-tag-opts">{allTags.filter((t: any) => !editTags.includes(t.id)).map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
                      <button onClick={addEditTagByName} className="btn-primary text-sm whitespace-nowrap">+ Add</button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">New tags created automatically.</p>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Available Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {allTags.length === 0 ? <p className="text-sm text-gray-400 italic">No tags yet.</p>
                        : allTags.map((t: any) => <button key={t.id} onClick={() => addEditTag(t.id)} disabled={editTags.includes(t.id)} className={`text-sm px-3 py-1 rounded-full border transition-colors ${editTags.includes(t.id) ? 'bg-indigo-100 text-indigo-700 border-indigo-200 cursor-default' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{editTags.includes(t.id) ? '✓ ' : '+ '}{t.name}</button>)}
                    </div>
                  </div>
                </div>
              )}
              {modalTab === 'barcodes' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {barcodes.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">No barcodes assigned.</p>
                      : barcodes.map((bc: any) => (
                        <div key={bc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm">{bc.barcode}</span>
                            <span className="badge bg-gray-100 text-gray-600">{bc.barcodeType}</span>
                            {bc.isDefault && <span className="badge bg-primary-50 text-primary-700">Default</span>}
                            {bc.label && <span className="text-xs text-gray-400">({bc.label})</span>}
                          </div>
                          <button onClick={() => handleDeleteBarcode(bc.id)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
                        </div>
                      ))}
                  </div>
                  <form onSubmit={handleAddBarcode} className="border-t pt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-600 uppercase">Add Barcode</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2"><input type="text" placeholder="Barcode value *" value={newBarcode.barcode} onChange={(e) => setNewBarcode((b) => ({ ...b, barcode: e.target.value }))} required className="input-field" /></div>
                      <select value={newBarcode.barcodeType} onChange={(e) => setNewBarcode((b) => ({ ...b, barcodeType: e.target.value }))} className="input-field">{['EAN13', 'UPC', 'QRCode', 'Code128', 'Code39', 'Custom'].map((t) => <option key={t} value={t}>{t}</option>)}</select>
                      <input type="text" placeholder="Label (optional)" value={newBarcode.label} onChange={(e) => setNewBarcode((b) => ({ ...b, label: e.target.value }))} className="input-field" />
                      <div className="flex items-center gap-2 col-span-2"><input type="checkbox" id="bcDefault" checked={newBarcode.isDefault} onChange={(e) => setNewBarcode((b) => ({ ...b, isDefault: e.target.checked }))} className="rounded border-gray-300" /><label htmlFor="bcDefault" className="text-sm">Set as Default</label></div>
                    </div>
                    <button type="submit" className="btn-primary">Add Barcode</button>
                  </form>
                </div>
              )}
              {modalTab === 'locations' && (
                <div>
                  <p className="text-sm text-gray-500 mb-4">Current inventory locations for this product.</p>
                  {locationsLoading ? (
                    <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" /></div>
                  ) : inventoryLocations.length === 0 ? (
                    <div className="text-center py-8"><div className="text-3xl mb-2">📭</div><p className="text-sm text-gray-500">No inventory records found</p></div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(
                        inventoryLocations.reduce((acc: any, r: any) => {
                          const loc = r.location ? [r.location.floor, r.location.section, r.location.shelf, r.location.zone].filter(Boolean).join('-') : 'Unlocated';
                          if (!acc[loc]) acc[loc] = { location: r.location, records: [] };
                          acc[loc].records.push(r);
                          return acc;
                        }, {})
                      ).map(([locKey, val]: [string, any]) => {
                        const totalQty = val.records.reduce((s: number, r: any) => s + (r.quantity || 0), 0);
                        return (
                          <div key={locKey} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                              <span className="font-medium text-sm">📍 {val.location ? [val.location.floor, val.location.section, val.location.shelf, val.location.zone].filter(Boolean).join(' › ') : 'No Location'}</span>
                              <span className="badge bg-blue-50 text-blue-700 font-semibold">{totalQty} units</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {val.records.map((r: any) => (
                                <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                                  <div className="flex items-center gap-3"><span className="badge bg-gray-100 text-gray-700">{r.state}</span>{r.batchId && <span className="text-gray-500 text-xs">Batch: {r.batchId}</span>}</div>
                                  <span className="font-medium">{r.quantity} {editingSku?.unitOfMeasure}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditingSku(null)} className="btn-secondary">Close</button>
              {modalTab === 'details' && <button onClick={handleSaveEdit} disabled={isSaving} className="btn-primary min-w-[120px]">{isSaving ? '⏳ Saving…' : '💾 Save Changes'}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
