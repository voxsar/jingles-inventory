import { useEffect, useState } from 'react';
import { settingsApi } from '../api/client';

const UNIT_TYPES = ['Weight', 'Volume', 'Length', 'Count', 'Area', 'Other'];

const defaultForm = {
  name: '',
  abbreviation: '',
  type: 'Count',
  baseUnit: '',
  conversionFactor: '',
};

export default function SettingsPage() {
  const [units, setUnits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [activeTab, setActiveTab] = useState<'units'>('units');

  const loadUnits = async () => {
    try {
      const res = await settingsApi.listUnits();
      setUnits(res.data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadUnits(); }, []);

  const openCreate = () => {
    setEditingUnit(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const openEdit = (unit: any) => {
    setEditingUnit(unit);
    setForm({
      name: unit.name,
      abbreviation: unit.abbreviation,
      type: unit.type,
      baseUnit: unit.baseUnit ?? '',
      conversionFactor: unit.conversionFactor != null ? String(unit.conversionFactor) : '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      conversionFactor: form.conversionFactor ? parseFloat(form.conversionFactor) : null,
      baseUnit: form.baseUnit || null,
    };
    try {
      if (editingUnit) {
        await settingsApi.updateUnit(editingUnit.id, payload);
      } else {
        await settingsApi.createUnit(payload);
      }
      setShowForm(false);
      setEditingUnit(null);
      setForm(defaultForm);
      await loadUnits();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to save unit');
    }
  };

  const handleDelete = async (unit: any) => {
    if (!confirm(`Delete unit "${unit.name}"?`)) return;
    try {
      await settingsApi.deleteUnit(unit.id);
      await loadUnits();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete unit');
    }
  };

  const grouped = UNIT_TYPES.reduce<Record<string, any[]>>((acc, t) => {
    acc[t] = units.filter(u => u.type === t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">⚙️ Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('units')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'units'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Units of Measure
          </button>
        </nav>
      </div>

      {activeTab === 'units' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Define custom units of measure. System units cannot be modified.
            </p>
            <button onClick={openCreate} className="btn-primary">+ Add Unit</button>
          </div>

          {showForm && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">
                {editingUnit ? 'Edit Unit' : 'New Unit of Measure'}
              </h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="input-field"
                    placeholder="e.g. Kilogram"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Abbreviation *</label>
                  <input
                    type="text"
                    value={form.abbreviation}
                    onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))}
                    required
                    className="input-field"
                    placeholder="e.g. kg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="input-field"
                  >
                    {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Unit</label>
                  <input
                    type="text"
                    value={form.baseUnit}
                    onChange={e => setForm(f => ({ ...f, baseUnit: e.target.value }))}
                    className="input-field"
                    placeholder="e.g. gram"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Conversion Factor</label>
                  <input
                    type="number"
                    step="any"
                    value={form.conversionFactor}
                    onChange={e => setForm(f => ({ ...f, conversionFactor: e.target.value }))}
                    className="input-field"
                    placeholder="e.g. 1000 (1 kg = 1000 g)"
                  />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button type="submit" className="btn-primary">
                    {editingUnit ? 'Update Unit' : 'Create Unit'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : (
            <div className="grid gap-4">
              {UNIT_TYPES.map(type => {
                const items = grouped[type];
                if (!items || items.length === 0) return null;
                return (
                  <div key={type} className="card">
                    <h3 className="font-semibold text-gray-700 mb-3">{type}</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Abbreviation</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Base Unit</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Conversion Factor</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {items.map((unit: any) => (
                            <tr key={unit.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm font-medium text-gray-900">{unit.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{unit.abbreviation}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{unit.baseUnit ?? '—'}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{unit.conversionFactor ?? '—'}</td>
                              <td className="px-4 py-2 text-sm">
                                {unit.isSystem ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">System</span>
                                ) : unit.isActive ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Active</span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Inactive</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {!unit.isSystem && (
                                  <div className="flex gap-2">
                                    <button onClick={() => openEdit(unit)} className="text-primary-600 hover:underline text-xs">Edit</button>
                                    <button onClick={() => handleDelete(unit)} className="text-red-600 hover:underline text-xs">Delete</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {units.length === 0 && (
                <div className="card text-center py-8 text-gray-500">
                  No units configured. Click "+ Add Unit" to get started.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
