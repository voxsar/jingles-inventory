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
    <>
      <s-stack direction="inline" gap="base">
        <div>
          <s-heading>🏷️ Products (SKUs)</s-heading>
          <s-text>{total.toLocaleString()} products total</s-text>
        </div>
        <s-button variant="primary" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? '✕ Cancel' : '+ New Product'}
        </s-button>
      </s-stack>

      {showCreateForm && (
        <s-section heading="➕ Create New Product">
          <form onSubmit={handleCreate}>
            <s-stack gap="base">
              <s-stack direction="inline" gap="base">
                <s-text-field label="SKU Code *" value={form.skuCode} required placeholder="e.g. WDG-001" onChange={(e: any) => setForm((f) => ({ ...f, skuCode: e.currentTarget.value }))} />
                <s-text-field label="Product Name *" value={form.name} required onChange={(e: any) => setForm((f) => ({ ...f, name: e.currentTarget.value }))} />
                <s-select label="Category" value={form.categoryId} onChange={(e: any) => setForm((f) => ({ ...f, categoryId: e.currentTarget.value }))}>
                  <s-option value="">— No Category —</s-option>
                  {categories.map((c: any) => <s-option key={c.id} value={c.id}>{c.name}</s-option>)}
                </s-select>
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-select label="Vendor *" value={form.vendorId} onChange={(e: any) => setForm((f) => ({ ...f, vendorId: e.currentTarget.value }))}>
                  <s-option value="">Select vendor</s-option>
                  {vendors.map((v: any) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
                </s-select>
                {units.length > 0 ? (
                  <s-select label="Unit of Measure *" value={form.unitOfMeasureId} onChange={(e: any) => handleUnitChange(e.currentTarget.value, setForm)}>
                    <s-option value="">— Select Unit —</s-option>
                    {units.map((u: any) => <s-option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</s-option>)}
                  </s-select>
                ) : (
                  <s-text-field label="Unit of Measure *" value={form.unitOfMeasure} required placeholder="e.g. Piece" onChange={(e: any) => setForm((f) => ({ ...f, unitOfMeasure: e.currentTarget.value }))} />
                )}
                <s-text-field label="Low Stock Alert" type="number" value={form.lowStockThreshold} placeholder="Alert when qty ≤ value" onChange={(e: any) => setForm((f) => ({ ...f, lowStockThreshold: e.currentTarget.value }))} />
              </s-stack>
              <s-text-field label="Description" value={form.description} onChange={(e: any) => setForm((f) => ({ ...f, description: e.currentTarget.value }))} />
              <div>
                <s-text>Tags</s-text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  {formTags.map((id) => (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <s-badge tone="info">{getTagName(id)}</s-badge>
                      <button type="button" onClick={() => setFormTags((p) => p.filter((t) => t !== id))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                    </span>
                  ))}
                </div>
                <s-stack direction="inline" gap="base">
                  <input type="text" placeholder="Add or create tag..." value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormTag(); } }} list="create-tag-opts" style={{ flex: 1, padding: '8px', border: '1px solid #c9cccf', borderRadius: '6px', fontSize: '14px' }} />
                  <datalist id="create-tag-opts">{allTags.map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
                  <s-button type="button" onClick={addFormTag}>Add Tag</s-button>
                </s-stack>
              </div>
              <s-stack direction="inline" gap="base">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isFragile} onChange={(e) => setForm((f) => ({ ...f, isFragile: e.target.checked }))} />
                  <span>⚠️ Fragile</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                  <span>Active</span>
                </label>
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-button variant="primary" type="submit">Create Product</s-button>
                <s-button type="button" onClick={() => { setShowCreateForm(false); setForm(defaultForm); setFormTags([]); }}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      )}

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-search-field label="Search" label-visibility="hidden" value={searchTerm} placeholder="Search products..." onChange={(e: any) => handleSearchChange(e.currentTarget.value)} />
          <s-select label="Category" label-visibility="hidden" value={categoryFilter} onChange={(e: any) => { setCategoryFilter(e.currentTarget.value); setPage(1); }}>
            <s-option value="">All Categories</s-option>
            {categories.map((c: any) => <s-option key={c.id} value={c.id}>{c.name}</s-option>)}
          </s-select>
          <s-select label="Vendor" label-visibility="hidden" value={vendorFilter} onChange={(e: any) => { setVendorFilter(e.currentTarget.value); setPage(1); }}>
            <s-option value="">All Vendors</s-option>
            {vendors.map((v: any) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
          </s-select>
          {(searchTerm || categoryFilter || vendorFilter) && (
            <s-button  onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setCategoryFilter(''); setVendorFilter(''); setPage(1); }}>Clear filters</s-button>
          )}
        </s-stack>
        <DataTable columns={columns} data={skus} isLoading={isLoading} emptyMessage="No products found." emptyIcon="🏷️" onRowClick={openEdit} />
        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </s-section>

      {editingSku && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={(e) => e.target === e.currentTarget && setEditingSku(null)}>
          <div style={{ background: 'white', borderRadius: '8px', width: '100%', maxWidth: '672px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e1e3e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <s-heading>{editingSku.name}</s-heading>
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6d7175' }}>{editingSku.skuCode}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {saveSuccess && <s-text>✓ Saved</s-text>}
                <button onClick={() => setEditingSku(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6d7175' }}>✕</button>
              </div>
            </div>
            <div style={{ borderBottom: '1px solid #e1e3e5', padding: '0 24px' }}>
              <s-stack direction="inline" gap="base">
                {(['details', 'tags', 'barcodes', 'locations'] as ModalTab[]).map((tab) => (
                  <s-button key={tab} variant={modalTab === tab ? 'primary' : 'plain'} onClick={() => handleTabChange(tab)}>
                    {tab === 'details' && '📝 '}{tab === 'tags' && '🏷️ '}{tab === 'barcodes' && '📊 '}{tab === 'locations' && '📍 '}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </s-button>
                ))}
              </s-stack>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {modalTab === 'details' && (
                <s-stack gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-text-field label="SKU Code" value={editForm.skuCode} onChange={(e: any) => setEditForm((f) => ({ ...f, skuCode: e.currentTarget.value }))} />
                    <s-text-field label="Product Name" value={editForm.name} onChange={(e: any) => setEditForm((f) => ({ ...f, name: e.currentTarget.value }))} />
                  </s-stack>
                  <s-stack direction="inline" gap="base">
                    <s-select label="Category" value={editForm.categoryId} onChange={(e: any) => setEditForm((f) => ({ ...f, categoryId: e.currentTarget.value }))}>
                      <s-option value="">— No Category —</s-option>
                      {categories.map((c: any) => <s-option key={c.id} value={c.id}>{c.name}</s-option>)}
                    </s-select>
                    <s-select label="Vendor" value={editForm.vendorId} onChange={(e: any) => setEditForm((f) => ({ ...f, vendorId: e.currentTarget.value }))}>
                      <s-option value="">Select vendor</s-option>
                      {vendors.map((v: any) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
                    </s-select>
                  </s-stack>
                  <s-stack direction="inline" gap="base">
                    {units.length > 0 ? (
                      <s-select label="Unit of Measure" value={editForm.unitOfMeasureId} onChange={(e: any) => handleUnitChange(e.currentTarget.value, setEditForm)}>
                        <s-option value="">— Select —</s-option>
                        {units.map((u: any) => <s-option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</s-option>)}
                      </s-select>
                    ) : (
                      <s-text-field label="Unit of Measure" value={editForm.unitOfMeasure} onChange={(e: any) => setEditForm((f) => ({ ...f, unitOfMeasure: e.currentTarget.value }))} />
                    )}
                    <s-text-field label="Low Stock Threshold" type="number" value={editForm.lowStockThreshold} onChange={(e: any) => setEditForm((f) => ({ ...f, lowStockThreshold: e.currentTarget.value }))} />
                    <s-text-field label="Max Stack Height (cm)" type="number" value={editForm.maxStackHeight} onChange={(e: any) => setEditForm((f) => ({ ...f, maxStackHeight: e.currentTarget.value }))} />
                  </s-stack>
                  <s-text-field label="Description" value={editForm.description} onChange={(e: any) => setEditForm((f) => ({ ...f, description: e.currentTarget.value }))} />
                  <s-stack direction="inline" gap="base">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editForm.isFragile} onChange={(e) => setEditForm((f) => ({ ...f, isFragile: e.target.checked }))} />
                      <span>⚠️ Fragile</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      <span>Active</span>
                    </label>
                  </s-stack>
                </s-stack>
              )}
              {modalTab === 'tags' && (
                <s-stack gap="base">
                  <s-text>Assign tags for filtering and organization.</s-text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '36px' }}>
                    {editTags.length === 0 ? <s-text>No tags assigned</s-text>
                      : editTags.map((id) => (
                        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <s-badge tone="info">{getTagName(id)}</s-badge>
                          <button onClick={() => removeEditTag(id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                        </span>
                      ))}
                  </div>
                  <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '16px' }}>
                    <s-stack direction="inline" gap="base">
                      <input type="text" placeholder="Type tag name..." value={editNewTagInput} onChange={(e) => setEditNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditTagByName(); } }} list="edit-tag-opts" style={{ flex: 1, padding: '8px', border: '1px solid #c9cccf', borderRadius: '6px', fontSize: '14px' }} />
                      <datalist id="edit-tag-opts">{allTags.filter((t: any) => !editTags.includes(t.id)).map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
                      <s-button variant="primary" onClick={addEditTagByName}>+ Add</s-button>
                    </s-stack>
                    <s-text>New tags created automatically.</s-text>
                  </div>
                  <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '16px' }}>
                    <s-text>Available Tags</s-text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                      {allTags.length === 0 ? <s-text>No tags yet.</s-text>
                        : allTags.map((t: any) => (
                          <button key={t.id} onClick={() => addEditTag(t.id)} disabled={editTags.includes(t.id)} style={{ fontSize: '14px', padding: '4px 12px', borderRadius: '9999px', border: '1px solid', borderColor: editTags.includes(t.id) ? '#b5c4ff' : '#c9cccf', background: editTags.includes(t.id) ? '#e8efff' : 'white', color: editTags.includes(t.id) ? '#3b5bdb' : '#6d7175', cursor: editTags.includes(t.id) ? 'default' : 'pointer' }}>
                            {editTags.includes(t.id) ? '✓ ' : '+ '}{t.name}
                          </button>
                        ))}
                    </div>
                  </div>
                </s-stack>
              )}
              {modalTab === 'barcodes' && (
                <s-stack gap="base">
                  {barcodes.length === 0 ? <s-text>No barcodes assigned.</s-text>
                    : barcodes.map((bc: any) => (
                      <div key={bc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #e1e3e5', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontFamily: 'monospace' }}>{bc.barcode}</span>
                          <s-badge>{bc.barcodeType}</s-badge>
                          {bc.isDefault && <s-badge tone="info">Default</s-badge>}
                          {bc.label && <s-text>({bc.label})</s-text>}
                        </div>
                        <s-button  onClick={() => handleDeleteBarcode(bc.id)}>Remove</s-button>
                      </div>
                    ))}
                  <form onSubmit={handleAddBarcode} style={{ borderTop: '1px solid #e1e3e5', paddingTop: '16px' }}>
                    <s-stack gap="base">
                      <s-text>Add Barcode</s-text>
                      <s-text-field label="Barcode value *" value={newBarcode.barcode} required onChange={(e: any) => setNewBarcode((b) => ({ ...b, barcode: e.currentTarget.value }))} />
                      <s-stack direction="inline" gap="base">
                        <s-select label="Type" value={newBarcode.barcodeType} onChange={(e: any) => setNewBarcode((b) => ({ ...b, barcodeType: e.currentTarget.value }))}>
                          {['EAN13', 'UPC', 'QRCode', 'Code128', 'Code39', 'Custom'].map((t) => <s-option key={t} value={t}>{t}</s-option>)}
                        </s-select>
                        <s-text-field label="Label (optional)" value={newBarcode.label} onChange={(e: any) => setNewBarcode((b) => ({ ...b, label: e.currentTarget.value }))} />
                      </s-stack>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" id="bcDefault" checked={newBarcode.isDefault} onChange={(e) => setNewBarcode((b) => ({ ...b, isDefault: e.target.checked }))} />
                        <span>Set as Default</span>
                      </label>
                      <s-button variant="primary" type="submit">Add Barcode</s-button>
                    </s-stack>
                  </form>
                </s-stack>
              )}
              {modalTab === 'locations' && (
                <div>
                  <s-text>Current inventory locations for this product.</s-text>
                  {locationsLoading ? (
                    <s-text>Loading...</s-text>
                  ) : inventoryLocations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '8px' }}>📭</div>
                      <s-text>No inventory records found</s-text>
                    </div>
                  ) : (
                    <s-stack gap="base">
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
                          <div key={locKey} style={{ border: '1px solid #e1e3e5', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#f6f6f7', borderBottom: '1px solid #e1e3e5' }}>
                              <span style={{ fontWeight: 500, fontSize: '14px' }}>📍 {val.location ? [val.location.floor, val.location.section, val.location.shelf, val.location.zone].filter(Boolean).join(' › ') : 'No Location'}</span>
                              <s-badge tone="info">{totalQty} units</s-badge>
                            </div>
                            {val.records.map((r: any) => (
                              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', fontSize: '14px', borderBottom: '1px solid #f1f1f1' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <s-badge>{r.state}</s-badge>
                                  {r.batchId && <s-text>Batch: {r.batchId}</s-text>}
                                </div>
                                <span style={{ fontWeight: 500 }}>{r.quantity} {editingSku?.unitOfMeasure}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </s-stack>
                  )}
                </div>
              )}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e1e3e5', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <s-button onClick={() => setEditingSku(null)}>Close</s-button>
              {modalTab === 'details' && <s-button variant="primary" onClick={handleSaveEdit} disabled={isSaving}>{isSaving ? '⏳ Saving…' : '💾 Save Changes'}</s-button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
