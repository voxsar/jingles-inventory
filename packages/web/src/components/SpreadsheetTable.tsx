import { useState, useRef, useEffect } from 'react';
import SearchableSelect from './SearchableSelect';

export type CellType = 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'boolean' | 'readonly';

export interface SpreadsheetColumn<T> {
  key: keyof T | string;
  header: string;
  type: CellType;
  width?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  editable?: boolean;
  render?: (row: T, isEditing: boolean) => React.ReactNode;
  getValue?: (row: T) => any;
  setValue?: (row: T, value: any) => Partial<T>;
  validate?: (value: any) => string | null;
}

interface SpreadsheetTableProps<T extends Record<string, any>> {
  columns: SpreadsheetColumn<T>[];
  data: T[];
  isLoading?: boolean;
  onSave?: (row: T, changes: Partial<T>) => Promise<void>;
  onDelete?: (row: T) => Promise<void>;
  onAdd?: (row: Partial<T>) => Promise<void>;
  emptyMessage?: string;
  emptyIcon?: string;
  getRowKey: (row: T) => string;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function SpreadsheetTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  onSave,
  onDelete,
  onAdd,
  emptyMessage = 'No data found',
  emptyIcon = '📭',
  getRowKey,
  canAdd = true,
  canEdit = true,
  canDelete = true,
}: SpreadsheetTableProps<T>) {
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<T>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newRowForm, setNewRowForm] = useState<Partial<T>>({});
  const tableRef = useRef<HTMLDivElement>(null);

  const startEdit = (row: T) => {
    const rowKey = getRowKey(row);
    setEditingRowKey(rowKey);
    const formData: Partial<T> = {};
    columns.forEach(col => {
      if (col.getValue) {
        formData[col.key as keyof T] = col.getValue(row);
      } else {
        formData[col.key as keyof T] = row[col.key];
      }
    });
    setEditForm(formData);
    setErrors({});
  };

  const cancelEdit = () => {
    setEditingRowKey(null);
    setEditForm({});
    setErrors({});
  };

  const cancelAdd = () => {
    setAddingNew(false);
    setNewRowForm({});
    setErrors({});
  };

  const validateForm = (form: Partial<T>): boolean => {
    const newErrors: Record<string, string> = {};
    columns.forEach(col => {
      if (col.required && col.editable !== false) {
        const value = form[col.key as keyof T];
        if (value === undefined || value === null || value === '') {
          newErrors[String(col.key)] = `${col.header} is required`;
        }
      }
      if (col.validate && form[col.key as keyof T] !== undefined) {
        const error = col.validate(form[col.key as keyof T]);
        if (error) {
          newErrors[String(col.key)] = error;
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveEdit = async (row: T) => {
    if (!validateForm(editForm)) return;
    if (!onSave) return;

    setIsSaving(true);
    try {
      const changes: Partial<T> = {};
      columns.forEach(col => {
        if (col.setValue && editForm[col.key as keyof T] !== undefined) {
          Object.assign(changes, col.setValue(row, editForm[col.key as keyof T]));
        } else if (editForm[col.key as keyof T] !== row[col.key]) {
          changes[col.key as keyof T] = editForm[col.key as keyof T];
        }
      });
      await onSave(row, changes);
      setEditingRowKey(null);
      setEditForm({});
      setErrors({});
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const saveNewRow = async () => {
    if (!validateForm(newRowForm)) return;
    if (!onAdd) return;

    setIsSaving(true);
    try {
      await onAdd(newRowForm);
      setAddingNew(false);
      setNewRowForm({});
      setErrors({});
    } catch (err) {
      console.error('Failed to add row:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: T) => {
    if (!onDelete) return;
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await onDelete(row);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const renderCell = (col: SpreadsheetColumn<T>, row: T, isEditing: boolean, form: Partial<T>, setForm: (form: Partial<T>) => void) => {
    const key = String(col.key);
    const value = form[col.key as keyof T];
    const error = errors[key];

    if (col.render && !isEditing) {
      return col.render(row, false);
    }

    if (!isEditing || col.editable === false) {
      if (col.type === 'select' && col.options) {
        const option = col.options.find(o => o.value === row[col.key]);
        return <span>{option?.label || row[col.key] || '—'}</span>;
      }
      if (col.type === 'multiselect' && col.options) {
        const values = Array.isArray(row[col.key]) ? row[col.key] : [];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {values.map((v: string, i: number) => {
              const option = col.options?.find(o => o.value === v);
              return (
                <span key={i} className="badge" style={{ fontSize: '11px', padding: '2px 6px' }}>
                  {option?.label || v}
                </span>
              );
            })}
          </div>
        );
      }
      if (col.type === 'boolean') {
        return <span>{row[col.key] ? '✓' : '—'}</span>;
      }
      if (col.type === 'date' && row[col.key]) {
        return <span>{new Date(row[col.key]).toLocaleDateString()}</span>;
      }
      return <span>{row[col.key] ?? '—'}</span>;
    }

    // Editing mode
    const commonStyle = {
      width: '100%',
      padding: '6px 8px',
      fontSize: '13px',
      border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
      borderRadius: '4px',
      outline: 'none',
    };

    if (col.type === 'select' && col.options) {
      return (
        <div>
          <SearchableSelect
            options={col.options}
            value={value as string}
            onChange={(val) => setForm({ ...form, [col.key]: val })}
            placeholder={`Select ${col.header}`}
            isClearable={!col.required}
          />
          {error && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>{error}</div>}
        </div>
      );
    }

    if (col.type === 'multiselect' && col.options) {
      return (
        <div>
          <SearchableSelect
            options={col.options}
            value={value as string[] || []}
            onChange={(val) => setForm({ ...form, [col.key]: val })}
            placeholder={`Select ${col.header}`}
            isMulti
          />
          {error && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>{error}</div>}
        </div>
      );
    }

    if (col.type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => setForm({ ...form, [col.key]: e.target.checked })}
          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
        />
      );
    }

    if (col.type === 'date') {
      return (
        <div>
          <input
            type="date"
            value={value ? new Date(value).toISOString().split('T')[0] : ''}
            onChange={(e) => setForm({ ...form, [col.key]: e.target.value })}
            style={commonStyle}
          />
          {error && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>{error}</div>}
        </div>
      );
    }

    if (col.type === 'number') {
      return (
        <div>
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => setForm({ ...form, [col.key]: e.target.value ? parseFloat(e.target.value) : '' })}
            style={commonStyle}
          />
          {error && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>{error}</div>}
        </div>
      );
    }

    // Default: text input
    return (
      <div>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => setForm({ ...form, [col.key]: e.target.value })}
          style={commonStyle}
        />
        {error && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>{error}</div>}
      </div>
    );
  };

  return (
    <div ref={tableRef} style={{ overflowX: 'auto', position: 'relative' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#f6f6f7' }}>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: '11px',
                  color: '#6d7175',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid #e1e3e5',
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}
              >
                {col.header}
                {col.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
              </th>
            ))}
            {(canEdit || canDelete) && (
              <th
                style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '11px',
                  color: '#6d7175',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '2px solid #e1e3e5',
                  width: '120px',
                }}
              >
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: columns.length + 1 }).map((_, j) => (
                  <td key={j} style={{ padding: '12px 16px', borderBottom: '1px solid #e1e3e5' }}>
                    <div style={{ height: '16px', background: '#e1e3e5', borderRadius: '4px', width: `${60 + (j * 13) % 40}%` }} />
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <>
              {/* Add new row form */}
              {addingNew && (
                <tr style={{ background: '#fef3c7', borderBottom: '2px solid #fbbf24' }}>
                  {columns.map((col) => (
                    <td key={String(col.key)} style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                      {renderCell(col, {} as T, true, newRowForm, setNewRowForm)}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        onClick={saveNewRow}
                        disabled={isSaving}
                        className="btn-sm"
                        style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        {isSaving ? '...' : '✓'}
                      </button>
                      <button
                        onClick={cancelAdd}
                        disabled={isSaving}
                        className="btn-sm"
                        style={{ background: '#6b7280', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {data.length === 0 && !addingNew ? (
                <tr>
                  <td colSpan={columns.length + 1} style={{ padding: '48px 16px', textAlign: 'center', color: '#6d7175' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{emptyIcon}</div>
                    <div>{emptyMessage}</div>
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => {
                  const rowKey = getRowKey(row);
                  const isEditing = editingRowKey === rowKey;

                  return (
                    <tr
                      key={rowKey}
                      style={{
                        background: isEditing ? '#dbeafe' : idx % 2 === 1 ? '#fafbfb' : 'white',
                        borderBottom: '1px solid #e1e3e5',
                      }}
                    >
                      {columns.map((col) => (
                        <td
                          key={String(col.key)}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            verticalAlign: 'top',
                          }}
                        >
                          {renderCell(col, row, isEditing, editForm, setEditForm)}
                        </td>
                      ))}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => saveEdit(row)}
                              disabled={isSaving}
                              className="btn-sm"
                              style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              {isSaving ? '...' : '✓'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="btn-sm"
                              style={{ background: '#6b7280', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {canEdit && (
                              <button
                                onClick={() => startEdit(row)}
                                className="btn-sm"
                                style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                ✎
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(row)}
                                className="btn-sm"
                                style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </>
          )}
        </tbody>
      </table>

      {/* Add row button */}
      {canAdd && !addingNew && !isLoading && (
        <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid #e1e3e5' }}>
          <button
            onClick={() => setAddingNew(true)}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            + Add New Row
          </button>
        </div>
      )}
    </div>
  );
}
