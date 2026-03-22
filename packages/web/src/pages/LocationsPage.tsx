import { useEffect, useState } from 'react';
import { locationsApi, areasApi, shelvesApi, boxesApi, inventoryApi } from '../api/client';
import DataTable from '../components/DataTable';

type View = 'locations' | 'areas' | 'shelves' | 'boxes';

const defaultLocationForm = { floor: '', section: '', aisle: '', zone: '', capacityCubicCm: '', notes: '' };
const defaultAreaForm = { name: '', code: '', description: '' };
const defaultShelfForm = { name: '', code: '', height: '', width: '', length: '', rotationAngle: '0' };
const defaultBoxForm = { name: '', code: '', height: '', width: '', length: '' };
const defaultBarcodeForm = { barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' };

/** Format a location's label from its floor/section/aisle/zone fields */
function formatZoneLabel(loc: any): string {
  return [loc.floor, loc.section, loc.shelf ?? loc.aisle, loc.zone].filter(Boolean).join(' › ');
}

export default function LocationsPage() {
  // ── Data ─────────────────────────────────────────────────
  const [locations, setLocations] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [locationInventory, setLocationInventory] = useState<any[]>([]);

  // ── Navigation ────────────────────────────────────────────
  const [view, setView] = useState<View>('locations');
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [selectedArea, setSelectedArea] = useState<any>(null);
  const [selectedShelf, setSelectedShelf] = useState<any>(null);
  const [showInventoryPanel, setShowInventoryPanel] = useState(false);
  const [inventoryPanelLocation, setInventoryPanelLocation] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);

  // ── Modal state ───────────────────────────────────────────
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [editLocationForm, setEditLocationForm] = useState(defaultLocationForm);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [showShelfForm, setShowShelfForm] = useState(false);
  const [showBoxForm, setShowBoxForm] = useState(false);
  const [showBarcodeForm, setShowBarcodeForm] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any>(null);

  const [locationForm, setLocationForm] = useState(defaultLocationForm);
  const [areaForm, setAreaForm] = useState(defaultAreaForm);
  const [shelfForm, setShelfForm] = useState(defaultShelfForm);
  const [boxForm, setBoxForm] = useState(defaultBoxForm);
  const [barcodeForm, setBarcodeForm] = useState(defaultBarcodeForm);

  // ── Load functions ────────────────────────────────────────
  const loadLocations = async () => {
    setIsLoading(true);
    try {
      const res = await locationsApi.list();
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setLocations(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAreas = async (locationId: string) => {
    setIsLoading(true);
    try {
      const res = await areasApi.list({ locationId });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setAreas(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadShelves = async (areaId: string) => {
    setIsLoading(true);
    try {
      const res = await shelvesApi.list({ areaId });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setShelves(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBoxes = async (filter: Record<string, string>) => {
    setIsLoading(true);
    try {
      const res = await boxesApi.list(filter);
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setBoxes(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocationInventory = async (locationId: string) => {
    setIsInventoryLoading(true);
    try {
      const res = await inventoryApi.list({ locationId, pageSize: '100' });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setLocationInventory(Array.isArray(data) ? data : []);
    } finally {
      setIsInventoryLoading(false);
    }
  };

  useEffect(() => { loadLocations(); }, []);

  // ── Navigation helpers ────────────────────────────────────
  const drillToAreas = (loc: any) => {
    setSelectedLocation(loc);
    setView('areas');
    loadAreas(loc.id);
  };

  const drillToShelves = (area: any) => {
    setSelectedArea(area);
    setView('shelves');
    loadShelves(area.id);
  };

  const drillToBoxes = (shelf: any) => {
    setSelectedShelf(shelf);
    setView('boxes');
    loadBoxes({ shelfId: shelf.id });
  };

  const drillToBoxesFromArea = (area: any) => {
    setSelectedArea(area);
    setSelectedShelf(null);
    setView('boxes');
    loadBoxes({ areaId: area.id });
  };

  const openInventoryPanel = (loc: any) => {
    setInventoryPanelLocation(loc);
    setShowInventoryPanel(true);
    loadLocationInventory(loc.id);
  };

  const goBack = () => {
    if (view === 'areas') {
      setView('locations');
      setSelectedLocation(null);
    } else if (view === 'shelves') {
      setView('areas');
      setSelectedShelf(null);
    } else if (view === 'boxes') {
      if (selectedShelf) {
        setView('shelves');
        setSelectedShelf(null);
      } else {
        setView('areas');
        setSelectedArea(null);
      }
    }
  };

  // ── Create / Edit / Delete handlers ──────────────────────
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await locationsApi.create({
        floor: locationForm.floor,
        section: locationForm.section,
        shelf: locationForm.aisle,  // "aisle" in UI maps to "shelf" field in DB
        zone: locationForm.zone,
        capacityCubicCm: locationForm.capacityCubicCm ? parseFloat(locationForm.capacityCubicCm) : null,
        notes: locationForm.notes,
      });
      setShowLocationForm(false);
      setLocationForm(defaultLocationForm);
      await loadLocations();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create zone');
    }
  };

  const openEditLocation = (loc: any) => {
    setEditingLocation(loc);
    setEditLocationForm({
      floor: loc.floor ?? '',
      section: loc.section ?? '',
      aisle: loc.shelf ?? '',  // DB field is "shelf", UI shows as "Aisle"
      zone: loc.zone ?? '',
      capacityCubicCm: loc.capacityCubicCm != null ? String(loc.capacityCubicCm) : '',
      notes: loc.notes ?? '',
    });
  };

  const handleSaveEditLocation = async () => {
    if (!editingLocation) return;
    try {
      await locationsApi.update(editingLocation.id, {
        floor: editLocationForm.floor,
        section: editLocationForm.section,
        shelf: editLocationForm.aisle,
        zone: editLocationForm.zone,
        capacityCubicCm: editLocationForm.capacityCubicCm ? parseFloat(editLocationForm.capacityCubicCm) : null,
        notes: editLocationForm.notes,
      });
      setEditingLocation(null);
      await loadLocations();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update zone');
    }
  };

  const handleDeleteLocation = async (loc: any) => {
    const locLabel = formatZoneLabel(loc);
    if (!confirm(`Delete storage zone "${locLabel}"? Inventory records here will have their zone cleared. History will be preserved.`)) return;
    try {
      await locationsApi.delete(loc.id);
      await loadLocations();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete zone');
    }
  };

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await areasApi.create({ ...areaForm, locationId: selectedLocation.id });
      setShowAreaForm(false);
      setAreaForm(defaultAreaForm);
      await loadAreas(selectedLocation.id);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create area');
    }
  };

  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await shelvesApi.create({
        ...shelfForm,
        areaId: selectedArea.id,
        height: parseFloat(shelfForm.height),
        width: parseFloat(shelfForm.width),
        length: parseFloat(shelfForm.length),
        rotationAngle: parseFloat(shelfForm.rotationAngle),
      });
      setShowShelfForm(false);
      setShelfForm(defaultShelfForm);
      await loadShelves(selectedArea.id);
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create shelf');
    }
  };

  const handleCreateBox = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await boxesApi.create({
        ...boxForm,
        height: parseFloat(boxForm.height),
        width: parseFloat(boxForm.width),
        length: parseFloat(boxForm.length),
        shelfId: selectedShelf?.id ?? null,
        areaId: selectedShelf ? null : selectedArea?.id ?? null,
      });
      setShowBoxForm(false);
      setBoxForm(defaultBoxForm);
      if (selectedShelf) await loadBoxes({ shelfId: selectedShelf.id });
      else if (selectedArea) await loadBoxes({ areaId: selectedArea.id });
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
      if (selectedShelf) await loadBoxes({ shelfId: selectedShelf.id });
      else if (selectedArea) await loadBoxes({ areaId: selectedArea.id });
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to add barcode');
    }
  };

  const handleDeleteBarcode = async (boxId: string, barcodeId: string) => {
    if (!confirm('Remove this barcode?')) return;
    try {
      await boxesApi.deleteBarcode(boxId, barcodeId);
      if (selectedShelf) await loadBoxes({ shelfId: selectedShelf.id });
      else if (selectedArea) await loadBoxes({ areaId: selectedArea.id });
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete barcode');
    }
  };

  // ── Group locations by branch for tree view ───────────────
  const groupedByBranch = locations.reduce<Record<string, { branch: any; zones: any[] }>>((acc, loc) => {
    const branchKey = loc.branch?.id ?? '__none__';
    const branchLabel = loc.branch?.name ?? 'No Branch';
    if (!acc[branchKey]) acc[branchKey] = { branch: loc.branch ?? { name: branchLabel }, zones: [] };
    acc[branchKey].zones.push(loc);
    return acc;
  }, {});

  // ── Columns ───────────────────────────────────────────────
  const locationColumns = [
    {
      key: 'zone', header: 'Storage Zone', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <span className="text-lg">📁</span>
          <div>
            <div className="font-medium">{formatZoneLabel(r)}</div>
            {r.branch && <div className="text-xs text-gray-400">🏪 {r.branch.name}</div>}
          </div>
        </div>
      ),
    },
    { key: 'floor', header: 'Floor/Level', render: (r: any) => r.floor ?? '—' },
    { key: 'section', header: 'Section', render: (r: any) => r.section ?? '—' },
    { key: 'shelf', header: 'Aisle', render: (r: any) => r.shelf ?? '—' },
    { key: 'zone', header: 'Zone Ref', render: (r: any) => r.zone ?? '—' },
    {
      key: 'counts', header: 'Contents',
      render: (r: any) => (
        <div className="flex gap-2 text-xs">
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            📦 {r._count?.inventoryRecords ?? 0} items
          </span>
          <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full">
            🗂 {r._count?.areas ?? 0} areas
          </span>
        </div>
      ),
    },
    { key: 'capacityCubicCm', header: 'Capacity (cm³)', render: (r: any) => r.capacityCubicCm?.toLocaleString() ?? '—' },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-1 flex-wrap">
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToAreas(r); }}>Areas →</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openInventoryPanel(r); }}>📦 Products</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditLocation(r); }}>Edit</button>
          {r.isActive && (
            <button className="btn-sm text-red-600" onClick={(e: any) => { e.stopPropagation(); handleDeleteLocation(r); }}>Delete</button>
          )}
        </div>
      ),
    },
  ];

  const areaColumns = [
    {
      key: 'name', header: 'Area Name', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <span>📂</span>
          <span className="font-medium">{r.name}</span>
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs">{r.code}</span>, sortable: true },
    { key: 'description', header: 'Description', render: (r: any) => r.description ?? '—' },
    {
      key: 'counts', header: 'Contents',
      render: (r: any) => (
        <div className="flex gap-2 text-xs">
          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">🗄 {r.shelves?.length ?? 0} shelves</span>
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">📦 {r.boxes?.length ?? 0} boxes</span>
        </div>
      ),
    },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-2">
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToShelves(r); }}>Shelves →</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToBoxesFromArea(r); }}>Boxes →</button>
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
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs">{r.code}</span>, sortable: true },
    { key: 'height', header: 'H (cm)' },
    { key: 'width', header: 'W (cm)' },
    { key: 'length', header: 'L (cm)' },
    { key: 'rotationAngle', header: 'Angle (°)' },
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
          {r.shelf && <span className="text-xs text-gray-400">(on shelf: {r.shelf.name})</span>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs">{r.code}</span>, sortable: true },
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
        className={view === 'locations' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer text-indigo-600'}
        onClick={() => { setView('locations'); loadLocations(); }}
      >
        📍 Storage Zones
      </button>
      {selectedLocation && (
        <>
          <span>›</span>
          <button
            className={view === 'areas' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer text-indigo-600'}
            onClick={() => { setView('areas'); loadAreas(selectedLocation.id); }}
          >
            📂 {formatZoneLabel(selectedLocation)}
          </button>
        </>
      )}
      {selectedArea && (
        <>
          <span>›</span>
          <button
            className={view === 'shelves' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer text-indigo-600'}
            onClick={() => { setView('shelves'); loadShelves(selectedArea.id); }}
          >
            🗂 {selectedArea.name}
          </button>
        </>
      )}
      {selectedShelf && (
        <>
          <span>›</span>
          <span className="font-semibold text-gray-900">🗄 {selectedShelf.name}</span>
        </>
      )}
    </div>
  );

  // ── View labels ───────────────────────────────────────────
  const viewTitle: Record<View, string> = {
    locations: '📍 Storage Zones',
    areas: '📂 Areas',
    shelves: '🗄 Shelves',
    boxes: '📦 Storage Boxes',
  };
  const viewSubtitle: Record<View, string> = {
    locations: 'Branch → Zone (Floor/Level) → Area → Shelf → Box',
    areas: 'Areas within a storage zone (e.g., rows or sections)',
    shelves: 'Physical shelves in this area',
    boxes: 'Storage boxes on this shelf or area',
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
          {view !== 'locations' && (
            <button className="btn-secondary" onClick={goBack}>← Back</button>
          )}
          {view === 'locations' && <button className="btn-primary" onClick={() => setShowLocationForm(true)}>+ New Storage Zone</button>}
          {view === 'areas' && <button className="btn-primary" onClick={() => setShowAreaForm(true)}>+ New Area</button>}
          {view === 'shelves' && <button className="btn-primary" onClick={() => setShowShelfForm(true)}>+ New Shelf</button>}
          {view === 'boxes' && <button className="btn-primary" onClick={() => setShowBoxForm(true)}>+ New Box</button>}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="px-1">{renderBreadcrumb()}</div>

      {/* Tree summary at locations level */}
      {view === 'locations' && Object.keys(groupedByBranch).length > 1 && (
        <div className="content-section px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Branch</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(groupedByBranch).map(([key, { branch, zones }]) => (
              <div key={key} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                <span>🏪</span>
                <span className="font-medium">{branch?.name ?? 'No Branch'}</span>
                <span className="text-gray-400">({zones.length} zones)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table section */}
      <div className="content-section">
        {view === 'locations' && <DataTable columns={locationColumns} data={locations} isLoading={isLoading} emptyMessage="No storage zones found" emptyIcon="📍" />}
        {view === 'areas' && <DataTable columns={areaColumns} data={areas} isLoading={isLoading} emptyMessage="No areas found in this zone" emptyIcon="📂" />}
        {view === 'shelves' && <DataTable columns={shelfColumns} data={shelves} isLoading={isLoading} emptyMessage="No shelves found in this area" emptyIcon="🗄" />}
        {view === 'boxes' && <DataTable columns={boxColumns} data={boxes} isLoading={isLoading} emptyMessage="No boxes found" emptyIcon="📦" />}
      </div>

      {/* Products in Zone panel (slide-in style) */}
      {showInventoryPanel && inventoryPanelLocation && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowInventoryPanel(false)}>
          <div className="modal-panel-lg">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">📦 Products in Zone</h2>
                <p className="text-xs text-gray-400">📁 {formatZoneLabel(inventoryPanelLocation)}</p>
              </div>
              <button className="modal-close" onClick={() => setShowInventoryPanel(false)}>✕</button>
            </div>
            <div className="modal-body">
              {isInventoryLoading ? (
                <div className="py-8 text-center text-gray-500">Loading inventory…</div>
              ) : locationInventory.length === 0 ? (
                <div className="py-8 text-center text-gray-400">No inventory records in this zone.</div>
              ) : (
                <>
                  {/* Summary counts by state */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(
                      locationInventory.reduce<Record<string, number>>((acc, r) => {
                        acc[r.state] = (acc[r.state] ?? 0) + r.quantity;
                        return acc;
                      }, {})
                    ).map(([state, qty]) => (
                      <span key={state} className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                        {state}: {qty}
                      </span>
                    ))}
                  </div>
                  {/* Folder-tree by SKU */}
                  <div className="flex flex-col gap-1 text-sm">
                    {Object.entries(
                      locationInventory.reduce<Record<string, { sku: any; records: any[] }>>((acc, r) => {
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

      {/* Create Zone Modal */}
      {showLocationForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowLocationForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create Storage Zone</h2>
              <button className="modal-close" onClick={() => setShowLocationForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateLocation}>
              <div className="modal-body form-stack">
                <p className="text-sm text-gray-500">A storage zone is a physical area inside a branch, like a floor or level (e.g., "Ground Floor, Row A, Aisle 1").</p>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Floor / Level *</label>
                    <input className="input-field" type="text" required placeholder="e.g. Ground Floor, Level 2" value={locationForm.floor} onChange={(e) => setLocationForm(f => ({ ...f, floor: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Section / Row *</label>
                    <input className="input-field" type="text" required placeholder="e.g. Row A, Section B" value={locationForm.section} onChange={(e) => setLocationForm(f => ({ ...f, section: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Aisle *</label>
                    <input className="input-field" type="text" required placeholder="e.g. Aisle 1, East Wing" value={locationForm.aisle} onChange={(e) => setLocationForm(f => ({ ...f, aisle: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Zone Reference</label>
                    <input className="input-field" type="text" placeholder="e.g. Cold Storage, Bulk" value={locationForm.zone} onChange={(e) => setLocationForm(f => ({ ...f, zone: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Capacity (cm³)</label>
                    <input className="input-field" type="number" value={locationForm.capacityCubicCm} onChange={(e) => setLocationForm(f => ({ ...f, capacityCubicCm: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input-field" type="text" value={locationForm.notes} onChange={(e) => setLocationForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowLocationForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Zone</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Zone Modal */}
      {editingLocation && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingLocation(null)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Storage Zone</h2>
              <button className="modal-close" onClick={() => setEditingLocation(null)}>✕</button>
            </div>
            <div className="modal-body form-stack">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Floor / Level *</label>
                  <input className="input-field" type="text" required value={editLocationForm.floor} onChange={(e) => setEditLocationForm(f => ({ ...f, floor: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Section / Row *</label>
                  <input className="input-field" type="text" required value={editLocationForm.section} onChange={(e) => setEditLocationForm(f => ({ ...f, section: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Aisle *</label>
                  <input className="input-field" type="text" required value={editLocationForm.aisle} onChange={(e) => setEditLocationForm(f => ({ ...f, aisle: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Zone Reference</label>
                  <input className="input-field" type="text" value={editLocationForm.zone} onChange={(e) => setEditLocationForm(f => ({ ...f, zone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity (cm³)</label>
                  <input className="input-field" type="number" value={editLocationForm.capacityCubicCm} onChange={(e) => setEditLocationForm(f => ({ ...f, capacityCubicCm: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="input-field" type="text" value={editLocationForm.notes} onChange={(e) => setEditLocationForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditingLocation(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveEditLocation}>💾 Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Area Modal */}
      {showAreaForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAreaForm(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">➕ Create Area</h2>
              <button className="modal-close" onClick={() => setShowAreaForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateArea}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="input-field" type="text" required value={areaForm.name} onChange={(e) => setAreaForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" required value={areaForm.code} onChange={(e) => setAreaForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input className="input-field" type="text" value={areaForm.description} onChange={(e) => setAreaForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAreaForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Area</button>
              </div>
            </form>
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
                  <label className="form-label">Rotation Angle (°)</label>
                  <input className="input-field" type="number" step="0.1" min="0" max="360" value={shelfForm.rotationAngle} onChange={(e) => setShelfForm(f => ({ ...f, rotationAngle: e.target.value }))} />
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
