import { useEffect, useState } from 'react';
import { floorsApi, shelvesApi, boxesApi, inventoryApi } from '../api/client';
import DataTable from '../components/DataTable';

type View = 'floors' | 'shelves' | 'boxes';

const defaultFloorForm = { branchId: '', name: '', code: '', notes: '' };
const defaultShelfForm = { name: '', code: '', height: '', width: '', length: '', hasFreezer: false, hasLock: false, notes: '' };
const defaultBoxForm = { name: '', code: '', height: '', width: '', length: '' };
const defaultBarcodeForm = { barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' };

export default function LocationsPage() {
  // ── Data ─────────────────────────────────────────────────
  const [floors, setFloors] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [floorInventory, setFloorInventory] = useState<any[]>([]);

  // ── Navigation ────────────────────────────────────────────
  const [view, setView] = useState<View>('floors');
  const [selectedFloor, setSelectedFloor] = useState<any>(null);
  const [selectedShelf, setSelectedShelf] = useState<any>(null);
  const [showInventoryPanel, setShowInventoryPanel] = useState(false);
  const [inventoryPanelFloor, setInventoryPanelFloor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);

  // ── Modal state ───────────────────────────────────────────
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [editingFloor, setEditingFloor] = useState<any>(null);
  const [editFloorForm, setEditFloorForm] = useState(defaultFloorForm);
  const [showShelfForm, setShowShelfForm] = useState(false);
  const [showBoxForm, setShowBoxForm] = useState(false);
  const [showBarcodeForm, setShowBarcodeForm] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any>(null);

  const [floorForm, setFloorForm] = useState(defaultFloorForm);
  const [shelfForm, setShelfForm] = useState(defaultShelfForm);
  const [boxForm, setBoxForm] = useState(defaultBoxForm);
  const [barcodeForm, setBarcodeForm] = useState(defaultBarcodeForm);

  // ── Load functions ────────────────────────────────────────
  const loadFloors = async () => {
    setIsLoading(true);
    try {
      const res = await floorsApi.list();
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setFloors(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadShelves = async (floorId: string) => {
    setIsLoading(true);
    try {
      const res = await shelvesApi.list({ floorId });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setShelves(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBoxes = async (shelfId: string) => {
    setIsLoading(true);
    try {
      const res = await boxesApi.list({ shelfId });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setBoxes(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFloorInventory = async (floorId: string) => {
    setIsInventoryLoading(true);
    try {
      const res = await inventoryApi.list({ floorId, pageSize: '100' });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setFloorInventory(Array.isArray(data) ? data : []);
    } finally {
      setIsInventoryLoading(false);
    }
  };

  useEffect(() => { loadFloors(); }, []);

  // ── Navigation helpers ────────────────────────────────────
  const drillToShelves = (floor: any) => {
    setSelectedFloor(floor);
    setView('shelves');
    loadShelves(floor.id);
  };

  const drillToBoxes = (shelf: any) => {
    setSelectedShelf(shelf);
    setView('boxes');
    loadBoxes(shelf.id);
  };

  const openInventoryPanel = (floor: any) => {
    setInventoryPanelFloor(floor);
    setShowInventoryPanel(true);
    loadFloorInventory(floor.id);
  };

  const goBack = () => {
    if (view === 'shelves') {
      setView('floors');
      setSelectedFloor(null);
    } else if (view === 'boxes') {
      setView('shelves');
      setSelectedShelf(null);
    }
  };

  // ── Create / Edit / Delete handlers ──────────────────────
  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await floorsApi.create({
        branchId: floorForm.branchId || undefined,
        name: floorForm.name,
        code: floorForm.code.toUpperCase(),
        notes: floorForm.notes || undefined,
      });
      setShowFloorForm(false);
      setFloorForm(defaultFloorForm);
      await loadFloors();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create floor');
    }
  };

  const openEditFloor = (floor: any) => {
    setEditingFloor(floor);
    setEditFloorForm({
      branchId: floor.branchId ?? '',
      name: floor.name ?? '',
      code: floor.code ?? '',
      notes: floor.notes ?? '',
    });
  };

  const handleSaveEditFloor = async () => {
    if (!editingFloor) return;
    try {
      await floorsApi.update(editingFloor.id, {
        name: editFloorForm.name,
        code: editFloorForm.code.toUpperCase(),
        notes: editFloorForm.notes || undefined,
      });
      setEditingFloor(null);
      await loadFloors();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update floor');
    }
  };

  const handleDeleteFloor = async (floor: any) => {
    if (!confirm(`Delete floor "${floor.name}"? Inventory records here will have their floor cleared. History will be preserved.`)) return;
    try {
      await floorsApi.delete(floor.id);
      await loadFloors();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete floor');
    }
  };

  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await shelvesApi.create({
        floorId: selectedFloor.id,
        name: shelfForm.name,
        code: shelfForm.code.toUpperCase(),
        height: parseFloat(shelfForm.height),
        width: parseFloat(shelfForm.width),
        length: parseFloat(shelfForm.length),
        hasFreezer: shelfForm.hasFreezer,
        hasLock: shelfForm.hasLock,
        notes: shelfForm.notes || undefined,
      });
      setShowShelfForm(false);
      setShelfForm(defaultShelfForm);
      await loadShelves(selectedFloor.id);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create shelf');
    }
  };

  const handleCreateBox = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await boxesApi.create({
        shelfId: selectedShelf.id,
        name: boxForm.name,
        code: boxForm.code.toUpperCase(),
        height: parseFloat(boxForm.height),
        width: parseFloat(boxForm.width),
        length: parseFloat(boxForm.length),
      });
      setShowBoxForm(false);
      setBoxForm(defaultBoxForm);
      await loadBoxes(selectedShelf.id);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create box');
    }
  };

  const handleAddBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await boxesApi.addBarcode(selectedBox.id, barcodeForm);
      setShowBarcodeForm(false);
      setBarcodeForm(defaultBarcodeForm);
      if (selectedShelf) await loadBoxes(selectedShelf.id);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to add barcode');
    }
  };

  const handleDeleteBarcode = async (boxId: string, barcodeId: string) => {
    if (!confirm('Remove this barcode?')) return;
    try {
      await boxesApi.deleteBarcode(boxId, barcodeId);
      if (selectedShelf) await loadBoxes(selectedShelf.id);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete barcode');
    }
  };

  // ── Group floors by branch for overview ───────────────────
  const groupedByBranch = floors.reduce<Record<string, { branch: any; floors: any[] }>>((acc, floor) => {
    const branchKey = floor.branch?.id ?? '__none__';
    const branchLabel = floor.branch?.name ?? 'No Branch';
    if (!acc[branchKey]) acc[branchKey] = { branch: floor.branch ?? { name: branchLabel }, floors: [] };
    acc[branchKey].floors.push(floor);
    return acc;
  }, {});

  // ── Columns ───────────────────────────────────────────────
  const floorColumns = [
    {
      key: 'name', header: 'Floor Name', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <span className="text-lg">🏢</span>
          <div>
            <div className="font-medium">{r.name}</div>
            {r.branch && <div className="text-xs text-gray-400">🏪 {r.branch.name}</div>}
          </div>
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</span>, sortable: true },
    {
      key: 'counts', header: 'Contents',
      render: (r: any) => (
        <div className="flex gap-2 text-xs">
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            📦 {r._count?.inventoryRecords ?? 0} items
          </span>
          <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
            🗄 {r._count?.shelves ?? 0} shelves
          </span>
        </div>
      ),
    },
    { key: 'notes', header: 'Notes', render: (r: any) => r.notes ?? '—' },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-1 flex-wrap">
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToShelves(r); }}>Shelves →</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openInventoryPanel(r); }}>📦 Products</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditFloor(r); }}>Edit</button>
          {r.isActive && (
            <button className="btn-sm text-red-600" onClick={(e: any) => { e.stopPropagation(); handleDeleteFloor(r); }}>Delete</button>
          )}
        </div>
      ),
    },
  ];

  const shelfColumns = [
    {
      key: 'name', header: 'Shelf Name', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <span>🗄</span>
          <span className="font-medium">{r.name}</span>
          <div className="flex gap-1">
            {r.hasFreezer && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">❄️ Freezer</span>}
            {r.hasLock && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">🔒 Locked</span>}
          </div>
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</span>, sortable: true },
    { key: 'height', header: 'H (cm)' },
    { key: 'width', header: 'W (cm)' },
    { key: 'length', header: 'L (cm)' },
    {
      key: 'boxes', header: 'Boxes',
      render: (r: any) => (
        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs">
          📦 {r.boxes?.length ?? 0}
        </span>
      ),
    },
    { key: 'notes', header: 'Notes', render: (r: any) => r.notes ?? '—' },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToBoxes(r); }}>Boxes →</button>
      ),
    },
  ];

  const boxColumns = [
    {
      key: 'name', header: 'Box Name', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <span>📦</span>
          <span className="font-medium">{r.name}</span>
          {r.shelf && <span className="text-xs text-gray-400">(on: {r.shelf.name})</span>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</span>, sortable: true },
    { key: 'height', header: 'H (cm)' },
    { key: 'width', header: 'W (cm)' },
    { key: 'length', header: 'L (cm)' },
    {
      key: 'barcodes', header: 'Barcodes',
      render: (r: any) => (
        <div className="flex flex-wrap gap-1">
          {(r.barcodes ?? []).map((b: any) => (
            <span key={b.id} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{b.barcode}{b.isDefault ? ' ★' : ''}</span>
          ))}
          {(r.barcodes ?? []).length === 0 && <span className="text-gray-400 text-xs">—</span>}
        </div>
      ),
    },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); setSelectedBox(r); setShowBarcodeForm(true); }}>
          + Barcode
        </button>
      ),
    },
  ];

  // ── Breadcrumb ────────────────────────────────────────────
  const renderBreadcrumb = () => (
    <div className="flex items-center gap-1 text-sm text-gray-500">
      <button
        className={view === 'floors' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer text-indigo-600'}
        onClick={() => { setView('floors'); loadFloors(); }}
      >
        🏢 Floors
      </button>
      {selectedFloor && (
        <>
          <span>›</span>
          <button
            className={view === 'shelves' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer text-indigo-600'}
            onClick={() => { setView('shelves'); loadShelves(selectedFloor.id); }}
          >
            🗄 {selectedFloor.name}
          </button>
        </>
      )}
      {selectedShelf && (
        <>
          <span>›</span>
          <span className="font-semibold text-gray-900">📦 {selectedShelf.name}</span>
        </>
      )}
    </div>
  );

  // ── View labels ───────────────────────────────────────────
  const viewTitle: Record<View, string> = {
    floors: '🏢 Floors',
    shelves: '🗄 Shelves',
    boxes: '📦 Storage Boxes',
  };
  const viewSubtitle: Record<View, string> = {
    floors: 'Branch → Floor → Shelf → Box',
    shelves: 'Shelves on this floor (with freezer, lock and other properties)',
    boxes: 'Storage boxes on this shelf',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{viewTitle[view]}</h1>
          <p className="page-subtitle">{viewSubtitle[view]}</p>
        </div>
        <div className="flex gap-2">
          {view !== 'floors' && (
            <button className="btn-secondary" onClick={goBack}>← Back</button>
          )}
          {view === 'floors' && <button className="btn-primary" onClick={() => setShowFloorForm(true)}>+ New Floor</button>}
          {view === 'shelves' && <button className="btn-primary" onClick={() => setShowShelfForm(true)}>+ New Shelf</button>}
          {view === 'boxes' && <button className="btn-primary" onClick={() => setShowBoxForm(true)}>+ New Box</button>}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="px-1">{renderBreadcrumb()}</div>

      {/* Branch grouping at floors level */}
      {view === 'floors' && Object.keys(groupedByBranch).length > 1 && (
        <div className="content-section px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Branch</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(groupedByBranch).map(([key, { branch, floors: bFloors }]) => (
              <div key={key} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                <span>🏪</span>
                <span className="font-medium">{branch?.name ?? 'No Branch'}</span>
                <span className="text-gray-400">({bFloors.length} floors)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table section */}
      <div className="content-section">
        {view === 'floors' && <DataTable columns={floorColumns} data={floors} isLoading={isLoading} emptyMessage="No floors found" emptyIcon="🏢" />}
        {view === 'shelves' && <DataTable columns={shelfColumns} data={shelves} isLoading={isLoading} emptyMessage="No shelves found on this floor" emptyIcon="🗄" />}
        {view === 'boxes' && <DataTable columns={boxColumns} data={boxes} isLoading={isLoading} emptyMessage="No boxes found" emptyIcon="📦" />}
      </div>

      {/* Products in Floor panel */}
      {showInventoryPanel && inventoryPanelFloor && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowInventoryPanel(false)}>
          <div className="modal-panel-lg">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">📦 Products on Floor</h2>
                <p className="text-xs text-gray-400">🏢 {inventoryPanelFloor.name}</p>
              </div>
              <button className="modal-close" onClick={() => setShowInventoryPanel(false)}>✕</button>
            </div>
            <div className="modal-body">
              {isInventoryLoading ? (
                <div className="py-8 text-center text-gray-500">Loading inventory…</div>
              ) : floorInventory.length === 0 ? (
                <div className="py-8 text-center text-gray-400">No inventory records on this floor.</div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(
                      floorInventory.reduce<Record<string, number>>((acc, r) => {
                        acc[r.state] = (acc[r.state] ?? 0) + r.quantity;
                        return acc;
                      }, {})
                    ).map(([state, qty]) => (
                      <span key={state} className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                        {state}: {qty}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1 text-sm">
                    {Object.entries(
                      floorInventory.reduce<Record<string, { sku: any; records: any[] }>>((acc, r) => {
                        const key = r.skuId;
                        if (!acc[key]) acc[key] = { sku: r.sku, records: [] };
                        acc[key].records.push(r);
                        return acc;
                      }, {})
                    ).map(([skuId, { sku, records }]) => {
                      const totalQty = records.reduce((s, r) => s + r.quantity, 0);
                      return (
                        <div key={skuId} className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 font-medium">
                            <span>📦</span>
                            <span className="font-mono text-xs text-gray-500">{sku?.skuCode}</span>
                            <span>{sku?.name}</span>
                            <span className="ml-auto text-sm font-semibold text-indigo-700">Qty: {totalQty}</span>
                          </div>
                          {records.map((r: any) => (
                            <div key={r.id} className="flex items-center gap-3 px-6 py-1.5 border-t border-gray-100 text-xs text-gray-600">
                              <span className="text-gray-400">└</span>
                              <span className="font-medium text-gray-700">×{r.quantity}</span>
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: '#e0e7ff', color: '#3730a3' }}>{r.state}</span>
                              {r.batchId && <span className="font-mono text-gray-400">{r.batchId}</span>}
                              {r.shelf && <span className="text-gray-400">🗄 {r.shelf.name}</span>}
                              {r.box && <span className="text-gray-400">📦 {r.box.name}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowInventoryPanel(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Floor Modal */}
      {showFloorForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowFloorForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create Floor</h2>
              <button className="modal-close" onClick={() => setShowFloorForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateFloor}>
              <div className="modal-body form-stack">
                <p className="text-sm text-gray-500">A floor is a physical level inside a branch building (e.g., "Ground Floor", "1st Floor", "Basement").</p>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Floor Name *</label>
                    <input className="input-field" type="text" required placeholder="e.g. Ground Floor, 1st Floor" value={floorForm.name} onChange={(e) => setFloorForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" required placeholder="e.g. GF, 1F, B1" value={floorForm.code} onChange={(e) => setFloorForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input-field" type="text" placeholder="Optional notes about this floor" value={floorForm.notes} onChange={(e) => setFloorForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowFloorForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Floor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Floor Modal */}
      {editingFloor && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingFloor(null)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Floor</h2>
              <button className="modal-close" onClick={() => setEditingFloor(null)}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Floor Name *</label>
                  <input className="input-field" type="text" required value={editFloorForm.name} onChange={(e) => setEditFloorForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Code *</label>
                  <input className="input-field" type="text" required value={editFloorForm.code} onChange={(e) => setEditFloorForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="input-field" type="text" value={editFloorForm.notes} onChange={(e) => setEditFloorForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditingFloor(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveEditFloor}>💾 Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Shelf Modal */}
      {showShelfForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowShelfForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create Shelf</h2>
              <button className="modal-close" onClick={() => setShowShelfForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateShelf}>
              <div className="modal-body form-stack">
                {selectedFloor && (
                  <div className="flex items-center gap-2 text-sm bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg">
                    <span>🏢</span>
                    <span>This shelf will be on floor: <strong>{selectedFloor.name}</strong></span>
                  </div>
                )}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="input-field" type="text" required value={shelfForm.name} onChange={(e) => setShelfForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" required value={shelfForm.code} onChange={(e) => setShelfForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Height (cm) *</label>
                    <input className="input-field" type="number" step="0.01" required min="0.01" value={shelfForm.height} onChange={(e) => setShelfForm(f => ({ ...f, height: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Width (cm) *</label>
                    <input className="input-field" type="number" step="0.01" required min="0.01" value={shelfForm.width} onChange={(e) => setShelfForm(f => ({ ...f, width: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Length (cm) *</label>
                    <input className="input-field" type="number" step="0.01" required min="0.01" value={shelfForm.length} onChange={(e) => setShelfForm(f => ({ ...f, length: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <p className="form-label mb-2">Special Properties</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={shelfForm.hasFreezer} onChange={(e) => setShelfForm(f => ({ ...f, hasFreezer: e.target.checked }))} className="rounded" />
                      ❄️ Freezer / Cold Storage
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={shelfForm.hasLock} onChange={(e) => setShelfForm(f => ({ ...f, hasLock: e.target.checked }))} className="rounded" />
                      🔒 Lockable / Secured
                    </label>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input-field" type="text" value={shelfForm.notes} onChange={(e) => setShelfForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowShelfForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Shelf</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Box Modal */}
      {showBoxForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowBoxForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create Storage Box</h2>
              <button className="modal-close" onClick={() => setShowBoxForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateBox}>
              <div className="modal-body form-stack">
                {selectedShelf && (
                  <div className="flex items-center gap-2 text-sm bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">
                    <span>🗄</span>
                    <span>This box will be placed on shelf: <strong>{selectedShelf.name}</strong></span>
                  </div>
                )}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="input-field" type="text" required value={boxForm.name} onChange={(e) => setBoxForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" required value={boxForm.code} onChange={(e) => setBoxForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Height (cm) *</label>
                    <input className="input-field" type="number" step="0.01" required min="0.01" value={boxForm.height} onChange={(e) => setBoxForm(f => ({ ...f, height: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Width (cm) *</label>
                    <input className="input-field" type="number" step="0.01" required min="0.01" value={boxForm.width} onChange={(e) => setBoxForm(f => ({ ...f, width: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Length (cm) *</label>
                    <input className="input-field" type="number" step="0.01" required min="0.01" value={boxForm.length} onChange={(e) => setBoxForm(f => ({ ...f, length: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowBoxForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Box</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Barcode to Box Modal */}
      {showBarcodeForm && selectedBox && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowBarcodeForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">🏷️ Add Barcode — {selectedBox.name}</h2>
              <button className="modal-close" onClick={() => setShowBarcodeForm(false)}>✕</button>
            </div>
            {(selectedBox.barcodes ?? []).length > 0 && (
              <div className="px-6 pt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Existing Barcodes</p>
                <div className="flex flex-col gap-1">
                  {(selectedBox.barcodes ?? []).map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded-md">
                      <span><span className="font-mono">{b.barcode}</span> <span className="text-gray-400 text-xs">({b.barcodeType})</span>{b.isDefault ? ' ★' : ''}</span>
                      <button className="btn-sm text-red-600" onClick={() => handleDeleteBarcode(selectedBox.id, b.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={handleAddBarcode}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Barcode *</label>
                    <input className="input-field" type="text" required value={barcodeForm.barcode} onChange={(e) => setBarcodeForm(f => ({ ...f, barcode: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="input-field" value={barcodeForm.barcodeType} onChange={(e) => setBarcodeForm(f => ({ ...f, barcodeType: e.target.value }))}>
                      {['EAN13', 'UPC', 'QRCode', 'Code128', 'Code39', 'Custom'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Label</label>
                  <input className="input-field" type="text" value={barcodeForm.label} onChange={(e) => setBarcodeForm(f => ({ ...f, label: e.target.value }))} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={barcodeForm.isDefault} onChange={(e) => setBarcodeForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                  Set as Default Barcode
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowBarcodeForm(false)}>Close</button>
                <button type="submit" className="btn-primary">Add Barcode</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
