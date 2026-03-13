import { useEffect, useState } from 'react';
import { categoriesApi } from '../api/client';
import clsx from 'clsx';

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
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-2 text-sm">
          <div style={{ paddingLeft: `${depth * 20}px` }} className="flex items-center gap-2">
            {depth > 0 && <span className="text-gray-300">└</span>}
            <span className="font-medium text-gray-900">{category.name}</span>
          </div>
        </td>
        <td className="px-4 py-2 text-sm text-gray-500 font-mono">{category.slug}</td>
        <td className="px-4 py-2 text-sm text-gray-500">{category.description ?? '—'}</td>
        <td className="px-4 py-2 text-sm text-center">{category.sortOrder}</td>
        <td className="px-4 py-2 text-sm">
          {category.isActive ? (
            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Active</span>
          ) : (
            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Inactive</span>
          )}
        </td>
        <td className="px-4 py-2 text-sm">
          <div className="flex gap-2">
            <button onClick={() => onEdit(category)} className="text-primary-600 hover:underline text-xs">Edit</button>
            <button onClick={() => onDelete(category)} className="text-red-600 hover:underline text-xs">Delete</button>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📂 Categories</h1>
          <p className="text-sm text-gray-500 mt-1">Manage nested product categories and sub-categories</p>
        </div>
        <button onClick={() => openCreate()} className="btn-primary">+ New Category</button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">
            {editingCategory ? 'Edit Category' : 'New Category'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                required
                className="input-field"
                placeholder="e.g. Electronics"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                required
                className="input-field"
                placeholder="e.g. electronics"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
              <select
                value={form.parentId}
                onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
                className="input-field"
              >
                <option value="">— Top Level —</option>
                {flat
                  .filter(c => !editingCategory || c.id !== editingCategory.id)
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="input-field"
                rows={2}
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">
                {editingCategory ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Slug</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
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
    </div>
  );
}
