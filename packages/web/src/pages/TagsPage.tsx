import { useEffect, useState } from 'react';
import { tagsApi } from '../api/client';
import PaginatedDataTable from '../components/PaginatedDataTable';

const defaultTagForm = { name: '', color: '' };

export default function TagsPage() {
  const [tags, setTags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState<any>(null);
  const [tagForm, setTagForm] = useState(defaultTagForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [usageFilter, setUsageFilter] = useState('');

  const loadTags = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      if (colorFilter) params.hasColor = colorFilter;
      const res = await tagsApi.list(Object.keys(params).length > 0 ? params : undefined);
      const data = res.data?.data ?? res.data ?? [];
      setTags(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, [searchTerm, colorFilter]);

  const filteredTags = tags.filter((tag) => {
    if (usageFilter === 'used' && !(tag.skuCount > 0)) return false;
    if (usageFilter === 'unused' && (tag.skuCount > 0)) return false;
    return true;
  });

  const openCreateModal = () => {
    setEditingTag(null);
    setTagForm(defaultTagForm);
    setShowModal(true);
  };

  const openEditModal = (tag: any) => {
    setEditingTag(tag);
    setTagForm({
      name: tag.name || '',
      color: tag.color || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTag(null);
    setTagForm(defaultTagForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTag) {
        await tagsApi.update(editingTag.id, tagForm);
      } else {
        await tagsApi.create(tagForm);
      }
      await loadTags();
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save tag');
    }
  };

  const handleDelete = async (tag: any) => {
    if (!confirm(`Delete tag "${tag.name}"? This will remove it from all products.`)) return;
    try {
      await tagsApi.delete(tag.id);
      await loadTags();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete tag');
    }
  };

  const tagColumns = [
    { header: 'Name', key: 'name', sortable: true },
    {
      header: 'Color',
      key: 'color',
      render: (row: any) =>
        row.color ? (
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded border"
              style={{ backgroundColor: row.color }}
            ></div>
            <span className="text-sm text-gray-600">{row.color}</span>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      header: 'SKU Count',
      key: 'skuCount',
      render: (row: any) => (
        <span className="text-sm text-gray-700">{row.skuCount || 0}</span>
      ),
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      header: 'Actions',
      key: 'id',
      render: (row: any) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openEditModal(row)}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row)}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="text-2xl font-bold text-gray-900">🏷️ Tags</h2>
        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          + Create Tag
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          value={colorFilter}
          onChange={(e) => setColorFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Colors</option>
          <option value="true">Has Color</option>
          <option value="false">No Color</option>
        </select>
        <select
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Usage</option>
          <option value="used">Used on Products</option>
          <option value="unused">Unused</option>
        </select>
        {(searchTerm || colorFilter || usageFilter) && (
          <button type="button" className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setColorFilter(''); setUsageFilter(''); }}>
            ✕ Clear filters
          </button>
        )}
      </div>

      <div className="content-section">
        {isLoading ? (
          <p className="text-center text-gray-600">Loading...</p>
        ) : (
          <PaginatedDataTable columns={tagColumns} data={filteredTags} />
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-panel-md modal-panel-padded">
            <h3 className="text-lg font-semibold mb-4">
              {editingTag ? 'Edit Tag' : 'Create Tag'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={tagForm.name}
                  onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color (hex code)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagForm.color}
                    onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })}
                    placeholder="#3B82F6"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    type="color"
                    value={tagForm.color || '#3B82F6'}
                    onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })}
                    className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {editingTag ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
