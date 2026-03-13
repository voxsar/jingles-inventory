import { useEffect, useState } from 'react';
import { categoriesApi } from '../api/client';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder: number;
  isActive: boolean;
  children?: Category[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const defaultForm = {
  name: '',
  slug: '',
  description: '',
  parentId: '',
  sortOrder: '0',
};

function CategoryRow({
  category,
  depth,
  allCategories,
  onEdit,
  onDelete,
}: {
  category: Category;
  depth: number;
  allCategories: Category[];
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  return (
    <>
      <tr style={{ borderBottom: '1px solid #e1e3e5' }}>
        <td style={{ padding: '8px 16px', fontSize: '14px' }}>
          <div style={{ paddingLeft: `${depth * 20}px`, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {depth > 0 && <span style={{ color: '#c9cccf' }}>└</span>}
            <span style={{ fontWeight: 500 }}>{category.name}</span>
          </div>
        </td>
        <td style={{ padding: '8px 16px', fontSize: '14px', fontFamily: 'monospace', color: '#6d7175' }}>{category.slug}</td>
        <td style={{ padding: '8px 16px', fontSize: '14px', color: '#6d7175' }}>{category.description ?? '—'}</td>
        <td style={{ padding: '8px 16px', fontSize: '14px', textAlign: 'center' }}>{category.sortOrder}</td>
        <td style={{ padding: '8px 16px', fontSize: '14px' }}>
          {category.isActive
            ? <s-badge tone="success">Active</s-badge>
            : <s-badge tone="critical">Inactive</s-badge>}
        </td>
        <td style={{ padding: '8px 16px', fontSize: '14px' }}>
          <div className="flex gap-2">
            <button className="btn-sm" onClick={() => onEdit(category)}>Edit</button>
            <button className="btn-sm text-red-600" onClick={() => onDelete(category)}>Delete</button>
          </div>
        </td>
      </tr>
      {category.children?.map(child => (
        <CategoryRow
          key={child.id}
          category={child}
          depth={depth + 1}
          allCategories={allCategories}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [flat, setFlat] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState(defaultForm);

  const load = async () => {
    try {
      const [treeRes, flatRes] = await Promise.all([
        categoriesApi.tree(),
        categoriesApi.list(),
      ]);
      setCategories(treeRes.data.data);
      setFlat(flatRes.data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = (parentId?: string) => {
    setEditingCategory(null);
    setForm({ ...defaultForm, parentId: parentId ?? '' });
    setShowForm(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      parentId: cat.parentId ?? '',
      sortOrder: String(cat.sortOrder),
    });
    setShowForm(true);
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await categoriesApi.delete(cat.id);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete category');
    }
  };

  const handleNameChange = (name: string) => {
    setForm(f => ({
      ...f,
      name,
      slug: editingCategory ? f.slug : slugify(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      parentId: form.parentId || undefined,
      sortOrder: parseInt(form.sortOrder) || 0,
    };
    try {
      if (editingCategory) {
        await categoriesApi.update(editingCategory.id, payload);
      } else {
        await categoriesApi.create(payload);
      }
      setShowForm(false);
      setEditingCategory(null);
      setForm(defaultForm);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save category');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">🗂️ Categories</h1>
          <p className="page-subtitle">Manage nested product categories and sub-categories</p>
        </div>
        <button className="btn-primary" onClick={() => openCreate()}>+ New Category</button>
      </div>

      {/* Table section */}
      <div className="content-section">
        {isLoading ? (
          <div className="px-6 py-8 text-gray-500 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f6f6f7' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e1e3e5' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e1e3e5' }}>Slug</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e1e3e5' }}>Description</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e1e3e5' }}>Order</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e1e3e5' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e1e3e5' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: '#6d7175' }}>
                      No categories yet. Click "+ New Category" to create one.
                    </td>
                  </tr>
                ) : (
                  categories.map(cat => (
                    <CategoryRow
                      key={cat.id}
                      category={cat}
                      depth={0}
                      allCategories={flat}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Category Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingCategory ? '✏️ Edit Category' : '➕ New Category'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="input-field" type="text" value={form.name} required placeholder="e.g. Electronics" onChange={(e) => handleNameChange(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Slug *</label>
                    <input className="input-field" type="text" value={form.slug} required placeholder="e.g. electronics" onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Parent Category</label>
                    <select className="input-field" value={form.parentId} onChange={(e) => setForm(f => ({ ...f, parentId: e.target.value }))}>
                      <option value="">— Top Level —</option>
                      {flat.filter(c => !editingCategory || c.id !== editingCategory.id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sort Order</label>
                    <input className="input-field" type="number" value={form.sortOrder} onChange={(e) => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input className="input-field" type="text" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingCategory ? 'Update Category' : 'Create Category'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
