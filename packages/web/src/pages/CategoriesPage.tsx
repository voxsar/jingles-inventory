import { useEffect, useState } from 'react';
import { categoriesApi } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import { UiBadge } from '../components/UiPrimitives';
import { buildHierarchicalCategoryOptions } from '../utils/categoryHelpers';

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

const PAGE_SIZE = 20;
const categoryStickyActionCellStyle = {
  padding: '8px 16px',
  fontSize: '14px',
  background: 'var(--bg-2)',
  ['--sticky-bg' as '--sticky-bg']: 'var(--bg-2)',
} as React.CSSProperties;
const categoryStickyActionHeaderStyle = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--line)',
  background: 'var(--glass-pop)',
  ['--sticky-bg' as '--sticky-bg']: 'var(--glass-pop)',
} as React.CSSProperties;

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
      <tr style={{ borderBottom: '1px solid var(--line)' }}>
        <td className="table-sticky-cell" style={categoryStickyActionCellStyle}>
          <div className="flex gap-2">
            <button className="btn-sm" onClick={() => onEdit(category)}>Edit</button>
            <button className="btn-sm text-red-600" onClick={() => onDelete(category)}>Delete</button>
          </div>
        </td>
        <td style={{ padding: '8px 16px', fontSize: '14px' }}>
          <div style={{ paddingLeft: `${depth * 20}px`, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {depth > 0 && <span style={{ color: 'var(--ink-4)' }}>└</span>}
            <span style={{ fontWeight: 500 }}>{category.name}</span>
          </div>
        </td>
        <td style={{ padding: '8px 16px', fontSize: '14px', fontFamily: 'monospace', color: 'var(--ink-3)' }}>{category.slug}</td>
        <td style={{ padding: '8px 16px', fontSize: '14px', color: 'var(--ink-3)' }}>{category.description ?? '—'}</td>
        <td style={{ padding: '8px 16px', fontSize: '14px', textAlign: 'center' }}>{category.sortOrder}</td>
        <td style={{ padding: '8px 16px', fontSize: '14px' }}>
          {category.isActive
            ? <UiBadge tone="success">Active</UiBadge>
            : <UiBadge tone="critical">Inactive</UiBadge>}
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

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

  const matchesCategory = (category: Category, depth: number) => {
    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      const haystacks = [category.name, category.slug, category.description ?? ''];
      if (!haystacks.some((value) => value.toLowerCase().includes(needle))) {
        return false;
      }
    }
    if (statusFilter === 'true' && !category.isActive) return false;
    if (statusFilter === 'false' && category.isActive) return false;
    if (levelFilter === 'root' && depth !== 0) return false;
    if (levelFilter === 'child' && depth === 0) return false;
    return true;
  };

  const filterTree = (items: Category[], depth = 0): Category[] =>
    items.reduce<Category[]>((acc, category) => {
      const filteredChildren = filterTree(category.children ?? [], depth + 1);
      if (matchesCategory(category, depth) || filteredChildren.length > 0) {
        acc.push({ ...category, children: filteredChildren });
      }
      return acc;
    }, []);

  const filteredCategories = filterTree(categories);
  const total = filteredCategories.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedCategories = filteredCategories.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, levelFilter]);

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

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
        <div className="filter-bar">
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search categories by name, slug, or description…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
                { value: '', label: 'All Levels' },
                { value: 'root', label: 'Top Level' },
                { value: 'child', label: 'Sub-category' },
              ]}
              value={levelFilter}
              onChange={(value) => setLevelFilter(value)}
              placeholder="All Levels"
              isClearable={false}
            />
          </div>
          {(searchTerm || statusFilter || levelFilter) && (
            <button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setStatusFilter(''); setLevelFilter(''); }}>
              ✕ Clear filters
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="px-6 py-8 text-gray-500 text-sm">Loading…</div>
        ) : (
          <div className="table-scroll-region overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', color: 'var(--ink)' }}>
              <thead>
                <tr style={{ background: 'var(--glass-pop)' }}>
                  <th className="table-sticky-cell table-sticky-cell--header" style={categoryStickyActionHeaderStyle}>Actions</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>Slug</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>Description</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>Order</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--ink-3)' }}>
                      No categories match the current filters.
                    </td>
                  </tr>
                ) : (
                  pagedCategories.map(cat => (
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
            {!isLoading && total > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            )}
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
                    <SearchableSelect
                      options={[
                        { value: '', label: '— Top Level —' },
                        ...buildHierarchicalCategoryOptions(
                          categories.filter(c => !editingCategory || c.id !== editingCategory.id)
                        )
                      ]}
                      value={form.parentId}
                      onChange={(value) => setForm(f => ({ ...f, parentId: value }))}
                      placeholder="Top Level"
                      isClearable={false}
                    />
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
