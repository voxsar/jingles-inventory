import { useEffect, useRef, useState, useCallback, useDebugValue } from 'react';
import { floorsApi, racksApi, shelvesApi, boxesApi } from '../api/client';
import { IFloor, IRack, IShelf, IStorageBox } from '@jingles/shared';

// ── Grid helper ─────────────────────────────────────────────────────────────
const GRID = 0.5; // metres per grid cell

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

// ── Colour helpers ──────────────────────────────────────────────────────────
const BOX_COLOURS  = ['#E8A838', '#D4943F', '#F0C060', '#C68A2A', '#DCA030'];
const FLOOR_COLOUR = '#B8D4A8';
const GRID_COLOUR  = '#8EBE7E';

// ── A-Frame lazy loader ─────────────────────────────────────────────────────
let aframeLoaded = false;
function ensureAframe(): Promise<void> {
  if (aframeLoaded) return Promise.resolve();
  return import('aframe').then(() => { aframeLoaded = true; });
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ShelfBoard({ w, d, y }: { w: number; d: number; y: number }) {
  return (
    <a-box
      position={`0 ${y} 0`}
      width={String(w)}
      height="0.03"
      depth={String(d)}
      color="#8B7355"
      roughness="0.9"
    />
  );
}

function Post({ cx, cz, h }: { cx: number; cz: number; h: number }) {
  return (
    <a-box
      position={`${cx} ${h / 2} ${cz}`}
      width="0.04"
      height={String(h)}
      depth="0.04"
      color="#6B6B6B"
    />
  );
}

/** Render a Rack with its shelves and boxes */
function RackEntity({
  rack,
  shelves,
  shelfBoxes,
  isSelected,
  posX,
  posZ,
  rotY,
}: {
  rack: IRack;
  shelves: IShelf[];
  shelfBoxes: Record<string, IStorageBox[]>;
  isSelected: boolean;
  posX: number;
  posZ: number;
  rotY: number;
}) {
  // Use rack dimensions if available, else derive from shelves
  const w = Math.max((rack.widthCm || 100) / 100, 0.4);
  const h = Math.max((rack.heightCm || 200) / 100, 0.5);
  const d = Math.max((rack.depthCm || 60) / 100, 0.3);
  const hw = w / 2 - 0.02;
  const hd = d / 2 - 0.02;

  const levels = shelves.length > 0 ? shelves.length + 1 : Math.max(2, Math.floor(h / 0.5));
  const levelH = h / levels;
  const shelfBoardYs = Array.from({ length: levels + 1 }, (_, i) => i * levelH);

  const highlightColour = isSelected ? '#FFD700' : 'transparent';

  // Collect all boxes across shelves
  const allBoxes: Array<{ box: IStorageBox; shelfIdx: number; boxIdx: number }> = [];
  shelves.forEach((shelf, si) => {
    (shelfBoxes[shelf.id] ?? []).forEach((box, bi) => {
      allBoxes.push({ box, shelfIdx: si, boxIdx: bi });
    });
  });

  return (
    <a-entity
      position={`${posX} 0 ${posZ}`}
      rotation={`0 ${rotY} 0`}
      data-rack-id={rack.id}
    >
      {/* Corner posts */}
      <Post cx={-hw} cz={-hd} h={h} />
      <Post cx={ hw} cz={-hd} h={h} />
      <Post cx={-hw} cz={ hd} h={h} />
      <Post cx={ hw} cz={ hd} h={h} />

      {/* Shelf boards */}
      {shelfBoardYs.map((y, i) => (
        <ShelfBoard key={i} w={w} d={d} y={y} />
      ))}

      {/* Back brace */}
      <a-box
        position={`0 ${h - 0.02} ${-hd}`}
        width={String(w)}
        height="0.04"
        depth="0.04"
        color="#6B6B6B"
      />

      {/* Selection highlight */}
      <a-box
        position={`0 ${h / 2} 0`}
        width={String(w + 0.06)}
        height={String(h + 0.06)}
        depth={String(d + 0.06)}
        color={highlightColour}
        opacity={isSelected ? '0.25' : '0.0'}
        transparent="true"
        side="double"
      />

      {/* Shelf indicators */}
      {shelves.map((shelf, si) => shelf.hasFreezer ? (
        <a-text key={`f${si}`} value="❄" position={`${-w / 2 + 0.05} ${(si + 1) * levelH + 0.1} 0`} color="#00BFFF" scale="0.4 0.4 0.4" align="left" />
      ) : null)}

      {/* Name label */}
      <a-text
        value={rack.name}
        position={`0 ${h + 0.15} 0`}
        align="center"
        color="#FFFFFF"
        scale="0.4 0.4 0.4"
        width="3"
      />

      {/* Boxes on shelves */}
      {allBoxes.map(({ box, shelfIdx, boxIdx }) => {
        const levelY = (shelfIdx + 0.5) * levelH;
        const bw = Math.max((box.width  || 30) / 100, 0.08);
        const bh = Math.max((box.height || 30) / 100, 0.08);
        const bd = Math.max((box.length || 30) / 100, 0.08);
        const boxesInShelf = (shelfBoxes[shelves[shelfIdx]?.id ?? ''] ?? []).length;
        const offsetX = (boxIdx - boxesInShelf / 2 + 0.5) * (bw + 0.02);
        const baseY   = (shelfIdx * levelH) + 0.03 + bh / 2;
        const stackY  = baseY + (box.stackOrder ?? 0) * bh;
        const colour  = BOX_COLOURS[boxIdx % BOX_COLOURS.length];
        return (
          <a-box
            key={box.id}
            position={`${box.posX ?? offsetX} ${box.posY ?? stackY} ${box.posZ ?? 0}`}
            rotation={`0 ${box.rotationAngle ?? 0} 0`}
            width={String(bw)}
            height={String(bh)}
            depth={String(bd)}
            color={colour}
            roughness="0.7"
          >
            <a-text value={box.name.slice(0, 6)} position="0 0 0.08" align="center" color="#333" scale="0.15 0.15 0.15" width="4" />
          </a-box>
        );
      })}
    </a-entity>
  );
}

/** Floor-level box (sitting directly on floor) */
function FloorBox({ box, index }: { box: IStorageBox; index: number }) {
  const bw = Math.max((box.width  || 40) / 100, 0.1);
  const bh = Math.max((box.height || 40) / 100, 0.1);
  const bd = Math.max((box.length || 40) / 100, 0.1);
  const posX = box.posX ?? snap(index * (bw + 0.1));
  const posY = box.posY ?? (bh / 2 + (box.stackOrder ?? 0) * bh);
  const posZ = box.posZ ?? 0;
  return (
    <a-box
      position={`${posX} ${posY} ${posZ}`}
      rotation={`0 ${box.rotationAngle ?? 0} 0`}
      width={String(bw)}
      height={String(bh)}
      depth={String(bd)}
      color="#C47A3A"
      roughness="0.8"
    >
      <a-text value={box.name.slice(0, 8)} position="0 0 0.06" align="center" color="#222" scale="0.2 0.2 0.2" width="3" />
    </a-box>
  );
}

/** Grid overlay */
function GridPlane({ size, gridSize }: { size: number; gridSize: number }) {
  const half = size / 2;
  const count = Math.floor(size / gridSize);
  const lines: JSX.Element[] = [];
  for (let i = -count / 2; i <= count / 2; i++) {
    const pos = i * gridSize;
    lines.push(
      <a-box key={`x${i}`} position={`0 0.002 ${pos}`} width={String(size)} height="0.003" depth="0.01" color={GRID_COLOUR} opacity="0.5" transparent="true" />,
      <a-box key={`z${i}`} position={`${pos} 0.002 0`} width="0.01" height="0.003" depth={String(size)} color={GRID_COLOUR} opacity="0.5" transparent="true" />
    );
  }
  return <a-entity>{lines}</a-entity>;
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function WarehouseVisualizerPage() {
  const [floors,       setFloors]       = useState<IFloor[]>([]);
  const [selectedFloor,setSelectedFloor]= useState<string>('');
  const [racks,        setRacks]        = useState<IRack[]>([]);
  const [rackShelves,  setRackShelves]  = useState<Record<string, IShelf[]>>({});
  const [shelfBoxes,   setShelfBoxes]   = useState<Record<string, IStorageBox[]>>({});
  const [floorBoxes,   setFloorBoxes]   = useState<IStorageBox[]>([]); // boxes directly on floor

  // rackPos mirrors the server's posX/posZ/rotY but is kept locally for instant response
  const [rackPos,      setRackPos]      = useState<Record<string, { x: number; z: number; rotY: number }>>({});
  const [selectedRack, setSelectedRack] = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);

  // Camera state: focal target in world space, distance (orbit radius), azimuth, elevation
  const [camTarget,  setCamTarget]  = useState<{ x: number; z: number }>({ x: 0, z: 0 });
  const [camDist,    setCamDist]    = useState(12);
  const [camAz,      setCamAz]      = useState(30);   // degrees around Y
  const [camEl,      setCamEl]      = useState(45);   // degrees up from horizon

  const [aframeReady,  setAframeReady]  = useState(false);

  // ── Derived camera position ───────────────────────────────────────────────
  const azRad = (camAz * Math.PI) / 180;
  const elRad = (camEl * Math.PI) / 180;
  const camX  = camTarget.x + camDist * Math.sin(azRad) * Math.cos(elRad);
  const camY  = camDist * Math.sin(elRad);
  const camZ  = camTarget.z + camDist * Math.cos(azRad) * Math.cos(elRad);
  const camPosStr = `${camX.toFixed(2)} ${camY.toFixed(2)} ${camZ.toFixed(2)}`;
  // Look-at target
  const camRotX = -Math.atan2(camY - 0, camDist * Math.cos(elRad)) * (180 / Math.PI);
  const camRotY = camAz;
  const camRotStr = `${camRotX.toFixed(1)} ${camRotY.toFixed(1)} 0`;

  // ── Load floors ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    floorsApi.list()
      .then(res => {
        const list: IFloor[] = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
        setFloors(list);
        if (list.length > 0) setSelectedFloor(list[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Load racks + floor boxes when floor changes ───────────────────────────
  useEffect(() => {
    if (!selectedFloor) return;
    setRacks([]);
    setRackShelves({});
    setShelfBoxes({});
    setFloorBoxes([]);
    setSelectedRack(null);
    Promise.all([
      racksApi.list({ floorId: selectedFloor }),
      boxesApi.list({ floorId: selectedFloor }),
    ]).then(([racksRes, fbRes]) => {
      const rackList: IRack[] = racksRes.data?.data?.items ?? racksRes.data?.data ?? racksRes.data ?? [];
      const fbList: IStorageBox[] = fbRes.data?.data?.items ?? fbRes.data?.data ?? fbRes.data ?? [];
      setRacks(rackList);
      setFloorBoxes(fbList.filter((b: IStorageBox) => !b.shelfId));
      // Initialise rackPos from DB values
      const pos: Record<string, { x: number; z: number; rotY: number }> = {};
      rackList.forEach((r, i) => {
        pos[r.id] = {
          x: r.posX ?? snap((i % 5) * 3),
          z: r.posZ ?? snap(Math.floor(i / 5) * 3),
          rotY: r.rotY ?? 0,
        };
      });
      setRackPos(pos);
    });
  }, [selectedFloor]);

  // ── Load shelves for each rack ────────────────────────────────────────────
  useEffect(() => {
    if (racks.length === 0) return;
    Promise.all(
      racks.map(rack =>
        shelvesApi.list({ rackId: rack.id })
          .then(res => {
            const list: IShelf[] = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
            return { rackId: rack.id, shelves: list };
          })
          .catch(() => ({ rackId: rack.id, shelves: [] as IShelf[] }))
      )
    ).then(results => {
      const next: Record<string, IShelf[]> = {};
      results.forEach(r => { next[r.rackId] = r.shelves; });
      setRackShelves(next);
    });
  }, [racks]);

  // ── Load boxes for each shelf ─────────────────────────────────────────────
  useEffect(() => {
    const allShelves = Object.values(rackShelves).flat();
    if (allShelves.length === 0) return;
    Promise.all(
      allShelves.map(s =>
        boxesApi.list({ shelfId: s.id })
          .then(res => {
            const list: IStorageBox[] = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
            return { shelfId: s.id, boxes: list };
          })
          .catch(() => ({ shelfId: s.id, boxes: [] as IStorageBox[] }))
      )
    ).then(results => {
      const next: Record<string, IStorageBox[]> = {};
      results.forEach(r => { next[r.shelfId] = r.boxes; });
      setShelfBoxes(next);
    });
  }, [rackShelves]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Rack movement
      if (selectedRack && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','Escape'].includes(e.code)) {
        e.preventDefault();
        setRackPos(prev => {
          const p = prev[selectedRack];
          if (!p) return prev;
          let { x, z, rotY } = p;
          if (e.code === 'ArrowUp')    z = snap(z - GRID);
          if (e.code === 'ArrowDown')  z = snap(z + GRID);
          if (e.code === 'ArrowLeft')  x = snap(x - GRID);
          if (e.code === 'ArrowRight') x = snap(x + GRID);
          if (e.code === 'KeyQ')       rotY = (rotY - 45 + 360) % 360;
          if (e.code === 'KeyE')       rotY = (rotY + 45) % 360;
          if (e.code === 'Escape')     { setSelectedRack(null); return prev; }
          const next = { ...prev, [selectedRack]: { x, z, rotY } };
          // Debounce-save to DB
          racksApi.savePosition(selectedRack, { posX: x, posZ: z, rotY }).catch(() => {});
          return next;
        });
      }
      // Camera orbit with IJKL (no interference with WASD which A-Frame might use)
      if (['KeyI','KeyK','KeyJ','KeyL','Equal','Minus'].includes(e.code) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const step = 5;
        if (e.code === 'KeyI') setCamEl(v => Math.min(89, v + step));
        if (e.code === 'KeyK') setCamEl(v => Math.max(5, v - step));
        if (e.code === 'KeyJ') setCamAz(v => (v - step + 360) % 360);
        if (e.code === 'KeyL') setCamAz(v => (v + step) % 360);
        if (e.code === 'Equal') setCamDist(v => Math.max(1, v - 1));
        if (e.code === 'Minus') setCamDist(v => Math.min(50, v + 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRack]);

  // ── Mouse drag for orbit ──────────────────────────────────────────────────
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; mode: 'orbit'|'pan' }>({ active: false, lastX: 0, lastY: 0, mode: 'orbit' });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onMouseDown(e: MouseEvent) {
      dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, mode: e.button === 2 || e.altKey ? 'pan' : 'orbit' };
      e.preventDefault();
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      if (dragRef.current.mode === 'orbit') {
        setCamAz(v => (v + dx * 0.4 + 360) % 360);
        setCamEl(v => Math.max(5, Math.min(89, v - dy * 0.3)));
      } else {
        // Pan: move target in the camera's horizontal plane
        const azRad2 = (camAz * Math.PI) / 180;
        const rightX = Math.cos(azRad2);
        const rightZ = -Math.sin(azRad2);
        const fwdX = -Math.sin(azRad2) * Math.cos((camEl * Math.PI) / 180);
        const fwdZ = -Math.cos(azRad2) * Math.cos((camEl * Math.PI) / 180);
        const speed = camDist * 0.003;
        setCamTarget(v => ({
          x: v.x - dx * rightX * speed + dy * fwdX * speed,
          z: v.z - dx * rightZ * speed + dy * fwdZ * speed,
        }));
      }
    }
    function onMouseUp() { dragRef.current.active = false; }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setCamDist(v => Math.max(1, Math.min(80, v + e.deltaY * 0.02)));
    }
    function onContextMenu(e: Event) { e.preventDefault(); }

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [camAz, camEl, camDist]);

  // ── Click → select rack ───────────────────────────────────────────────────
  const sceneRef = useRef<HTMLElement & EventTarget>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    function handler(e: Event) {
      const ce = e as CustomEvent;
      const el = ce.detail?.intersection?.object?.el as HTMLElement | undefined;
      if (!el) { setSelectedRack(null); return; }
      let node: HTMLElement | null = el;
      while (node) {
        const id = node.getAttribute('data-rack-id');
        if (id) { setSelectedRack(id); return; }
        node = node.parentElement;
      }
      setSelectedRack(null);
    }
    scene.addEventListener('click', handler);
    return () => scene.removeEventListener('click', handler);
  }, [aframeReady]);

  // ── Move rack helper (saves to DB) ────────────────────────────────────────
  const moveRack = useCallback((dx: number, dz: number) => {
    if (!selectedRack) return;
    setRackPos(prev => {
      const p = prev[selectedRack];
      if (!p) return prev;
      const nx = snap(p.x + dx), nz = snap(p.z + dz);
      const next = { ...prev, [selectedRack]: { ...p, x: nx, z: nz } };
      racksApi.savePosition(selectedRack, { posX: nx, posZ: nz, rotY: p.rotY }).catch(() => {});
      return next;
    });
  }, [selectedRack]);

  const rotateRack = useCallback((delta: number) => {
    if (!selectedRack) return;
    setRackPos(prev => {
      const p = prev[selectedRack];
      if (!p) return prev;
      const rotY = (p.rotY + delta + 360) % 360;
      const next = { ...prev, [selectedRack]: { ...p, rotY } };
      racksApi.savePosition(selectedRack, { posX: p.x, posZ: p.z, rotY }).catch(() => {});
      return next;
    });
  }, [selectedRack]);

  // ── Focus on selected rack (zoom in) ─────────────────────────────────────
  const focusOnRack = useCallback((rackId: string) => {
    const p = rackPos[rackId];
    if (!p) return;
    setCamTarget({ x: p.x, z: p.z });
    setCamDist(4);
    setCamEl(30);
  }, [rackPos]);

  // ── Floor size ────────────────────────────────────────────────────────────
  const FLOOR_SIZE = 30;
  const currentFloor = floors.find(f => f.id === selectedFloor);

  // ── A-Frame ready ─────────────────────────────────────────────────────────
  useEffect(() => {
    ensureAframe().then(() => { setTimeout(() => setAframeReady(true), 50); });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-500">Loading warehouse data…</div>;
  }
  if (floors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
        <p className="text-xl">No storage zones found.</p>
        <p>Create branches and storage zones in <strong>Branches & Storage</strong> first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 text-white text-sm flex-shrink-0 flex-wrap">
        <label className="font-semibold text-gray-300">Zone:</label>
        <select
          value={selectedFloor}
          onChange={e => setSelectedFloor(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
        >
          {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>

        <span className="text-gray-500">|</span>

        {/* Camera controls */}
        <label className="font-semibold text-gray-300 text-xs">Zoom:</label>
        <input type="range" min={1} max={80} value={camDist} onChange={e => setCamDist(Number(e.target.value))} className="w-20" />
        <span className="text-gray-400 text-xs">{camDist.toFixed(0)}m</span>

        <span className="text-gray-500">|</span>

        <label className="font-semibold text-gray-300 text-xs">Elevation:</label>
        <input type="range" min={5} max={89} value={camEl} onChange={e => setCamEl(Number(e.target.value))} className="w-16" />

        <span className="text-gray-500">|</span>

        {/* Rack controls */}
        {selectedRack ? (
          <>
            <span className="text-yellow-400 font-semibold">
              🗂 {racks.find(r => r.id === selectedRack)?.name ?? '—'}
            </span>
            <span className="text-gray-400 text-xs">(Arrows move · Q/E rotate · Esc deselect)</span>
            <div className="flex gap-1">
              <button onClick={() => moveRack(0, -GRID)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">▲</button>
              <button onClick={() => moveRack(0,  GRID)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">▼</button>
              <button onClick={() => moveRack(-GRID, 0)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">◄</button>
              <button onClick={() => moveRack( GRID, 0)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">►</button>
              <button onClick={() => rotateRack(-45)}    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↺</button>
              <button onClick={() => rotateRack( 45)}    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↻</button>
              <button onClick={() => focusOnRack(selectedRack)} className="px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs">🔍 Focus</button>
              <button onClick={() => setSelectedRack(null)} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs">✕</button>
            </div>
          </>
        ) : (
          <span className="text-gray-400 text-xs italic">
            Drag to orbit · Right-drag / Alt-drag to pan · Scroll to zoom · Click rack to select
          </span>
        )}

        {/* Reset view */}
        <button
          onClick={() => { setCamTarget({ x: 0, z: 0 }); setCamDist(12); setCamEl(45); setCamAz(30); }}
          className="ml-auto px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
        >
          Reset view
        </button>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1 bg-gray-800 text-xs text-gray-300 flex-shrink-0 flex-wrap">
        <span><span style={{ color: '#6B8E6B' }}>■</span> Floor</span>
        <span><span style={{ color: '#6B6B6B' }}>■</span> Rack frame</span>
        <span><span style={{ color: '#8B7355' }}>■</span> Shelf level</span>
        <span><span style={{ color: '#E8A838' }}>■</span> Box (on shelf)</span>
        <span><span style={{ color: '#C47A3A' }}>■</span> Box (on floor)</span>
        <span><span style={{ color: '#FFD700' }}>■</span> Selected rack</span>
        <span className="text-gray-500">Grid: {GRID * 100} cm | All dims metric</span>
        <span className="text-gray-500">Positions saved to DB</span>
      </div>

      {/* ── 3-D scene ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 relative select-none"
        style={{ minHeight: 0, cursor: 'grab' }}
      >
        {aframeReady && (
          <a-scene
            ref={sceneRef as any}
            embedded
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            renderer="antialias: true; colorManagement: true;"
            vr-mode-ui="enabled: false"
            background="color: #1a1a2e"
          >
            <a-light type="ambient"     color="#ffffff" intensity="0.5" />
            <a-light type="directional" color="#ffffff" intensity="0.8" position="5 10 5" />
            <a-light type="hemisphere"  color="#87CEEB" ground-color="#B8D4A8" intensity="0.3" />

            {/* Static camera – we control position via state */}
            <a-camera
              position={camPosStr}
              look-controls="enabled: false"
              wasd-controls="enabled: false"
              fov="60"
            >
              <a-cursor
                color="#FFD700"
                opacity="0.8"
                scale="0.5 0.5 0.5"
                raycaster="objects: [data-rack-id]"
              />
            </a-camera>

            {/* Manually point camera toward target */}
            <a-entity
              position={camPosStr}
              rotation={camRotStr}
            />

            <a-sky color="#1a1a2e" />

            {/* Floor */}
            <a-plane
              position={`${camTarget.x} 0 ${camTarget.z}`}
              rotation="-90 0 0"
              width={String(FLOOR_SIZE)}
              height={String(FLOOR_SIZE)}
              color={FLOOR_COLOUR}
              roughness="0.9"
            />

            {/* Grid */}
            <GridPlane size={FLOOR_SIZE} gridSize={GRID} />

            {/* Floor label */}
            {currentFloor && (
              <a-text
                value={`Zone: ${currentFloor.name}`}
                position={`${-FLOOR_SIZE / 2 + 1} 0.05 ${-FLOOR_SIZE / 2 + 1}`}
                rotation="-90 0 0"
                color="#333"
                scale="0.6 0.6 0.6"
                align="left"
              />
            )}

            {/* Racks */}
            {racks.map(rack => {
              const pos = rackPos[rack.id] ?? { x: 0, z: 0, rotY: 0 };
              return (
                <RackEntity
                  key={rack.id}
                  rack={rack}
                  shelves={rackShelves[rack.id] ?? []}
                  shelfBoxes={shelfBoxes}
                  isSelected={selectedRack === rack.id}
                  posX={pos.x}
                  posZ={pos.z}
                  rotY={pos.rotY}
                />
              );
            })}

            {/* Floor-level boxes */}
            {floorBoxes.map((box, i) => (
              <FloorBox key={box.id} box={box} index={i} />
            ))}
          </a-scene>
        )}

        {!aframeReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
            Initialising 3D engine…
          </div>
        )}
      </div>

      {/* ── Rack panel ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900 text-white border-t border-gray-700 overflow-x-auto" style={{ maxHeight: '120px' }}>
        <div className="flex gap-2 px-4 py-2">
          {racks.length === 0 && (
            <span className="text-gray-500 text-sm italic">No racks on this zone. Add racks in Branches & Storage.</span>
          )}
          {racks.map(rack => {
            const pos    = rackPos[rack.id] ?? { x: 0, z: 0, rotY: 0 };
            const shCount = (rackShelves[rack.id] ?? []).length;
            const isSel  = selectedRack === rack.id;
            return (
              <button
                key={rack.id}
                onClick={() => { setSelectedRack(isSel ? null : rack.id); if (!isSel) focusOnRack(rack.id); }}
                className={`flex flex-col items-start px-3 py-2 rounded text-xs border transition-colors flex-shrink-0 ${
                  isSel ? 'border-yellow-400 bg-yellow-900/40 text-yellow-300' : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="font-semibold">🗂 {rack.name}</span>
                <span className="text-gray-400">{shCount} shelf level{shCount !== 1 ? 's' : ''}</span>
                <span className="text-gray-500">({pos.x.toFixed(1)}, {pos.z.toFixed(1)}) {pos.rotY}°</span>
                {rack.widthCm && <span className="text-gray-500">{rack.widthCm}×{rack.heightCm}×{rack.depthCm} cm</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
