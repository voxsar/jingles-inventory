import { useEffect, useState } from 'react';
import { settingsApi } from '../api/client';

const UNIT_TYPES = ['Weight', 'Volume', 'Length', 'Count', 'Area', 'Other'];

const ENTITY_TYPES = [
  { key: 'inventory', label: 'Inventory States', icon: '📦', description: 'States for inventory records' },
  { key: 'grn', label: 'GRN Statuses', icon: '📋', description: 'Statuses for Goods Received Notes' },
  { key: 'product', label: 'Product Statuses', icon: '🎵', description: 'Statuses for products/SKUs' },
  { key: 'location', label: 'Location Statuses', icon: '📍', description: 'Statuses for warehouse locations' },
  { key: 'branch', label: 'Branch Statuses', icon: '🏪', description: 'Statuses for branches' },
  { key: 'supplier', label: 'Supplier Statuses', icon: '🏭', description: 'Statuses for suppliers/vendors' },
  { key: 'stock_transfer', label: 'Transfer Statuses', icon: '🔄', description: 'Statuses for stock transfers' },
];

const defaultUnitForm = { name: '', abbreviation: '', type: 'Count', baseUnit: '', conversionFactor: '' };
const defaultStatusForm = { entityType: 'inventory', value: '', label: '', color: '#6366f1', sortOrder: '0', isDefault: false };

type Section = 'home' | 'units' | 'statuses';

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('home');
  const [statusEntityType, setStatusEntityType] = useState<string>('inventory');

  // Units state
  const [units, setUnits] = useState<any[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [unitForm, setUnitForm] = useState(defaultUnitForm);

  // Statuses state
  const [statuses, setStatuses] = useState<any[]>([]);
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [editingStatus, setEditingStatus] = useState<any>(null);
  const [statusForm, setStatusForm] = useState(defaultStatusForm);

  // ── Units ─────────────────────────────────────────────────

  const loadUnits = async () => {
    setUnitsLoading(true);
    try {
      const res = await settingsApi.listUnits();
      setUnits(res.data.data ?? []);
    } catch (err) {
      console.error('Failed to load units', err);
    } finally {
      setUnitsLoading(false);
    }
  };

  const openCreateUnit = () => {
    setEditingUnit(null);
    setUnitForm(defaultUnitForm);
    setShowUnitForm(true);
  };

  const openEditUnit = (unit: any) => {
    setEditingUnit(unit);
    setUnitForm({
      name: unit.name,
      abbreviation: unit.abbreviation,
      type: unit.type,
      baseUnit: unit.baseUnit ?? '',
      conversionFactor: unit.conversionFactor != null ? String(unit.conversionFactor) : '',
    });
    setShowUnitForm(true);
  };

  const handleUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...unitForm,
      conversionFactor: unitForm.conversionFactor ? parseFloat(unitForm.conversionFactor) : null,
      baseUnit: unitForm.baseUnit || null,
    };
    try {
      if (editingUnit) {
        await settingsApi.updateUnit(editingUnit.id, payload);
      } else {
        await settingsApi.createUnit(payload);
      }
      setShowUnitForm(false);
      setEditingUnit(null);
      setUnitForm(defaultUnitForm);
      await loadUnits();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save unit');
    }
  };

  const handleDeleteUnit = async (unit: any) => {
    if (!confirm(`Delete unit "${unit.name}"?`)) return;
    try {
      await settingsApi.deleteUnit(unit.id);
      await loadUnits();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete unit');
    }
  };

  const groupedUnits = UNIT_TYPES.reduce<Record<string, any[]>>((acc, t) => {
    acc[t] = units.filter(u => u.type === t);
    return acc;
  }, {});

  // ── Statuses ──────────────────────────────────────────────

  const loadStatuses = async (entityType: string) => {
    setStatusesLoading(true);
    try {
      const res = await settingsApi.listStatuses(entityType);
      setStatuses(res.data.data ?? []);
    } catch (err) {
      console.error('Failed to load statuses', err);
    } finally {
      setStatusesLoading(false);
    }
  };

  const openCreateStatus = () => {
    setEditingStatus(null);
    setStatusForm({ ...defaultStatusForm, entityType: statusEntityType });
    setShowStatusForm(true);
  };

  const openEditStatus = (status: any) => {
    setEditingStatus(status);
    setStatusForm({
      entityType: status.entityType,
      value: status.value,
      label: status.label,
      color: status.color ?? '#6366f1',
      sortOrder: String(status.sortOrder),
      isDefault: status.isDefault,
    });
    setShowStatusForm(true);
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...statusForm,
      sortOrder: parseInt(statusForm.sortOrder) || 0,
    };
    try {
      if (editingStatus) {
        await settingsApi.updateStatus(editingStatus.id, payload);
      } else {
        await settingsApi.createStatus(payload);
      }
      setShowStatusForm(false);
      setEditingStatus(null);
      setStatusForm({ ...defaultStatusForm, entityType: statusEntityType });
      await loadStatuses(statusEntityType);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save status');
    }
  };

  const handleDeleteStatus = async (status: any) => {
    if (!confirm(`Delete status "${status.label}"?`)) return;
    try {
      await settingsApi.deleteStatus(status.id);
      await loadStatuses(statusEntityType);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete status');
    }
  };

  // ── Effects ───────────────────────────────────────────────

  useEffect(() => {
    if (section === 'units') loadUnits();
    if (section === 'statuses') loadStatuses(statusEntityType);
  }, [section]);

  useEffect(() => {
    if (section === 'statuses') loadStatuses(statusEntityType);
  }, [statusEntityType]);

  // ── Render ────────────────────────────────────────────────

  if (section === 'units') {
    return (
      <div className="flex flex-col gap-4">
        <div className="page-header">
          <div className="page-header-left">
            <h1 className="page-title">📏 Units of Measure</h1>
            <p className="page-subtitle">Define custom units. System units cannot be modified.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setSection('home')}>← Settings</button>
            <button className="btn-primary" onClick={openCreateUnit}>+ Add Unit</button>
          </div>
        </div>

        {showUnitForm && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowUnitForm(false)}>
            <div className="modal-panel-md">
              <div className="modal-header">
                <h2 className="modal-title">{editingUnit ? '✏️ Edit Unit' : '➕ New Unit of Measure'}</h2>
                <button className="modal-close" onClick={() => setShowUnitForm(false)}>✕</button>
              </div>
              <form onSubmit={handleUnitSubmit}>
                <div className="modal-body form-stack">
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Name *</label>
                      <input className="input-field" type="text" required placeholder="e.g. Kilogram" value={unitForm.name} onChange={(e) => setUnitForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Abbreviation *</label>
                      <input className="input-field" type="text" required placeholder="e.g. kg" value={unitForm.abbreviation} onChange={(e) => setUnitForm(f => ({ ...f, abbreviation: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label className="form-label">Type *</label>
                      <select className="input-field" value={unitForm.type} onChange={(e) => setUnitForm(f => ({ ...f, type: e.target.value }))}>
                        {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Base Unit</label>
                      <input className="input-field" type="text" placeholder="e.g. gram" value={unitForm.baseUnit} onChange={(e) => setUnitForm(f => ({ ...f, baseUnit: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Conversion Factor</label>
                      <input className="input-field" type="number" placeholder="e.g. 1000" value={unitForm.conversionFactor} onChange={(e) => setUnitForm(f => ({ ...f, conversionFactor: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowUnitForm(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">{editingUnit ? '💾 Update Unit' : '➕ Create Unit'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="content-section">
          {unitsLoading ? (
            <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
          ) : (
            <div className="flex flex-col gap-4 p-4">
              {UNIT_TYPES.map(type => {
                const items = groupedUnits[type];
                if (!items || items.length === 0) return null;
                return (
                  <div key={type}>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-2">{type}</h3>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          {['Name', 'Abbreviation', 'Base Unit', 'Conversion Factor', 'Status', ''].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((unit: any) => (
                          <tr key={unit.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{unit.name}</td>
                            <td className="px-4 py-2 text-gray-500">{unit.abbreviation}</td>
                            <td className="px-4 py-2 text-gray-500">{unit.baseUnit ?? '—'}</td>
                            <td className="px-4 py-2 text-gray-500">{unit.conversionFactor ?? '—'}</td>
                            <td className="px-4 py-2">
                              {unit.isSystem
                                ? <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">System</span>
                                : unit.isActive
                                  ? <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
                                  : <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Inactive</span>}
                            </td>
                            <td className="px-4 py-2">
                              {!unit.isSystem && (
                                <div className="flex gap-2">
                                  <button className="btn-sm" onClick={() => openEditUnit(unit)}>Edit</button>
                                  <button className="btn-sm text-red-600" onClick={() => handleDeleteUnit(unit)}>Delete</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {units.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-400">No units configured. Click "+ Add Unit" to get started.</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section === 'statuses') {
    const entityInfo = ENTITY_TYPES.find(e => e.key === statusEntityType);
    return (
      <div className="flex flex-col gap-4">
        <div className="page-header">
          <div className="page-header-left">
            <h1 className="page-title">🏷️ Status Management</h1>
            <p className="page-subtitle">Manage status options for each data type</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setSection('home')}>← Settings</button>
            <button className="btn-primary" onClick={openCreateStatus}>+ Add Status</button>
          </div>
        </div>

        {/* Entity Type Tabs */}
        <div className="content-section px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {ENTITY_TYPES.map(et => (
              <button
                key={et.key}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusEntityType === et.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                onClick={() => setStatusEntityType(et.key)}
              >
                {et.icon} {et.label}
              </button>
            ))}
          </div>
        </div>

        {showStatusForm && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowStatusForm(false)}>
            <div className="modal-panel-md">
              <div className="modal-header">
                <h2 className="modal-title">{editingStatus ? '✏️ Edit Status' : '➕ New Status Option'}</h2>
                <button className="modal-close" onClick={() => setShowStatusForm(false)}>✕</button>
              </div>
              <form onSubmit={handleStatusSubmit}>
                <div className="modal-body form-stack">
                  <div className="form-group">
                    <label className="form-label">Entity Type *</label>
                    <select className="input-field" value={statusForm.entityType} disabled={!!editingStatus} onChange={(e) => setStatusForm(f => ({ ...f, entityType: e.target.value }))}>
                      {ENTITY_TYPES.map(et => <option key={et.key} value={et.key}>{et.icon} {et.label}</option>)}
                    </select>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Value (code) *</label>
                      <input className="input-field font-mono" type="text" required placeholder="e.g. InStock" value={statusForm.value} disabled={!!editingStatus} onChange={(e) => setStatusForm(f => ({ ...f, value: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Label (display) *</label>
                      <input className="input-field" type="text" required placeholder="e.g. In Stock" value={statusForm.label} onChange={(e) => setStatusForm(f => ({ ...f, label: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Color</label>
                      <div className="flex gap-2 items-center">
                        <input type="color" className="h-9 w-16 rounded border border-gray-300 cursor-pointer" value={statusForm.color} onChange={(e) => setStatusForm(f => ({ ...f, color: e.target.value }))} />
                        <input className="input-field flex-1" type="text" placeholder="#6366f1" value={statusForm.color} onChange={(e) => setStatusForm(f => ({ ...f, color: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sort Order</label>
                      <input className="input-field" type="number" min="0" value={statusForm.sortOrder} onChange={(e) => setStatusForm(f => ({ ...f, sortOrder: e.target.value }))} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" checked={statusForm.isDefault} onChange={(e) => setStatusForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                    Set as default status for this type
                  </label>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowStatusForm(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">{editingStatus ? '💾 Update Status' : '➕ Create Status'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="content-section">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{entityInfo?.icon}</span>
              <div>
                <h2 className="font-semibold text-gray-800">{entityInfo?.label}</h2>
                <p className="text-sm text-gray-500">{entityInfo?.description}</p>
              </div>
            </div>
          </div>
          {statusesLoading ? (
            <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  {['Color', 'Value', 'Label', 'Order', 'Default', 'System', ''].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statuses.map((status: any) => (
                  <tr key={status.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="inline-block w-5 h-5 rounded-full border border-gray-200" style={{ background: status.color ?? '#6366f1' }} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{status.value}</td>
                    <td className="px-4 py-2 font-medium">{status.label}</td>
                    <td className="px-4 py-2 text-gray-500">{status.sortOrder}</td>
                    <td className="px-4 py-2">{status.isDefault && <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Default</span>}</td>
                    <td className="px-4 py-2">{status.isSystem && <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">System</span>}</td>
                    <td className="px-4 py-2">
                      {!status.isSystem && (
                        <div className="flex gap-2">
                          <button className="btn-sm" onClick={() => openEditStatus(status)}>Edit</button>
                          <button className="btn-sm text-red-600" onClick={() => handleDeleteStatus(status)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {statuses.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No status options configured for this type. Click "+ Add Status" to add one.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // Home – card grid
  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">⚙️ Settings</h1>
          <p className="page-subtitle">System configuration</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Units of Measure card */}
        <button
          className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => setSection('units')}
        >
          <div className="flex items-start gap-4">
            <div className="text-4xl">📏</div>
            <div>
              <h2 className="font-semibold text-gray-800 text-lg">Units of Measure</h2>
              <p className="text-sm text-gray-500 mt-1">Define and manage custom measurement units for products (weight, volume, length, etc.)</p>
              <span className="inline-block mt-3 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Manage →</span>
            </div>
          </div>
        </button>

        {/* Statuses card */}
        <button
          className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => setSection('statuses')}
        >
          <div className="flex items-start gap-4">
            <div className="text-4xl">🏷️</div>
            <div>
              <h2 className="font-semibold text-gray-800 text-lg">Status Management</h2>
              <p className="text-sm text-gray-500 mt-1">Configure status options for inventory, products, GRNs, branches, suppliers, and transfers</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {ENTITY_TYPES.slice(0, 4).map(et => (
                  <span key={et.key} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{et.icon} {et.label.replace(' Statuses', '').replace(' States', '')}</span>
                ))}
                <span className="text-xs text-gray-400">+{ENTITY_TYPES.length - 4} more</span>
              </div>
              <span className="inline-block mt-3 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Manage →</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
