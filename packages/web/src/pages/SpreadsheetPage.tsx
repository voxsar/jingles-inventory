import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';

interface EntityType {
  id: string;
  name: string;
  icon: string;
  description: string;
  path: string;
  category: 'inventory' | 'warehouse' | 'purchasing' | 'settings';
}

const entityTypes: EntityType[] = [
  // Inventory Category
  { id: 'skus', name: 'Products (SKUs)', icon: '🎵', description: 'Manage product catalog with variants, barcodes, and pricing', path: '/spreadsheet/skus', category: 'inventory' },
  { id: 'inventory', name: 'Inventory Records', icon: '📦', description: 'Track inventory quantities, states, and locations', path: '/spreadsheet/inventory', category: 'inventory' },
  { id: 'batches', name: 'Batches', icon: '🏷️', description: 'Manage batch pricing and expiry dates', path: '/spreadsheet/batches', category: 'inventory' },
  { id: 'categories', name: 'Categories', icon: '🗂️', description: 'Product categories and hierarchies', path: '/spreadsheet/categories', category: 'inventory' },
  { id: 'tags', name: 'Tags', icon: '🏷️', description: 'Product tags and labels', path: '/spreadsheet/tags', category: 'inventory' },

  // Warehouse Category
  { id: 'branches', name: 'Branches', icon: '🏢', description: 'Warehouse branches and locations', path: '/spreadsheet/branches', category: 'warehouse' },
  { id: 'floors', name: 'Floors', icon: '🏗️', description: 'Warehouse floors with dimensions', path: '/spreadsheet/floors', category: 'warehouse' },
  { id: 'racks', name: 'Racks', icon: '📐', description: 'Storage racks with 3D positioning', path: '/spreadsheet/racks', category: 'warehouse' },
  { id: 'shelves', name: 'Shelves', icon: '📚', description: 'Storage shelves with capacity info', path: '/spreadsheet/shelves', category: 'warehouse' },
  { id: 'boxes', name: 'Storage Boxes', icon: '📦', description: 'Individual storage boxes and containers', path: '/spreadsheet/boxes', category: 'warehouse' },

  // Purchasing Category
  { id: 'grns', name: 'GRNs', icon: '📋', description: 'Goods Receipt Notes and receiving', path: '/spreadsheet/grns', category: 'purchasing' },
  { id: 'vendors', name: 'Vendors/Suppliers', icon: '🤝', description: 'Vendor and supplier information', path: '/spreadsheet/vendors', category: 'purchasing' },
  { id: 'stock-transfers', name: 'Stock Transfers', icon: '🔄', description: 'Inter-location stock movements', path: '/spreadsheet/stock-transfers', category: 'purchasing' },

  // Settings Category
  { id: 'users', name: 'Users', icon: '👥', description: 'User accounts and access control', path: '/spreadsheet/users', category: 'settings' },
  { id: 'units', name: 'Units of Measure', icon: '📏', description: 'Measurement units and conversions', path: '/spreadsheet/units', category: 'settings' },
  { id: 'attributes', name: 'Attributes', icon: '🔖', description: 'Product attributes and variant options', path: '/spreadsheet/attributes', category: 'settings' },
];

const categories = [
  { id: 'inventory', name: 'Inventory', icon: '📦' },
  { id: 'warehouse', name: 'Warehouse', icon: '🏢' },
  { id: 'purchasing', name: 'Purchasing', icon: '🛒' },
  { id: 'settings', name: 'Settings', icon: '⚙️' },
];

export default function SpreadsheetPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const filteredEntities = entityTypes.filter(entity => {
    const matchesSearch = entity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entity.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || entity.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedEntities = categories.map(category => ({
    ...category,
    entities: filteredEntities.filter(e => e.category === category.id),
  })).filter(g => g.entities.length > 0);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="page-header-left">
          <h1 className="page-title">📊 Spreadsheet Interface</h1>
          <p className="page-subtitle">Access and edit all data types with inline editing and dropdown search</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Search entity types..."
          className="filter-input-wide"
          style={{ flex: '1 1 300px', minWidth: '200px' }}
        />
        <SearchableSelect
          options={[{ value: '', label: 'All Categories' }, ...categories.map((cat) => ({ value: cat.id, label: `${cat.icon} ${cat.name}` }))]}
          value={selectedCategory}
          onChange={setSelectedCategory}
          className="min-w-[180px]"
          isClearable={false}
        />
        {(searchTerm || selectedCategory) && (
          <button
            onClick={() => { setSearchTerm(''); setSelectedCategory(''); }}
            className="btn-secondary"
            style={{ padding: '8px 16px' }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Entity Type Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {filteredEntities.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            padding: '64px 24px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            background: 'var(--bg-2)',
            borderRadius: '8px',
            border: '1px solid var(--line)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔍</div>
            <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>No entities found</div>
            <div style={{ fontSize: '14px' }}>Try adjusting your search or filter criteria</div>
          </div>
        ) : (
          filteredEntities.map(entity => (
            <div
              key={entity.id}
              onClick={() => navigate(entity.path)}
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.1)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '2rem', lineHeight: 1 }}>{entity.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)', marginBottom: '4px' }}>
                    {entity.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {categories.find(c => c.id === entity.category)?.name}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ink-3)', lineHeight: '1.5', margin: 0 }}>
                {entity.description}
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                <span style={{
                  fontSize: '12px',
                  color: '#6366f1',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Open Spreadsheet →
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Category-grouped View */}
      {!searchTerm && !selectedCategory && (
        <div style={{ marginTop: '48px' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--ink-3)',
            marginBottom: '16px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Or Browse by Category
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {groupedEntities.map(group => (
              <div key={group.id}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '20px' }}>{group.icon}</span>
                  {group.name}
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 400,
                    color: 'var(--ink-3)',
                    marginLeft: '8px'
                  }}>
                    ({group.entities.length})
                  </span>
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {group.entities.map(entity => (
                    <button
                      key={entity.id}
                      onClick={() => navigate(entity.path)}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--bg-2)',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: 'var(--ink)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#6366f1';
                        e.currentTarget.style.background = 'rgba(var(--accent-glow), 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--line)';
                        e.currentTarget.style.background = 'var(--bg-2)';
                      }}
                    >
                      <span>{entity.icon}</span>
                      <span>{entity.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
