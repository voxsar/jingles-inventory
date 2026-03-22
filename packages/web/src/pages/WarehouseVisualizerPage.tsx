import { useEffect, useRef, useState, useCallback } from 'react';
import { floorsApi, shelvesApi, boxesApi } from '../api/client';
import { IFloor, IShelf, IStorageBox } from '@jingles/shared';

// ── Position persistence ────────────────────────────────────────────────────
const RACK_POSITIONS_KEY = 'warehouse3d_rack_positions';

interface RackPos { x: number; z: number; rotY: number }

type RackPosMap = Record<string, RackPos>;

const GRID = 0.5; // metres per grid cell

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}
function saveJSON(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ── Colour helpers ──────────────────────────────────────────────────────────
const BOX_COLOURS  = ['#E8A838', '#D4943F', '#F0C060', '#C68A2A', '#DCA030'];
const FLOOR_COLOUR = '#B8D4A8';
const GRID_COLOUR  = '#8EBE7E';

// ── A-Frame scene wrapper ───────────────────────────────────────────────────
// We lazily import aframe so it registers its custom elements before React renders.
let aframeLoaded = false;

function ensureAframe(): Promise<void> {
  if (aframeLoaded) return Promise.resolve();
  return import('aframe').then(() => { aframeLoaded = true; });
}

// ── Sub-components (pure strings / A-Frame JSX) ─────────────────────────────

/** One shelf "board" inside a rack at a given height */
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

/** Thin vertical post at corner (cx, cz) up to height h */
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

/** Full rack entity – 4 posts + N shelf boards + back brace */
function Rack({
  shelf,
  boxes,
  isSelected,
  posX,
  posZ,
  rotY,
}: {
  shelf: IShelf;
  boxes: IStorageBox[];
  isSelected: boolean;
  posX: number;
  posZ: number;
  rotY: number;
}) {
  // Convert cm → metres (clamp to sensible mins)
  const w  = Math.max((shelf.width  || 100) / 100, 0.4);
  const h  = Math.max((shelf.height || 200) / 100, 0.5);
  const d  = Math.max((shelf.length ||  60) / 100, 0.3);
  const hw = w / 2 - 0.02;
  const hd = d / 2 - 0.02;

  const levels = Math.max(2, Math.floor(h / 0.5));
  const levelH = h / levels;

  const shelfBoards = Array.from({ length: levels + 1 }, (_, i) => i * levelH);

  // Distribute boxes across levels
  const boxesPerLevel = Math.ceil(boxes.length / levels) || 1;

  const highlightColour = isSelected ? '#FFD700' : 'transparent';

  return (
    <a-entity
      position={`${posX} 0 ${posZ}`}
      rotation={`0 ${rotY} 0`}
      data-rack-id={shelf.id}
    >
      {/* Corner posts */}
      <Post cx={-hw} cz={-hd} h={h} />
      <Post cx={ hw} cz={-hd} h={h} />
      <Post cx={-hw} cz={ hd} h={h} />
      <Post cx={ hw} cz={ hd} h={h} />

      {/* Shelf boards */}
      {shelfBoards.map((y, i) => (
        <ShelfBoard key={i} w={w} d={d} y={y} />
      ))}

      {/* Back brace (top) */}
      <a-box
        position={`0 ${h - 0.02} ${-hd}`}
        width={String(w)}
        height="0.04"
        depth="0.04"
        color="#6B6B6B"
      />

      {/* Selection highlight frame */}
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

      {/* Freezer indicator */}
      {shelf.hasFreezer && (
        <a-text
          value="❄"
          position={`${-w / 2 + 0.05} ${h + 0.1} 0`}
          color="#00BFFF"
          scale="0.5 0.5 0.5"
          align="left"
        />
      )}

      {/* Lock indicator */}
      {shelf.hasLock && (
        <a-text
          value="🔒"
          position={`${w / 2 - 0.05} ${h + 0.1} 0`}
          color="#FFD700"
          scale="0.5 0.5 0.5"
          align="right"
        />
      )}

      {/* Name label */}
      <a-text
        value={shelf.name}
        position={`0 ${h + 0.15} 0`}
        align="center"
        color="#FFFFFF"
        scale="0.4 0.4 0.4"
        width="3"
      />

      {/* Boxes on shelves */}
      {boxes.map((box, idx) => {
        const level   = Math.floor(idx / boxesPerLevel);
        const col     = idx % boxesPerLevel;
        const bw      = Math.max((box.width  || 30) / 100, 0.1);
        const bh      = Math.max((box.height || 30) / 100, 0.1);
        const bd      = Math.max((box.length || 30) / 100, 0.1);
        const baseY   = level * levelH + 0.03 + bh / 2;
        const offsetX = (col - boxesPerLevel / 2 + 0.5) * (bw + 0.02);
        const colour  = BOX_COLOURS[idx % BOX_COLOURS.length];
        return (
          <a-box
            key={box.id}
            position={`${offsetX} ${baseY} 0`}
            width={String(bw)}
            height={String(bh)}
            depth={String(bd)}
            color={colour}
            roughness="0.7"
          >
            <a-text
              value={box.name.slice(0, 6)}
              position="0 0 0.08"
              align="center"
              color="#333"
              scale="0.15 0.15 0.15"
              width="4"
            />
          </a-box>
        );
      })}
    </a-entity>
  );
}

/** Floor-level stacked box */
function FloorBox({ posX, posZ, stackLevel, label }: {
  posX: number;
  posZ: number;
  stackLevel: number;
  label: string;
}) {
  const bh  = 0.35;
  const posY = stackLevel * bh + bh / 2;
  return (
    <a-box
      position={`${posX} ${posY} ${posZ}`}
      width="0.4"
      height={String(bh)}
      depth="0.4"
      color={BOX_COLOURS[stackLevel % BOX_COLOURS.length]}
      roughness="0.7"
    >
      <a-text
        value={label.slice(0, 5)}
        position="0 0 0.21"
        align="center"
        color="#222"
        scale="0.2 0.2 0.2"
        width="3"
      />
    </a-box>
  );
}

/** Grid overlay (lines drawn as thin boxes) */
function GridPlane({ size, gridSize }: { size: number; gridSize: number }) {
  const lines: JSX.Element[] = [];
  const half = size / 2;
  const steps = Math.floor(size / gridSize);
  for (let i = 0; i <= steps; i++) {
    const pos = -half + i * gridSize;
    // X-parallel line
    lines.push(
      <a-box
        key={`x${i}`}
        position={`0 0.002 ${pos}`}
        width={String(size)}
        height="0.003"
        depth="0.01"
        color={GRID_COLOUR}
        opacity="0.5"
        transparent="true"
      />
    );
    // Z-parallel line
    lines.push(
      <a-box
        key={`z${i}`}
        position={`${pos} 0.002 0`}
        width="0.01"
        height="0.003"
        depth={String(size)}
        color={GRID_COLOUR}
        opacity="0.5"
        transparent="true"
      />
    );
  }
  return <a-entity>{lines}</a-entity>;
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function WarehouseVisualizerPage() {
  const [floors,        setFloors]        = useState<IFloor[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [shelves,       setShelves]       = useState<IShelf[]>([]);
  const [shelfBoxes,    setShelfBoxes]    = useState<Record<string, IStorageBox[]>>({});
  const [rackPos,       setRackPos]       = useState<RackPosMap>(loadJSON(RACK_POSITIONS_KEY, {}));
  const [selectedRack,  setSelectedRack]  = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [cameraHeight,  setCameraHeight]  = useState(10);

  // ── Load floors ──────────────────────────────────────────────────────────
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

  // ── Load shelves when floor changes ─────────────────────────────────────
  useEffect(() => {
    if (!selectedFloor) return;
    setShelves([]);
    setShelfBoxes({});
    shelvesApi.list({ floorId: selectedFloor })
      .then(res => {
        const list: IShelf[] = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
        setShelves(list);
      });
  }, [selectedFloor]);

  // ── Load boxes for each shelf ────────────────────────────────────────────
  useEffect(() => {
    if (shelves.length === 0) return;
    shelves.forEach(s => {
      boxesApi.list({ shelfId: s.id })
        .then(res => {
          const list: IStorageBox[] = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
          setShelfBoxes(prev => ({ ...prev, [s.id]: list }));
        });
    });
  }, [shelves]);

  // ── Auto-place new shelves (racks) on the grid ───────────────────────────
  useEffect(() => {
    setRackPos(prev => {
      const next = { ...prev };
      let changed = false;
      shelves.forEach((s, i) => {
        if (!next[s.id]) {
          next[s.id] = {
            x: snap((i % 5) * 3),
            z: snap(Math.floor(i / 5) * 3),
            rotY: 0,
          };
          changed = true;
        }
      });
      if (changed) saveJSON(RACK_POSITIONS_KEY, next);
      return changed ? next : prev;
    });
  }, [shelves]);

  // ── Keyboard handler for selected rack ──────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedRack) return;
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','Escape'].includes(e.code)) return;
      e.preventDefault();
      setRackPos(prev => {
        const p = prev[selectedRack];
        if (!p) return prev;
        let { x, z, rotY } = p;
        const step = GRID;
        if (e.code === 'ArrowUp')    z = snap(z - step);
        if (e.code === 'ArrowDown')  z = snap(z + step);
        if (e.code === 'ArrowLeft')  x = snap(x - step);
        if (e.code === 'ArrowRight') x = snap(x + step);
        if (e.code === 'KeyQ')       rotY = (rotY - 45 + 360) % 360;
        if (e.code === 'KeyE')       rotY = (rotY + 45) % 360;
        if (e.code === 'Escape')     { setSelectedRack(null); return prev; }
        const next = { ...prev, [selectedRack]: { x, z, rotY } };
        saveJSON(RACK_POSITIONS_KEY, next);
        return next;
      });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRack]);

  // ── A-Frame click → select rack ─────────────────────────────────────────
  const sceneRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const scene = sceneRef.current as any;
    if (!scene) return;
    function handler(e: CustomEvent) {
      const el = e.detail?.intersection?.object?.el as HTMLElement | undefined;
      if (!el) { setSelectedRack(null); return; }
      // Walk up to find data-rack-id
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
  }, []);

  // ── Move-rack helper ─────────────────────────────────────────────────────
  const moveRack = useCallback((dx: number, dz: number) => {
    if (!selectedRack) return;
    setRackPos(prev => {
      const p = prev[selectedRack];
      if (!p) return prev;
      const next = { ...prev, [selectedRack]: { ...p, x: snap(p.x + dx), z: snap(p.z + dz) } };
      saveJSON(RACK_POSITIONS_KEY, next);
      return next;
    });
  }, [selectedRack]);

  const rotateRack = useCallback((delta: number) => {
    if (!selectedRack) return;
    setRackPos(prev => {
      const p = prev[selectedRack];
      if (!p) return prev;
      const next = { ...prev, [selectedRack]: { ...p, rotY: (p.rotY + delta + 360) % 360 } };
      saveJSON(RACK_POSITIONS_KEY, next);
      return next;
    });
  }, [selectedRack]);

  // ── Derive floor-level box stack positions ───────────────────────────────
  // (real floor items would come from inventoryApi filtered to floorId, no shelfId)
  const floorBoxStack: { id: string; label: string; posX: number; posZ: number; stack: number }[] = [];

  // ── Floor size ────────────────────────────────────────────────────────────
  const FLOOR_SIZE = 20;
  const currentFloor = floors.find(f => f.id === selectedFloor);

  // ── Ensure A-Frame is ready before rendering scene ───────────────────────
  const [aframeReady, setAframeReady] = useState(false);
  useEffect(() => {
    ensureAframe().then(() => {
      // Small delay to let A-Frame register elements
      setTimeout(() => setAframeReady(true), 50);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading warehouse data…
      </div>
    );
  }

  if (floors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
        <p className="text-xl">No floors found.</p>
        <p>Create floors and shelves in <strong>Storage Zones</strong> first.</p>
      </div>
    );
  }

  // ── Camera position string ────────────────────────────────────────────────
  const camPosStr  = `0 ${cameraHeight} ${(cameraHeight * 0.9).toFixed(1)}`;
  const camRotStr  = '-40 0 0';

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 text-white text-sm flex-shrink-0 flex-wrap">
        {/* Floor selector */}
        <label className="font-semibold text-gray-300">Floor:</label>
        <select
          value={selectedFloor}
          onChange={e => setSelectedFloor(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
        >
          {floors.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <span className="text-gray-500">|</span>

        {/* Camera zoom */}
        <label className="font-semibold text-gray-300">Zoom:</label>
        <input
          type="range" min={4} max={30} value={cameraHeight}
          onChange={e => setCameraHeight(Number(e.target.value))}
          className="w-24"
        />

        <span className="text-gray-500">|</span>

        {/* Selected rack controls */}
        {selectedRack ? (
          <>
            <span className="text-yellow-400 font-semibold">
              🏗 Rack: {shelves.find(s => s.id === selectedRack)?.name ?? '—'}
            </span>
            <span className="text-gray-400 text-xs">(Arrow keys to move · Q/E to rotate · Esc to deselect)</span>
            <div className="flex gap-1">
              <button onClick={() => moveRack(0, -GRID)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">▲</button>
              <button onClick={() => moveRack(0,  GRID)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">▼</button>
              <button onClick={() => moveRack(-GRID, 0)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">◄</button>
              <button onClick={() => moveRack( GRID, 0)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">►</button>
              <button onClick={() => rotateRack(-45)}    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↺</button>
              <button onClick={() => rotateRack( 45)}    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↻</button>
            </div>
            <button
              onClick={() => setSelectedRack(null)}
              className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs"
            >Deselect</button>
          </>
        ) : (
          <span className="text-gray-400 text-xs italic">Click a rack to select · Mouse drag to look around · W/A/S/D to pan</span>
        )}

        <span className="ml-auto text-gray-500 text-xs">
          {shelves.length} rack{shelves.length !== 1 ? 's' : ''} on this floor
        </span>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1 bg-gray-800 text-xs text-gray-300 flex-shrink-0">
        <span><span style={{ color: '#4A90D9' }}>■</span> Rack/Shelf</span>
        <span><span style={{ color: '#E8A838' }}>■</span> Storage Box</span>
        <span><span style={{ color: FLOOR_COLOUR }}>■</span> Floor Area</span>
        <span><span style={{ color: '#FFD700' }}>■</span> Selected Rack</span>
        <span className="text-gray-500">Grid: {GRID * 100}cm</span>
      </div>

      {/* ── 3D Scene ─────────────────────────────────────────────────────── */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {aframeReady && (
          <a-scene
            ref={sceneRef as any}
            embedded
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            renderer="antialias: true; colorManagement: true;"
            vr-mode-ui="enabled: false"
            background="color: #1a1a2e"
          >
            {/* ── Lighting ──────────────────────────────────────────────── */}
            <a-light type="ambient"      color="#ffffff" intensity="0.5" />
            <a-light type="directional"  color="#ffffff" intensity="0.8" position="5 10 5" />
            <a-light type="hemisphere"   color="#87CEEB" ground-color="#B8D4A8" intensity="0.3" />

            {/* ── Camera with look + move controls ─────────────────────── */}
            <a-entity
              position={camPosStr}
              rotation={camRotStr}
              camera="fov: 60; near: 0.1; far: 500"
              look-controls="pointerLockEnabled: false; reverseMouseDrag: false"
              wasd-controls="acceleration: 20; fly: false"
            />

            {/* ── Sky ───────────────────────────────────────────────────── */}
            <a-sky color="#1a1a2e" />

            {/* ── Floor plane ───────────────────────────────────────────── */}
            <a-plane
              position="0 0 0"
              rotation="-90 0 0"
              width={String(FLOOR_SIZE)}
              height={String(FLOOR_SIZE)}
              color={FLOOR_COLOUR}
              roughness="0.9"
              shadow="receive: true"
            />

            {/* ── Grid overlay ──────────────────────────────────────────── */}
            <GridPlane size={FLOOR_SIZE} gridSize={GRID} />

            {/* ── Floor label ───────────────────────────────────────────── */}
            {currentFloor && (
              <a-text
                value={`Floor: ${currentFloor.name}`}
                position={`${-FLOOR_SIZE / 2 + 1} 0.05 ${-FLOOR_SIZE / 2 + 1}`}
                rotation="-90 0 0"
                color="#333"
                scale="0.5 0.5 0.5"
                align="left"
              />
            )}

            {/* ── Racks (shelves) ───────────────────────────────────────── */}
            {shelves.map(shelf => {
              const pos = rackPos[shelf.id] ?? { x: 0, z: 0, rotY: 0 };
              return (
                <Rack
                  key={shelf.id}
                  shelf={shelf}
                  boxes={shelfBoxes[shelf.id] ?? []}
                  isSelected={selectedRack === shelf.id}
                  posX={pos.x}
                  posZ={pos.z}
                  rotY={pos.rotY}
                />
              );
            })}

            {/* ── Cursor (shows crosshair for clickable objects) ─────────── */}
            <a-entity
              position={camPosStr}
              rotation={camRotStr}
            >
              <a-cursor
                color="#FFD700"
                opacity="0.8"
                scale="0.5 0.5 0.5"
                raycaster="objects: [data-rack-id]"
              />
            </a-entity>
          </a-scene>
        )}

        {/* Overlay hint when no scene yet */}
        {!aframeReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
            Initialising 3D engine…
          </div>
        )}
      </div>

      {/* ── Shelf list panel ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900 text-white border-t border-gray-700 overflow-x-auto">
        <div className="flex gap-2 px-4 py-2">
          {shelves.length === 0 && (
            <span className="text-gray-500 text-sm italic">
              No racks on this floor. Add shelves in Storage Zones.
            </span>
          )}
          {shelves.map(shelf => {
            const pos    = rackPos[shelf.id] ?? { x: 0, z: 0, rotY: 0 };
            const bCount = (shelfBoxes[shelf.id] ?? []).length;
            const isSel  = selectedRack === shelf.id;
            return (
              <button
                key={shelf.id}
                onClick={() => setSelectedRack(isSel ? null : shelf.id)}
                className={`flex flex-col items-start px-3 py-2 rounded text-xs border transition-colors flex-shrink-0 ${
                  isSel
                    ? 'border-yellow-400 bg-yellow-900/40 text-yellow-300'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="font-semibold">{shelf.name}</span>
                <span className="text-gray-400">{bCount} box{bCount !== 1 ? 'es' : ''}</span>
                <span className="text-gray-500">
                  pos ({pos.x.toFixed(1)}, {pos.z.toFixed(1)}) rot {pos.rotY}°
                </span>
                {shelf.hasFreezer && <span className="text-blue-400">❄ Freezer</span>}
                {shelf.hasLock    && <span className="text-yellow-400">🔒 Locked</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
