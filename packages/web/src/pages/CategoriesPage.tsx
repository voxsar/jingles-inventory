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
          <div style={{ display: 'flex', gap: '8px' }}>
            <s-button  onClick={() => onEdit(category)}>Edit</s-button>
            <s-button  onClick={() => onDelete(category)}>Delete</s-button>
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
    <s-page>
      <s-stack direction="inline" gap="base">
        <div>
          <s-heading>📂 Categories</s-heading>
          <s-text>Manage nested product categories and sub-categories</s-text>
        </div>
        <s-button variant="primary" onClick={() => openCreate()}>+ New Category</s-button>
      </s-stack>

      {showForm && (
        <s-section heading={editingCategory ? 'Edit Category' : 'New Category'}>
          <form onSubmit={handleSubmit}>
            <s-stack gap="base">
              <s-stack direction="inline" gap="base">
                <s-text-field label="Name *" value={form.name} required placeholder="e.g. Electronics" onChange={(e: any) => handleNameChange(e.currentTarget.value)} />
                <s-text-field label="Slug *" value={form.slug} required placeholder="e.g. electronics" onChange={(e: any) => setForm(f => ({ ...f, slug: e.currentTarget.value }))} />
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-select label="Parent Category" value={form.parentId} onChange={(e: any) => setForm(f => ({ ...f, parentId: e.currentTarget.value }))}>
                  <s-option value="">— Top Level —</s-option>
                  {flat.filter(c => !editingCategory || c.id !== editingCategory.id).map(c => (
                    <s-option key={c.id} value={c.id}>{c.name}</s-option>
                  ))}
                </s-select>
                <s-text-field label="Sort Order" type="number" value={form.sortOrder} onChange={(e: any) => setForm(f => ({ ...f, sortOrder: e.currentTarget.value }))} />
              </s-stack>
              <s-text-field label="Description" value={form.description} onChange={(e: any) => setForm(f => ({ ...f, description: e.currentTarget.value }))} />
              <s-stack direction="inline" gap="base">
                <s-button variant="primary" type="submit">{editingCategory ? 'Update' : 'Create'}</s-button>
                <s-button type="button" onClick={() => setShowForm(false)}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      )}

      <s-section>
        {isLoading ? (
          <s-text>Loading...</s-text>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f6f6f7' }}>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase' }}>Slug</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase' }}>Description</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase' }}>Order</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#6d7175' }}>
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
      </s-section>
    </s-page>
  );
}
