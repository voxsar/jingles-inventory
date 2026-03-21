import { useEffect, useState } from 'react';
import { locationsApi, areasApi, shelvesApi, boxesApi } from '../api/client';
import DataTable from '../components/DataTable';

type View = 'locations' | 'areas' | 'shelves' | 'boxes';

const defaultLocationForm = { floor: '', section: '', shelf: '', zone: '', capacityCubicCm: '', notes: '' };
const defaultAreaForm = { name: '', code: '', description: '' };
const defaultShelfForm = { name: '', code: '', height: '', width: '', length: '', rotationAngle: '0' };
const defaultBoxForm = { name: '', code: '', height: '', width: '', length: '' };
const defaultBarcodeForm = { barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' };

export default function LocationsPage() {
// ── Data ─────────────────────────────────────────────────
const [locations, setLocations] = useState<any[]>([]);
const [areas, setAreas] = useState<any[]>([]);
const [shelves, setShelves] = useState<any[]>([]);
const [boxes, setBoxes] = useState<any[]>([]);

// ── Navigation breadcrumb ─────────────────────────────────
const [view, setView] = useState<View>('locations');
const [selectedLocation, setSelectedLocation] = useState<any>(null);
const [selectedArea, setSelectedArea] = useState<any>(null);
const [selectedShelf, setSelectedShelf] = useState<any>(null);

const [isLoading, setIsLoading] = useState(true);

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
await locationsApi.create({ ...locationForm, capacityCubicCm: locationForm.capacityCubicCm ? parseFloat(locationForm.capacityCubicCm) : null });
setShowLocationForm(false);
setLocationForm(defaultLocationForm);
await loadLocations();
} catch (err: any) {
alert(err.response?.data?.error ?? 'Failed to create location');
}
};

const openEditLocation = (loc: any) => {
setEditingLocation(loc);
setEditLocationForm({
floor: loc.floor ?? '',
section: loc.section ?? '',
shelf: loc.shelf ?? '',
zone: loc.zone ?? '',
capacityCubicCm: loc.capacityCubicCm != null ? String(loc.capacityCubicCm) : '',
notes: loc.notes ?? '',
});
};

const handleSaveEditLocation = async () => {
if (!editingLocation) return;
try {
await locationsApi.update(editingLocation.id, {
...editLocationForm,
capacityCubicCm: editLocationForm.capacityCubicCm ? parseFloat(editLocationForm.capacityCubicCm) : null,
});
setEditingLocation(null);
await loadLocations();
} catch (err: any) {
alert(err.response?.data?.error ?? 'Failed to update location');
}
};

const handleDeleteLocation = async (loc: any) => {
const locLabel = [loc.floor, loc.section, loc.shelf, loc.zone].filter(Boolean).join('-');
if (!confirm(`Delete location "${locLabel}"? Inventory records at this location will have their location cleared. History will be preserved.`)) return;
try {
await locationsApi.delete(loc.id);
await loadLocations();
} catch (err: any) {
alert(err.response?.data?.error ?? 'Failed to delete location');
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

// ── Columns ───────────────────────────────────────────────
const locationColumns = [
{ key: 'floor', header: 'Floor', sortable: true },
{ key: 'section', header: 'Section', sortable: true },
{ key: 'shelf', header: 'Shelf Ref', sortable: true },
{ key: 'zone', header: 'Zone', render: (r: any) => r.zone ?? '—' },
{ key: 'capacityCubicCm', header: 'Capacity (cm³)', render: (r: any) => r.capacityCubicCm?.toLocaleString() ?? '—' },
{ key: 'notes', header: 'Notes', render: (r: any) => r.notes ?? '—' },
{ key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
{
key: 'actions', header: 'Actions',
render: (r: any) => (
<div className="flex gap-1 flex-wrap">
<button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToAreas(r); }}>Areas →</button>
<button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditLocation(r); }}>Edit</button>
{r.isActive && (
<button className="btn-sm text-red-600" onClick={(e: any) => { e.stopPropagation(); handleDeleteLocation(r); }}>Delete</button>
)}
</div>
),
},
];

const areaColumns = [
{ key: 'name', header: 'Name', sortable: true },
{ key: 'code', header: 'Code', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.code}</span>, sortable: true },
{ key: 'description', header: 'Description', render: (r: any) => r.description ?? '—' },
{ key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
{
key: 'actions', header: 'Actions',
render: (r: any) => (
<div className="flex gap-2">
<button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToShelves(r); }}>Shelves →</button>
<button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToBoxesFromArea(r); }}>Boxes →</button>
</div>
),
},
];

const shelfColumns = [
{ key: 'name', header: 'Name', sortable: true },
{ key: 'code', header: 'Code', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.code}</span>, sortable: true },
{ key: 'height', header: 'Height (cm)', render: (r: any) => r.height },
{ key: 'width', header: 'Width (cm)', render: (r: any) => r.width },
{ key: 'length', header: 'Length (cm)', render: (r: any) => r.length },
{ key: 'rotationAngle', header: 'Rotation (°)', render: (r: any) => r.rotationAngle },
{ key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
{
key: 'actions', header: 'Boxes',
render: (r: any) => (
<button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); drillToBoxes(r); }}>
View Boxes →
</button>
),
},
];

const boxColumns = [
{ key: 'name', header: 'Name', sortable: true },
{ key: 'code', header: 'Code', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.code}</span>, sortable: true },
{ key: 'height', header: 'H (cm)', render: (r: any) => r.height },
{ key: 'width', header: 'W (cm)', render: (r: any) => r.width },
{ key: 'length', header: 'L (cm)', render: (r: any) => r.length },
{
key: 'barcodes', header: 'Barcodes',
render: (r: any) => (
<div className="flex flex-wrap gap-1">
{(r.barcodes ?? []).map((barcode: any) => (
<span key={barcode.id} className="badge" title={barcode.barcodeType}>
{barcode.barcode}{barcode.isDefault ? ' ★' : ''}
</span>
))}
{(r.barcodes ?? []).length === 0 && <span className="text-gray-400 text-xs">—</span>}
</div>
),
},
{ key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
{
key: 'actions', header: 'Actions',
render: (r: any) => (
<button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); setSelectedBox(r); setShowBarcodeForm(true); }}>
+ Barcode
</button>
),
},
];

// ── Breadcrumb ────────────────────────────────────────────
const renderBreadcrumb = () => (
<div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
<button className={view === 'locations' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer'} onClick={() => { setView('locations'); loadLocations(); }}>
📍 Locations
</button>
{selectedLocation && (
<>
<span>/</span>
<button className={view === 'areas' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer'} onClick={() => { setView('areas'); loadAreas(selectedLocation.id); }}>
🗺️ {selectedLocation.floor}/{selectedLocation.section}
</button>
</>
)}
{selectedArea && (view === 'shelves' || view === 'boxes') && (
<>
<span>/</span>
<button className={view === 'shelves' ? 'font-semibold text-gray-900' : 'hover:underline cursor-pointer'} onClick={() => { setView('shelves'); loadShelves(selectedArea.id); }}>
🗂️ {selectedArea.name}
</button>
</>
)}
{selectedShelf && view === 'boxes' && (
<>
<span>/</span>
<span className="font-semibold text-gray-900">📦 {selectedShelf.name}</span>
</>
)}
{!selectedShelf && view === 'boxes' && (
<>
<span>/</span>
<span className="font-semibold text-gray-900">📦 Boxes</span>
</>
)}
</div>
);

// ── Render ────────────────────────────────────────────────
return (
<div className="flex flex-col gap-4">
{/* Page header */}
<div className="page-header">
<div className="page-header-left">
<h1 className="page-title">📍 Locations</h1>
<p className="page-subtitle">Manage warehouse locations, areas, shelves and boxes</p>
</div>
<div className="flex gap-2">
{view !== 'locations' && (
<button className="btn-secondary" onClick={goBack}>← Back</button>
)}
{view === 'locations' && <button className="btn-primary" onClick={() => setShowLocationForm(true)}>+ New Location</button>}
{view === 'areas' && <button className="btn-primary" onClick={() => setShowAreaForm(true)}>+ New Area</button>}
{view === 'shelves' && <button className="btn-primary" onClick={() => setShowShelfForm(true)}>+ New Shelf</button>}
{view === 'boxes' && <button className="btn-primary" onClick={() => setShowBoxForm(true)}>+ New Box</button>}
</div>
</div>

{/* Breadcrumb */}
<div className="px-1">{renderBreadcrumb()}</div>

{/* Table section */}
<div className="content-section">
{view === 'locations' && <DataTable columns={locationColumns} data={locations} isLoading={isLoading} emptyMessage="No locations found" />}
{view === 'areas' && <DataTable columns={areaColumns} data={areas} isLoading={isLoading} emptyMessage="No areas found in this location" />}
{view === 'shelves' && <DataTable columns={shelfColumns} data={shelves} isLoading={isLoading} emptyMessage="No shelves found in this area" />}
{view === 'boxes' && <DataTable columns={boxColumns} data={boxes} isLoading={isLoading} emptyMessage="No boxes found" />}
</div>

{/* Create Location Modal */}
{showLocationForm && (
<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowLocationForm(false)}>
<div className="modal-panel-md">
<div className="modal-header">
<h2 className="modal-title">➕ Create Location</h2>
<button className="modal-close" onClick={() => setShowLocationForm(false)}>✕</button>
</div>
<form onSubmit={handleCreateLocation}>
<div className="modal-body form-stack">
<div className="form-grid-2">
{(['floor', 'section', 'shelf', 'zone'] as const).map(field => (
<div key={field} className="form-group">
<label className="form-label">
{field.charAt(0).toUpperCase() + field.slice(1)} {['floor', 'section', 'shelf'].includes(field) ? '*' : ''}
</label>
<input className="input-field" type="text" value={locationForm[field]} required={['floor', 'section', 'shelf'].includes(field)} onChange={(e) => setLocationForm(f => ({ ...f, [field]: e.target.value }))} />
</div>
))}
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
<button type="submit" className="btn-primary">Create Location</button>
</div>
</form>
</div>
</div>
)}

{/* Edit Location Modal */}
{editingLocation && (
<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingLocation(null)}>
<div className="modal-panel-md">
<div className="modal-header">
<h2 className="modal-title">✏️ Edit Location</h2>
<button className="modal-close" onClick={() => setEditingLocation(null)}>✕</button>
</div>
<div className="modal-body form-stack">
<div className="form-grid-2">
{(['floor', 'section', 'shelf', 'zone'] as const).map(field => (
<div key={field} className="form-group">
<label className="form-label">
{field.charAt(0).toUpperCase() + field.slice(1)}
{['floor', 'section', 'shelf'].includes(field) ? ' *' : ''}
</label>
<input
className="input-field"
type="text"
value={editLocationForm[field]}
required={['floor', 'section', 'shelf'].includes(field)}
onChange={(e) => setEditLocationForm(f => ({ ...f, [field]: e.target.value }))}
/>
</div>
))}
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
<h2 className="modal-title">➕ Create Box</h2>
<button className="modal-close" onClick={() => setShowBoxForm(false)}>✕</button>
</div>
<form onSubmit={handleCreateBox}>
<div className="modal-body form-stack">
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
{selectedShelf && (
<p className="text-sm text-gray-500">This box will be placed on shelf: <strong>{selectedShelf.name}</strong></p>
)}
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
<h2 className="modal-title">🏷️ Add Barcode to {selectedBox.name}</h2>
<button className="modal-close" onClick={() => setShowBarcodeForm(false)}>✕</button>
</div>
{/* Existing barcodes */}
{(selectedBox.barcodes ?? []).length > 0 && (
<div className="px-6 pt-4">
<p className="text-sm font-medium text-gray-700 mb-2">Existing Barcodes</p>
<div className="flex flex-col gap-1">
{(selectedBox.barcodes ?? []).map((barcode: any) => (
<div key={barcode.id} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded-md">
<span><span className="font-mono">{barcode.barcode}</span> <span className="text-gray-400 text-xs">({barcode.barcodeType})</span>{barcode.isDefault ? ' ★' : ''}</span>
<button className="btn-sm text-red-600" onClick={() => handleDeleteBarcode(selectedBox.id, barcode.id)}>Remove</button>
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
