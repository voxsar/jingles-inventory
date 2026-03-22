import { useEffect, useState } from 'react';
import { branchesApi, floorsApi, racksApi, shelvesApi, boxesApi, inventoryApi } from '../api/client';
import DataTable from '../components/DataTable';

// ── Form defaults ─────────────────────────────────────────────────────────────
const defaultBranchForm = { name: '', code: '', address: '', phone: '', email: '', isDefault: false };
const defaultFloorForm  = { name: '', code: '', notes: '' };
const defaultRackForm   = { name: '', code: '', widthCm: '', heightCm: '', depthCm: '', notes: '' };
const defaultShelfForm  = { name: '', code: '', height: '', width: '', length: '', hasFreezer: false, hasLock: false, notes: '' };
const defaultBoxForm    = { name: '', code: '', height: '', width: '', length: '' };

type View = 'branches' | 'floors' | 'floor-detail' | 'rack-detail' | 'shelf-detail';

export default function BranchesPage() {
  // ── Navigation state ────────────────────────────────────────────────────────
  const [view,           setView]           = useState<View>('branches');
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [selectedFloor,  setSelectedFloor]  = useState<any>(null);
  const [selectedRack,   setSelectedRack]   = useState<any>(null);
  const [selectedShelf,  setSelectedShelf]  = useState<any>(null);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [branches,  setBranches]  = useState<any[]>([]);
  const [floors,    setFloors]    = useState<any[]>([]);
  const [racks,     setRacks]     = useState<any[]>([]);
  const [shelves,   setShelves]   = useState<any[]>([]);
  const [floorBoxes, setFloorBoxes] = useState<any[]>([]); // boxes directly on floor
  const [boxes,     setBoxes]     = useState<any[]>([]);
  const [shelfInventory, setShelfInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch,   setEditingBranch]   = useState<any>(null);
  const [branchForm,      setBranchForm]      = useState(defaultBranchForm);

  const [showFloorModal, setShowFloorModal] = useState(false);
  const [editingFloor,   setEditingFloor]   = useState<any>(null);
  const [floorForm,      setFloorForm]      = useState(defaultFloorForm);

  const [showRackModal, setShowRackModal] = useState(false);
  const [editingRack,   setEditingRack]   = useState<any>(null);
  const [rackForm,      setRackForm]      = useState(defaultRackForm);

  const [showShelfModal, setShowShelfModal] = useState(false);
  const [editingShelf,   setEditingShelf]   = useState<any>(null);
  const [shelfForm,      setShelfForm]      = useState(defaultShelfForm);

  const [showBoxModal, setShowBoxModal] = useState(false);
  const [editingBox,   setEditingBox]   = useState<any>(null);
  const [boxForm,      setBoxForm]      = useState(defaultBoxForm);
  // context for box: where it belongs (floorId for floor-level, shelfId for shelf-level)
  const [boxContext, setBoxContext] = useState<{ floorId?: string; shelfId?: string }>({});

  // ── Load helpers ─────────────────────────────────────────────────────────────
  const loadBranches = async () => {
    setIsLoading(true);
    try {
      const res = await branchesApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setBranches(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  const loadFloors = async (branchId: string) => {
    setIsLoading(true);
    try {
      const res = await floorsApi.list({ branchId });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setFloors(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  const loadRacks = async (floorId: string) => {
    setIsLoading(true);
    try {
      const [racksRes, floorBoxesRes] = await Promise.all([
        racksApi.list({ floorId }),
        boxesApi.list({ floorId }),
      ]);
      const rData = racksRes.data?.data?.items ?? racksRes.data?.data ?? racksRes.data ?? [];
      const bData = floorBoxesRes.data?.data?.items ?? floorBoxesRes.data?.data ?? floorBoxesRes.data ?? [];
      setRacks(Array.isArray(rData) ? rData : []);
      setFloorBoxes(Array.isArray(bData) ? bData.filter((b: any) => !b.shelfId) : []);
    } finally { setIsLoading(false); }
  };

  const loadShelves = async (rackId: string) => {
    setIsLoading(true);
    try {
      const res = await shelvesApi.list({ rackId });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setShelves(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  const loadBoxes = async (shelfId: string) => {
    setIsLoading(true);
    try {
      const [boxRes, invRes] = await Promise.all([
        boxesApi.list({ shelfId }),
        inventoryApi.list({ shelfId, pageSize: '200' }),
      ]);
      const bData = boxRes.data?.data?.items ?? boxRes.data?.data ?? boxRes.data ?? [];
      const iData = invRes.data?.data?.items ?? invRes.data?.data ?? invRes.data ?? [];
      setBoxes(Array.isArray(bData) ? bData : []);
      setShelfInventory(Array.isArray(iData) ? iData : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { loadBranches(); }, []);

  // ── Navigation helpers ───────────────────────────────────────────────────────
  const drillToBranch = (branch: any) => {
    setSelectedBranch(branch);
    setView('floors');
    loadFloors(branch.id);
  };

  const drillToFloor = (floor: any) => {
    setSelectedFloor(floor);
    setView('floor-detail');
    loadRacks(floor.id);
  };

  const drillToRack = (rack: any) => {
    setSelectedRack(rack);
    setView('rack-detail');
    loadShelves(rack.id);
  };

  const drillToShelf = (shelf: any) => {
    setSelectedShelf(shelf);
    setView('shelf-detail');
    loadBoxes(shelf.id);
  };

  const goBack = () => {
    if (view === 'shelf-detail') { setView('rack-detail'); setSelectedShelf(null); }
    else if (view === 'rack-detail') { setView('floor-detail'); setSelectedRack(null); }
    else if (view === 'floor-detail') { setView('floors'); setSelectedFloor(null); }
    else if (view === 'floors') { setView('branches'); setSelectedBranch(null); }
  };

  // ── Branch CRUD ──────────────────────────────────────────────────────────────
  const openCreateBranch = () => { setEditingBranch(null); setBranchForm(defaultBranchForm); setShowBranchModal(true); };
  const openEditBranch = (b: any) => {
    setEditingBranch(b);
    setBranchForm({ name: b.name, code: b.code, address: b.address ?? '', phone: b.phone ?? '', email: b.email ?? '', isDefault: b.isDefault });
    setShowBranchModal(true);
  };
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...branchForm, address: branchForm.address || undefined, phone: branchForm.phone || undefined, email: branchForm.email || undefined };
    try {
      if (editingBranch) await branchesApi.update(editingBranch.id, payload);
      else await branchesApi.create(payload);
      setShowBranchModal(false); setEditingBranch(null); setBranchForm(defaultBranchForm);
      await loadBranches();
    } catch (err: any) { alert(err.response?.data?.error ?? 'Failed to save branch'); }
  };
  const handleToggleBranch = async (b: any) => {
    try { await branchesApi.update(b.id, { isActive: !b.isActive }); await loadBranches(); }
    catch (err: any) { alert(err.response?.data?.error ?? 'Failed'); }
  };

  // ── Floor CRUD ───────────────────────────────────────────────────────────────
  const openCreateFloor = () => { setEditingFloor(null); setFloorForm(defaultFloorForm); setShowFloorModal(true); };
  const openEditFloor = (f: any) => { setEditingFloor(f); setFloorForm({ name: f.name, code: f.code, notes: f.notes ?? '' }); setShowFloorModal(true); };
  const handleSaveFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingFloor) await floorsApi.update(editingFloor.id, floorForm);
      else await floorsApi.create({ ...floorForm, branchId: selectedBranch.id, code: floorForm.code.toUpperCase() });
      setShowFloorModal(false); setEditingFloor(null); setFloorForm(defaultFloorForm);
      await loadFloors(selectedBranch.id);
    } catch (err: any) { alert(err.response?.data?.error ?? 'Failed to save storage zone'); }
  };
  const handleDeleteFloor = async (f: any) => {
    if (!confirm(`Delete storage zone "${f.name}"?`)) return;
    try { await floorsApi.delete(f.id); await loadFloors(selectedBranch.id); }
    catch (err: any) { alert(err.response?.data?.error ?? 'Failed'); }
  };

  // ── Rack CRUD ────────────────────────────────────────────────────────────────
  const openCreateRack = () => { setEditingRack(null); setRackForm(defaultRackForm); setShowRackModal(true); };
  const openEditRack = (r: any) => {
    setEditingRack(r);
    setRackForm({ name: r.name, code: r.code, widthCm: r.widthCm ?? '', heightCm: r.heightCm ?? '', depthCm: r.depthCm ?? '', notes: r.notes ?? '' });
    setShowRackModal(true);
  };
  const handleSaveRack = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: rackForm.name, code: rackForm.code.toUpperCase(),
      widthCm: rackForm.widthCm ? parseFloat(rackForm.widthCm) : undefined,
      heightCm: rackForm.heightCm ? parseFloat(rackForm.heightCm) : undefined,
      depthCm: rackForm.depthCm ? parseFloat(rackForm.depthCm) : undefined,
      notes: rackForm.notes || undefined,
    };
    try {
      if (editingRack) await racksApi.update(editingRack.id, payload);
      else await racksApi.create({ ...payload, floorId: selectedFloor.id });
      setShowRackModal(false); setEditingRack(null); setRackForm(defaultRackForm);
      await loadRacks(selectedFloor.id);
    } catch (err: any) { alert(err.response?.data?.error ?? 'Failed to save rack'); }
  };
  const handleDeleteRack = async (r: any) => {
    if (!confirm(`Delete rack "${r.name}"?`)) return;
    try { await racksApi.delete(r.id); await loadRacks(selectedFloor.id); }
    catch (err: any) { alert(err.response?.data?.error ?? 'Failed'); }
  };

  // ── Shelf CRUD ───────────────────────────────────────────────────────────────
  const openCreateShelf = (rackId?: string) => { setEditingShelf(null); setShelfForm({ ...defaultShelfForm, ...({} as any) }); setShowShelfModal(true); };
  const openEditShelf = (s: any) => {
    setEditingShelf(s);
    setShelfForm({ name: s.name, code: s.code, height: s.height, width: s.width, length: s.length, hasFreezer: s.hasFreezer, hasLock: s.hasLock, notes: s.notes ?? '' });
    setShowShelfModal(true);
  };
  const handleSaveShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: shelfForm.name, code: shelfForm.code.toUpperCase(),
      height: parseFloat(shelfForm.height), width: parseFloat(shelfForm.width), length: parseFloat(shelfForm.length),
      hasFreezer: shelfForm.hasFreezer, hasLock: shelfForm.hasLock,
      notes: shelfForm.notes || undefined,
    };
    try {
      if (editingShelf) await shelvesApi.update(editingShelf.id, payload);
      else await shelvesApi.create({ ...payload, floorId: selectedFloor?.id ?? selectedRack?.floorId, rackId: selectedRack?.id ?? undefined });
      setShowShelfModal(false); setEditingShelf(null); setShelfForm(defaultShelfForm);
      if (selectedRack) await loadShelves(selectedRack.id);
    } catch (err: any) { alert(err.response?.data?.error ?? 'Failed to save shelf'); }
  };

  // ── Box CRUD ─────────────────────────────────────────────────────────────────
  const openCreateBox = (ctx: { floorId?: string; shelfId?: string }) => {
    setBoxContext(ctx); setEditingBox(null); setBoxForm(defaultBoxForm); setShowBoxModal(true);
  };
  const openEditBox = (b: any) => {
    setEditingBox(b);
    setBoxForm({ name: b.name, code: b.code, height: b.height, width: b.width, length: b.length });
    setShowBoxModal(true);
  };
  const handleSaveBox = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: boxForm.name, code: boxForm.code.toUpperCase(),
      height: parseFloat(boxForm.height), width: parseFloat(boxForm.width), length: parseFloat(boxForm.length),
    };
    try {
      if (editingBox) await boxesApi.update(editingBox.id, payload);
      else await boxesApi.create({ ...payload, ...boxContext });
      setShowBoxModal(false); setEditingBox(null); setBoxForm(defaultBoxForm);
      if (boxContext.shelfId) await loadBoxes(boxContext.shelfId);
      else if (boxContext.floorId) await loadRacks(boxContext.floorId);
    } catch (err: any) { alert(err.response?.data?.error ?? 'Failed to save box'); }
  };

  // ── Breadcrumb ───────────────────────────────────────────────────────────────
  const Breadcrumb = () => (
    <div className="flex items-center gap-1 text-sm text-gray-500 flex-wrap">
      <button className="hover:text-primary-600" onClick={() => { setView('branches'); setSelectedBranch(null); setSelectedFloor(null); setSelectedRack(null); setSelectedShelf(null); }}>
        🏢 Branches
      </button>
      {selectedBranch && (<>
        <span>/</span>
        <button className="hover:text-primary-600" onClick={() => { setView('floors'); setSelectedFloor(null); setSelectedRack(null); setSelectedShelf(null); loadFloors(selectedBranch.id); }}>
          {selectedBranch.name}
        </button>
      </>)}
      {selectedFloor && (<>
        <span>/</span>
        <button className="hover:text-primary-600" onClick={() => { setView('floor-detail'); setSelectedRack(null); setSelectedShelf(null); loadRacks(selectedFloor.id); }}>
          📦 {selectedFloor.name}
        </button>
      </>)}
      {selectedRack && (<>
        <span>/</span>
        <button className="hover:text-primary-600" onClick={() => { setView('rack-detail'); setSelectedShelf(null); loadShelves(selectedRack.id); }}>
          🗂 {selectedRack.name}
        </button>
      </>)}
      {selectedShelf && (<>
        <span>/</span>
        <span className="text-gray-800 font-medium">🗄 {selectedShelf.name}</span>
      </>)}
    </div>
  );

  // ── Render helpers ────────────────────────────────────────────────────────────
  const DimBadge = ({ cm }: { cm?: number | null }) =>
    cm ? <span className="text-xs text-gray-500">{cm} cm</span> : null;

  const renderDims = (r: any) => (
    <span className="text-xs text-gray-500">
      {[r.widthCm ?? r.width, r.heightCm ?? r.height, r.depthCm ?? r.length].filter(Boolean).map((v: any) => `${v} cm`).join(' × ') || '—'}
    </span>
  );

  // ── Branch columns ────────────────────────────────────────────────────────────
  const branchColumns = [
    {
      key: 'name', header: 'Branch', sortable: true,
      render: (r: any) => (
        <div>
          <div className="font-medium">{r.name}</div>
          {r.isDefault && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Default</span>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</span> },
    { key: 'address', header: 'Address', render: (r: any) => r.address ?? '—' },
    { key: 'phone', header: 'Phone', render: (r: any) => r.phone ?? '—' },
    { key: 'isActive', header: 'Status', render: (r: any) => r.isActive ? '✅ Active' : '❌ Inactive' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-1 flex-wrap">
          <button className="btn-sm bg-primary-50 text-primary-700 hover:bg-primary-100" onClick={(e: any) => { e.stopPropagation(); drillToBranch(r); }}>Storage Zones →</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditBranch(r); }}>Edit</button>
          <button className="btn-sm text-red-600" onClick={(e: any) => { e.stopPropagation(); handleToggleBranch(r); }}>{r.isActive ? 'Disable' : 'Enable'}</button>
        </div>
      ),
    },
  ];

  // ── Floor columns ─────────────────────────────────────────────────────────────
  const floorColumns = [
    {
      key: 'name', header: 'Storage Zone', sortable: true,
      render: (r: any) => <div><span className="text-lg mr-1">🏠</span><span className="font-medium">{r.name}</span></div>,
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</span> },
    { key: 'notes', header: 'Notes', render: (r: any) => r.notes ?? '—' },
    { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-1 flex-wrap">
          <button className="btn-sm bg-primary-50 text-primary-700" onClick={(e: any) => { e.stopPropagation(); drillToFloor(r); }}>Racks & Boxes →</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditFloor(r); }}>Edit</button>
          {r.isActive && <button className="btn-sm text-red-600" onClick={(e: any) => { e.stopPropagation(); handleDeleteFloor(r); }}>Delete</button>}
        </div>
      ),
    },
  ];

  // ── Rack columns ──────────────────────────────────────────────────────────────
  const rackColumns = [
    {
      key: 'name', header: 'Rack', sortable: true,
      render: (r: any) => <div><span className="text-lg mr-1">🗂</span><span className="font-medium">{r.name}</span></div>,
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</span> },
    {
      key: 'dims', header: 'Dimensions (W×H×D)',
      render: (r: any) => (
        <span className="text-xs text-gray-600">
          {r.widthCm || r.heightCm || r.depthCm
            ? `${r.widthCm ?? '—'} × ${r.heightCm ?? '—'} × ${r.depthCm ?? '—'} cm`
            : '—'}
        </span>
      ),
    },
    {
      key: 'pos', header: '3D Position',
      render: (r: any) => r.posX != null
        ? <span className="text-xs text-gray-500">({r.posX.toFixed(1)}, {(r.posZ ?? 0).toFixed(1)}) rot {r.rotY ?? 0}°</span>
        : <span className="text-xs text-gray-400">—</span>,
    },
    { key: 'shelves', header: 'Shelves', render: (r: any) => <span className="text-xs">{r.shelves?.length ?? 0} shelf levels</span> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-1">
          <button className="btn-sm bg-primary-50 text-primary-700" onClick={(e: any) => { e.stopPropagation(); drillToRack(r); }}>Shelves →</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditRack(r); }}>Edit</button>
          <button className="btn-sm text-red-600" onClick={(e: any) => { e.stopPropagation(); handleDeleteRack(r); }}>Delete</button>
        </div>
      ),
    },
  ];

  // ── Shelf columns ─────────────────────────────────────────────────────────────
  const shelfColumns = [
    {
      key: 'name', header: 'Shelf Level', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <span>🗄</span><span className="font-medium">{r.name}</span>
          {r.hasFreezer && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">❄️</span>}
          {r.hasLock    && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">🔒</span>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</span> },
    {
      key: 'dims', header: 'Dimensions (H×W×L cm)',
      render: (r: any) => <span className="text-xs text-gray-600">{r.height} × {r.width} × {r.length}</span>,
    },
    { key: 'boxes', header: 'Boxes', render: (r: any) => `${r.boxes?.length ?? 0}` },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex gap-1">
          <button className="btn-sm bg-primary-50 text-primary-700" onClick={(e: any) => { e.stopPropagation(); drillToShelf(r); }}>Boxes →</button>
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditShelf(r); }}>Edit</button>
        </div>
      ),
    },
  ];

  // ── Box columns ────────────────────────────────────────────────────────────────
  const boxColumns = [
    {
      key: 'name', header: 'Box', sortable: true,
      render: (b: any) => (
        <div>
          <span className="font-medium">📦 {b.name}</span>
          {b.stackOrder != null && b.stackOrder > 0 && <span className="text-xs text-gray-500 ml-1">stack #{b.stackOrder}</span>}
          {b.parentBoxId && <span className="text-xs text-gray-400 ml-1">(stacked)</span>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (b: any) => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{b.code}</span> },
    {
      key: 'dims', header: 'Dimensions (H×W×L cm)',
      render: (b: any) => <span className="text-xs text-gray-600">{b.height} × {b.width} × {b.length}</span>,
    },
    {
      key: 'pos', header: 'Position',
      render: (b: any) => b.posX != null
        ? <span className="text-xs text-gray-500">({b.posX?.toFixed(1)}, {b.posY?.toFixed(1)}, {b.posZ?.toFixed(1)})</span>
        : <span className="text-xs text-gray-400">—</span>,
    },
    { key: 'isActive', header: 'Active', render: (b: any) => b.isActive ? '✅' : '❌' },
    {
      key: 'actions', header: '',
      render: (b: any) => (
        <div className="flex gap-1">
          <button className="btn-sm" onClick={(e: any) => { e.stopPropagation(); openEditBox(b); }}>Edit</button>
        </div>
      ),
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">🏢 Branches & Storage</h1>
          <Breadcrumb />
        </div>
        <div className="flex gap-2">
          {view !== 'branches' && (
            <button className="btn-secondary" onClick={goBack}>← Back</button>
          )}
          {view === 'branches' && (
            <button className="btn-primary" onClick={openCreateBranch}>+ New Branch</button>
          )}
          {view === 'floors' && (
            <button className="btn-primary" onClick={openCreateFloor}>+ New Storage Zone</button>
          )}
          {view === 'floor-detail' && (
            <>
              <button className="btn-primary" onClick={openCreateRack}>+ New Rack</button>
              <button className="btn-secondary" onClick={() => openCreateBox({ floorId: selectedFloor?.id })}>+ Box on Floor</button>
            </>
          )}
          {view === 'rack-detail' && (
            <>
              <button className="btn-primary" onClick={() => openCreateShelf()}>+ New Shelf Level</button>
            </>
          )}
          {view === 'shelf-detail' && (
            <button className="btn-primary" onClick={() => openCreateBox({ shelfId: selectedShelf?.id })}>+ New Box</button>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="content-section">
        {view === 'branches' && (
          <DataTable columns={branchColumns} data={branches} isLoading={isLoading} emptyMessage="No branches found" />
        )}

        {view === 'floors' && (
          <>
            <p className="text-sm text-gray-500 mb-3">Storage zones are physical areas within <strong>{selectedBranch?.name}</strong> (floors, zones, sections).</p>
            <DataTable columns={floorColumns} data={floors} isLoading={isLoading} emptyMessage="No storage zones yet. Create one to start." />
          </>
        )}

        {view === 'floor-detail' && (
          <div className="flex flex-col gap-6">
            {/* Racks */}
            <div>
              <h2 className="text-base font-semibold text-gray-700 mb-2">🗂 Racks on this floor</h2>
              <p className="text-xs text-gray-500 mb-2">Racks are physical shelving units. Dimensions are in centimetres (metric). Their 3D positions are editable in the Warehouse 3D view.</p>
              <DataTable columns={rackColumns} data={racks} isLoading={isLoading} emptyMessage="No racks yet." />
            </div>

            {/* Floor-level boxes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold text-gray-700">📦 Boxes directly on floor</h2>
              </div>
              <p className="text-xs text-gray-500 mb-2">Boxes placed directly on the floor (not inside a rack or shelf). Stackable.</p>
              {floorBoxes.length === 0 && !isLoading
                ? <p className="text-sm text-gray-400 italic">No floor-level boxes yet.</p>
                : (
                  <div className="flex flex-wrap gap-2">
                    {floorBoxes.map((b: any) => (
                      <div key={b.id} className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 flex flex-col gap-0.5">
                        <span className="font-semibold">📦 {b.name}</span>
                        <span className="text-gray-500">{b.code}</span>
                        <span className="text-gray-500">{b.height} × {b.width} × {b.length} cm</span>
                        {b.stackOrder != null && b.stackOrder > 0 && <span className="text-gray-400">stack #{b.stackOrder}</span>}
                        <button className="btn-sm mt-1 self-start" onClick={() => openEditBox(b)}>Edit</button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        )}

        {view === 'rack-detail' && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Shelf levels inside rack <strong>{selectedRack?.name}</strong>.
              Each shelf is a horizontal level with its own dimensions (height = clearance, width/length = usable area). All in cm.
            </p>
            <DataTable columns={shelfColumns} data={shelves} isLoading={isLoading} emptyMessage="No shelf levels yet." />
          </div>
        )}

        {view === 'shelf-detail' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-base font-semibold text-gray-700 mb-2">📦 Boxes on this shelf</h2>
              <p className="text-xs text-gray-500 mb-2">Boxes can be stacked. Dimensions in cm. Position in the 3D view is saved to the database when you move them.</p>
              <DataTable columns={boxColumns} data={boxes} isLoading={isLoading} emptyMessage="No boxes yet." />
            </div>
            {shelfInventory.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-gray-700 mb-2">📋 Inventory on this shelf ({shelfInventory.length})</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-gray-700 border-collapse">
                    <thead><tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">State</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                    </tr></thead>
                    <tbody>
                      {shelfInventory.map((inv: any) => (
                        <tr key={inv.id} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">{inv.sku?.name ?? inv.skuId}</td>
                          <td className="px-3 py-1.5">{inv.state}</td>
                          <td className="px-3 py-1.5 text-right">{inv.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Branch Modal ────────────────────────────────────────────────── */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBranchModal(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingBranch ? '✏️ Edit Branch' : '➕ New Branch'}</h2>
              <button className="modal-close" onClick={() => setShowBranchModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveBranch}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="input-field" type="text" value={branchForm.name} required placeholder="e.g. Main Branch" onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" value={branchForm.code} required placeholder="e.g. MAIN" onChange={e => setBranchForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="input-field" type="text" value={branchForm.address} onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="input-field" type="tel" value={branchForm.phone} onChange={e => setBranchForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="input-field" type="email" value={branchForm.email} onChange={e => setBranchForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={branchForm.isDefault} onChange={e => setBranchForm(f => ({ ...f, isDefault: e.target.checked }))} />
                  Set as Default Branch
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowBranchModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingBranch ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Floor Modal ─────────────────────────────────────────────────── */}
      {showFloorModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowFloorModal(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingFloor ? '✏️ Edit Storage Zone' : '➕ New Storage Zone'}</h2>
              <button className="modal-close" onClick={() => setShowFloorModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveFloor}>
              <div className="modal-body form-stack">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Zone Name *</label>
                    <input className="input-field" type="text" value={floorForm.name} required placeholder="e.g. Ground Floor" onChange={e => setFloorForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" value={floorForm.code} required placeholder="e.g. GF" onChange={e => setFloorForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input-field" type="text" value={floorForm.notes} onChange={e => setFloorForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowFloorModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingFloor ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Rack Modal ──────────────────────────────────────────────────── */}
      {showRackModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowRackModal(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingRack ? '✏️ Edit Rack' : '➕ New Rack'}</h2>
              <button className="modal-close" onClick={() => setShowRackModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveRack}>
              <div className="modal-body form-stack">
                <p className="text-xs text-gray-500">All dimensions in centimetres (metric). Used for accurate 3D visualisation.</p>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Rack Name *</label>
                    <input className="input-field" type="text" value={rackForm.name} required placeholder="e.g. Rack A1" onChange={e => setRackForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" value={rackForm.code} required placeholder="e.g. A1" onChange={e => setRackForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Width (cm)</label>
                    <input className="input-field" type="number" step="0.1" min="0" value={rackForm.widthCm} placeholder="e.g. 100" onChange={e => setRackForm(f => ({ ...f, widthCm: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Height (cm)</label>
                    <input className="input-field" type="number" step="0.1" min="0" value={rackForm.heightCm} placeholder="e.g. 200" onChange={e => setRackForm(f => ({ ...f, heightCm: e.target.value }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Depth (cm)</label>
                    <input className="input-field" type="number" step="0.1" min="0" value={rackForm.depthCm} placeholder="e.g. 60" onChange={e => setRackForm(f => ({ ...f, depthCm: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input-field" type="text" value={rackForm.notes} onChange={e => setRackForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowRackModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingRack ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Shelf Modal ─────────────────────────────────────────────────── */}
      {showShelfModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowShelfModal(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingShelf ? '✏️ Edit Shelf Level' : '➕ New Shelf Level'}</h2>
              <button className="modal-close" onClick={() => setShowShelfModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveShelf}>
              <div className="modal-body form-stack">
                <p className="text-xs text-gray-500">All dimensions in centimetres (metric). Height = clearance; Width/Length = usable area.</p>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Shelf Name *</label>
                    <input className="input-field" type="text" value={shelfForm.name} required placeholder="e.g. Level 1" onChange={e => setShelfForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" value={shelfForm.code} required placeholder="e.g. L1" onChange={e => setShelfForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Clearance Height (cm) *</label>
                    <input className="input-field" type="number" step="0.1" min="0.1" value={shelfForm.height} required placeholder="e.g. 40" onChange={e => setShelfForm(f => ({ ...f, height: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Width (cm) *</label>
                    <input className="input-field" type="number" step="0.1" min="0.1" value={shelfForm.width} required placeholder="e.g. 100" onChange={e => setShelfForm(f => ({ ...f, width: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Depth/Length (cm) *</label>
                  <input className="input-field" type="number" step="0.1" min="0.1" value={shelfForm.length} required placeholder="e.g. 60" onChange={e => setShelfForm(f => ({ ...f, length: e.target.value }))} />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={shelfForm.hasFreezer} onChange={e => setShelfForm(f => ({ ...f, hasFreezer: e.target.checked }))} />
                    ❄️ Has Freezer
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={shelfForm.hasLock} onChange={e => setShelfForm(f => ({ ...f, hasLock: e.target.checked }))} />
                    🔒 Has Lock
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input-field" type="text" value={shelfForm.notes} onChange={e => setShelfForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowShelfModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingShelf ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Box Modal ────────────────────────────────────────────────────── */}
      {showBoxModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBoxModal(false)}>
          <div className="modal-panel-md">
            <div className="modal-header">
              <h2 className="modal-title">{editingBox ? '✏️ Edit Box' : '➕ New Box'}</h2>
              <button className="modal-close" onClick={() => setShowBoxModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveBox}>
              <div className="modal-body form-stack">
                <p className="text-xs text-gray-500">All dimensions in centimetres (metric). Boxes can be stacked in the 3D view — drag to position and stack.</p>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Box Name *</label>
                    <input className="input-field" type="text" value={boxForm.name} required placeholder="e.g. Box 001" onChange={e => setBoxForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code *</label>
                    <input className="input-field" type="text" value={boxForm.code} required placeholder="e.g. B001" onChange={e => setBoxForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Height (cm) *</label>
                    <input className="input-field" type="number" step="0.1" min="0.1" value={boxForm.height} required placeholder="e.g. 30" onChange={e => setBoxForm(f => ({ ...f, height: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Width (cm) *</label>
                    <input className="input-field" type="number" step="0.1" min="0.1" value={boxForm.width} required placeholder="e.g. 40" onChange={e => setBoxForm(f => ({ ...f, width: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Length/Depth (cm) *</label>
                  <input className="input-field" type="number" step="0.1" min="0.1" value={boxForm.length} required placeholder="e.g. 50" onChange={e => setBoxForm(f => ({ ...f, length: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowBoxModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingBox ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
