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
    } catch (err) {
      console.error('Failed to load units', err);
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
    <>
      <s-heading>⚙️ Settings</s-heading>

      <s-stack direction="inline" gap="base">
        <s-button variant={activeTab === 'units' ? 'primary' : 'plain'} onClick={() => setActiveTab('units')}>
          Units of Measure
        </s-button>
      </s-stack>

      {activeTab === 'units' && (
        <s-stack gap="base">
          <s-stack direction="inline" gap="base">
            <s-text>Define custom units of measure. System units cannot be modified.</s-text>
            <s-button variant="primary" onClick={openCreate}>+ Add Unit</s-button>
          </s-stack>

          {showForm && (
            <s-section heading={editingUnit ? 'Edit Unit' : 'New Unit of Measure'}>
              <form onSubmit={handleSubmit}>
                <s-stack gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-text-field label="Name *" value={form.name} required placeholder="e.g. Kilogram" onChange={(e: any) => setForm(f => ({ ...f, name: e.currentTarget.value }))} />
                    <s-text-field label="Abbreviation *" value={form.abbreviation} required placeholder="e.g. kg" onChange={(e: any) => setForm(f => ({ ...f, abbreviation: e.currentTarget.value }))} />
                  </s-stack>
                  <s-stack direction="inline" gap="base">
                    <s-select label="Type *" value={form.type} onChange={(e: any) => setForm(f => ({ ...f, type: e.currentTarget.value }))}>
                      {UNIT_TYPES.map(t => <s-option key={t} value={t}>{t}</s-option>)}
                    </s-select>
                    <s-text-field label="Base Unit" value={form.baseUnit} placeholder="e.g. gram" onChange={(e: any) => setForm(f => ({ ...f, baseUnit: e.currentTarget.value }))} />
                    <s-text-field label="Conversion Factor" type="number" value={form.conversionFactor} placeholder="e.g. 1000" onChange={(e: any) => setForm(f => ({ ...f, conversionFactor: e.currentTarget.value }))} />
                  </s-stack>
                  <s-stack direction="inline" gap="base">
                    <s-button variant="primary" type="submit">{editingUnit ? 'Update Unit' : 'Create Unit'}</s-button>
                    <s-button type="button" onClick={() => setShowForm(false)}>Cancel</s-button>
                  </s-stack>
                </s-stack>
              </form>
            </s-section>
          )}

          {isLoading ? (
            <s-section><s-text>Loading...</s-text></s-section>
          ) : (
            <s-stack gap="base">
              {UNIT_TYPES.map(type => {
                const items = grouped[type];
                if (!items || items.length === 0) return null;
                return (
                  <s-section key={type} heading={type}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f6f6f7' }}>
                          <tr>
                            {['Name', 'Abbreviation', 'Base Unit', 'Conversion Factor', 'Status', 'Actions'].map(h => (
                              <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6d7175', textTransform: 'uppercase', borderBottom: '1px solid #e1e3e5' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((unit: any) => (
                            <tr key={unit.id} style={{ borderBottom: '1px solid #e1e3e5' }}>
                              <td style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 500 }}>{unit.name}</td>
                              <td style={{ padding: '8px 16px', fontSize: '14px', color: '#6d7175' }}>{unit.abbreviation}</td>
                              <td style={{ padding: '8px 16px', fontSize: '14px', color: '#6d7175' }}>{unit.baseUnit ?? '—'}</td>
                              <td style={{ padding: '8px 16px', fontSize: '14px', color: '#6d7175' }}>{unit.conversionFactor ?? '—'}</td>
                              <td style={{ padding: '8px 16px', fontSize: '14px' }}>
                                {unit.isSystem ? <s-badge>System</s-badge> : unit.isActive ? <s-badge tone="success">Active</s-badge> : <s-badge tone="critical">Inactive</s-badge>}
                              </td>
                              <td style={{ padding: '8px 16px', fontSize: '14px' }}>
                                {!unit.isSystem && (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <s-button  onClick={() => openEdit(unit)}>Edit</s-button>
                                    <s-button  onClick={() => handleDelete(unit)}>Delete</s-button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </s-section>
                );
              })}
              {units.length === 0 && (
                <s-section><s-text>No units configured. Click "+ Add Unit" to get started.</s-text></s-section>
              )}
            </s-stack>
          )}
        </s-stack>
      )}
    </>
  );
}
