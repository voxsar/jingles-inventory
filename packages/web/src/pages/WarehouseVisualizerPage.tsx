import { useEffect, useRef, useState, useCallback } from 'react';
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

  // Camera state: free-fly position + look direction
  const [camPos,   setCamPos]   = useState<{ x: number; y: number; z: number }>({ x: 4, y: 8, z: 7 });
  const [camYaw,   setCamYaw]   = useState(30);    // horizontal rotation, degrees (0 = -Z, 90 = +X)
  const [camPitch, setCamPitch] = useState(-45);   // vertical tilt, degrees (negative = look down)

  const [aframeReady,  setAframeReady]  = useState(false);

  // ── Overview mode ─────────────────────────────────────────────────────────
  const [viewMode,       setViewMode]      = useState<'single' | 'overview'>('single');
  const [overviewData,   setOverviewData]  = useState<Array<{
    floor: IFloor;
    racks: IRack[];
    rackPos: Record<string, { x: number; z: number; rotY: number }>;
  }>>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // ── Stable refs so event handlers always see latest state ───────────────
  const rackPosRef = useRef(rackPos);
  useEffect(() => { rackPosRef.current = rackPos; }, [rackPos]);

  const camRef = useRef({ camPos, camYaw, camPitch });
  useEffect(() => { camRef.current = { camPos, camYaw, camPitch }; }, [camPos, camYaw, camPitch]);

  const viewModeRef  = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const floorsCountRef = useRef(floors.length);
  useEffect(() => { floorsCountRef.current = floors.length; }, [floors.length]);

  // ── Bounding-box clamp (20 % beyond furthest floor edge in x/y/z) ─────────
  const clampCamPos = useCallback((pos: { x: number; y: number; z: number }): { x: number; y: number; z: number } => {
    const FS = 30; // FLOOR_SIZE
    const GAP = 8;
    const n = viewModeRef.current === 'overview' ? Math.max(1, floorsCountRef.current) : 1;
    const floorMinX = -(FS / 2);
    const floorMaxX = (n - 1) * (FS + GAP) + FS / 2;
    const floorMinZ = -(FS / 2);
    const floorMaxZ =  FS / 2;
    const padX = (floorMaxX - floorMinX) * 0.2;
    const padZ = (floorMaxZ - floorMinZ) * 0.2;
    const maxH = Math.max(floorMaxX - floorMinX, FS) * 1.2;
    return {
      x: Math.max(floorMinX - padX, Math.min(floorMaxX + padX, pos.x)),
      y: Math.max(0.5, Math.min(maxH, pos.y)),
      z: Math.max(floorMinZ - padZ, Math.min(floorMaxZ + padZ, pos.z)),
    };
  }, []); // reads only from refs – stable forever

  // ── Double-click tracking ─────────────────────────────────────────────────
  const lastClickRef = useRef<{ rackId: string | null; time: number }>({ rackId: null, time: 0 });

  // ── Derived camera position & rotation strings ────────────────────────────
  const camPosStr = `${camPos.x.toFixed(2)} ${camPos.y.toFixed(2)} ${camPos.z.toFixed(2)}`;
  const camRotStr = `${camPitch.toFixed(1)} ${camYaw.toFixed(1)} 0`;

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
          racksApi.savePosition(selectedRack, { posX: x, posZ: z, rotY }).catch((err) => { console.error('Failed to save rack position', err); });
          return next;
        });
      }
      // Camera free-fly with IJKL (rotate) and = / - (move forward/back)
      if (['KeyI','KeyK','KeyJ','KeyL','Equal','Minus'].includes(e.code) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const rotStep = 5;
        const moveStep = 1.5;
        if (e.code === 'KeyI') setCamPitch(v => Math.min(85, v + rotStep));
        if (e.code === 'KeyK') setCamPitch(v => Math.max(-85, v - rotStep));
        if (e.code === 'KeyJ') setCamYaw(v => (v - rotStep + 360) % 360);
        if (e.code === 'KeyL') setCamYaw(v => (v + rotStep) % 360);
        if (e.code === 'Equal' || e.code === 'Minus') {
          const sign = e.code === 'Equal' ? 1 : -1;
          const { camYaw: yaw } = camRef.current;
          const yr = (yaw * Math.PI) / 180;
          const hfx = -Math.sin(yr);
          const hfz = -Math.cos(yr);
          setCamPos(v => clampCamPos({ x: v.x + hfx * moveStep * sign, y: v.y, z: v.z + hfz * moveStep * sign }));
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRack, clampCamPos]);

  // ── Mouse drag: look around (left/middle) or pan (right/Alt) ─────────────
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; mode: 'look'|'pan' }>({ active: false, lastX: 0, lastY: 0, mode: 'look' });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onMouseDown(e: MouseEvent) {
      // Left (0) and middle (1) → look around; right (2) or Alt+left → pan
      const mode: 'look' | 'pan' = (e.button === 2 || (e.button === 0 && e.altKey)) ? 'pan' : 'look';
      dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, mode };
      e.preventDefault();
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      if (dragRef.current.mode === 'look') {
        // Rotate camera in place: horizontal drag = yaw, vertical drag = pitch
        setCamYaw(v => (v + dx * 0.4 + 360) % 360);
        setCamPitch(v => Math.max(-85, Math.min(85, v - dy * 0.3)));
      } else {
        // Pan: translate camera position using right + world-up vectors
        const { camYaw: yaw } = camRef.current;
        const yr = (yaw * Math.PI) / 180;
        const rx = Math.cos(yr);
        const rz = -Math.sin(yr);
        const speed = 0.04;
        setCamPos(v => clampCamPos({
          x: v.x - dx * rx * speed,
          y: v.y + dy * speed,   // drag up → camera moves up
          z: v.z - dx * rz * speed,
        }));
      }
    }
    function onMouseUp() { dragRef.current.active = false; }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // Move forward/backward along horizontal look direction
      const { camYaw: yaw } = camRef.current;
      const yr = (yaw * Math.PI) / 180;
      const hfx = -Math.sin(yr);
      const hfz = -Math.cos(yr);
      const delta = e.deltaY * 0.03;
      setCamPos(v => clampCamPos({ x: v.x + hfx * delta, y: v.y, z: v.z + hfz * delta }));
    }
    function onContextMenu(e: Event) { e.preventDefault(); }
    // Suppress middle-mouse "autoscroll" open-link behaviour in browsers
    function onAuxClick(e: Event) { e.preventDefault(); }

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('auxclick', onAuxClick);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('auxclick', onAuxClick);
    };
  }, [clampCamPos]);

  // ── Click → select rack (single) / double-click → center view on rack ──────
  const sceneRef = useRef<HTMLElement & EventTarget>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    function handler(e: Event) {
      const ce = e as CustomEvent;
      const el = ce.detail?.intersection?.object?.el as HTMLElement | undefined;
      let rackId: string | null = null;
      if (el) {
        let node: HTMLElement | null = el;
        while (node) {
          const id = node.getAttribute('data-rack-id');
          if (id) { rackId = id; break; }
          node = node.parentElement;
        }
      }

      const now = Date.now();
      const isDoubleClick =
        rackId !== null &&
        now - lastClickRef.current.time < 400 &&
        lastClickRef.current.rackId === rackId;
      lastClickRef.current = { rackId, time: now };

      if (isDoubleClick && rackId) {
        // Center view on rack: look at it and move closer – no orbit anchor
        const p = rackPosRef.current[rackId];
        if (p) {
          const cam = camRef.current;
          const rackH = 1.0; // approximate rack centre height
          const dx = p.x - cam.camPos.x;
          const dy = rackH - cam.camPos.y;
          const dz = p.z - cam.camPos.z;
          const hDist = Math.sqrt(dx * dx + dz * dz);
          const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const newYaw   = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
          const newPitch = (Math.atan2(dy, hDist) * 180) / Math.PI;
          // Move camera to 5 m away from the rack
          const moveDist = Math.max(0, totalDist - 5);
          const newPos = {
            x: cam.camPos.x + (dx / totalDist) * moveDist,
            y: Math.max(1.5, cam.camPos.y + (dy / totalDist) * moveDist),
            z: cam.camPos.z + (dz / totalDist) * moveDist,
          };
          setCamPos(clampCamPos(newPos));
          setCamYaw(newYaw);
          setCamPitch(Math.max(-85, Math.min(85, newPitch)));
        }
        setSelectedRack(rackId);
        return;
      }

      if (rackId) { setSelectedRack(rackId); } else { setSelectedRack(null); }
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
      racksApi.savePosition(selectedRack, { posX: nx, posZ: nz, rotY: p.rotY }).catch((err) => { console.error('Failed to save rack position', err); });
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
      racksApi.savePosition(selectedRack, { posX: p.x, posZ: p.z, rotY }).catch((err) => { console.error('Failed to save rack position', err); });
      return next;
    });
  }, [selectedRack]);

  // ── Focus on selected rack (position camera to look at it) ──────────────
  const focusOnRack = useCallback((rackId: string) => {
    const p = rackPos[rackId];
    if (!p) return;
    const cam = camRef.current;
    const rackH = 1.0;
    const dx = p.x - cam.camPos.x;
    const dy = rackH - cam.camPos.y;
    const dz = p.z - cam.camPos.z;
    const hDist = Math.sqrt(dx * dx + dz * dz);
    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const newYaw   = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    const newPitch = (Math.atan2(dy, hDist) * 180) / Math.PI;
    const moveDist = Math.max(0, totalDist - 4);
    const newPos = {
      x: cam.camPos.x + (dx / (totalDist || 1)) * moveDist,
      y: Math.max(1.5, cam.camPos.y + (dy / (totalDist || 1)) * moveDist),
      z: cam.camPos.z + (dz / (totalDist || 1)) * moveDist,
    };
    setCamPos(clampCamPos(newPos));
    setCamYaw(newYaw);
    setCamPitch(Math.max(-85, Math.min(85, newPitch)));
  }, [rackPos, clampCamPos]);

  // ── Load all-floors overview data ─────────────────────────────────────────
  const loadOverview = useCallback(async () => {
    if (floors.length === 0) return;
    setOverviewLoading(true);
    try {
      const results = await Promise.all(
        floors.map(async (floor) => {
          const racksRes = await racksApi.list({ floorId: floor.id });
          const rackList: IRack[] = racksRes.data?.data?.items ?? racksRes.data?.data ?? racksRes.data ?? [];
          const pos: Record<string, { x: number; z: number; rotY: number }> = {};
          rackList.forEach((r, i) => {
            pos[r.id] = {
              x: r.posX ?? snap((i % 5) * 3),
              z: r.posZ ?? snap(Math.floor(i / 5) * 3),
              rotY: r.rotY ?? 0,
            };
          });
          return { floor, racks: rackList, rackPos: pos };
        })
      );
      setOverviewData(results);
    } finally {
      setOverviewLoading(false);
    }
  }, [floors]);

  // ── Switch to overview mode ───────────────────────────────────────────────
  const enterOverview = useCallback(() => {
    setViewMode('overview');
    setSelectedRack(null);
    loadOverview();
    // Position camera above centre of all floors, looking down
    const FS = 30; // FLOOR_SIZE
    const spread = Math.max(1, floors.length);
    const centerX = (spread - 1) * (FS + 8) / 2;
    const height = Math.min(60, 10 + spread * 8);
    setCamPos({ x: centerX, y: height, z: height * 0.6 });
    setCamYaw(0);     // face north (−Z)
    setCamPitch(-55); // look steeply down
  }, [floors.length, loadOverview]);

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

        {/* View mode toggle */}
        <div className="flex rounded overflow-hidden border border-gray-600">
          <button
            onClick={() => setViewMode('single')}
            className={`px-3 py-1 text-xs ${viewMode === 'single' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            📦 Single Floor
          </button>
          <button
            onClick={enterOverview}
            className={`px-3 py-1 text-xs ${viewMode === 'overview' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            🏢 All Floors
          </button>
        </div>

        {viewMode === 'single' && (
          <>
            <label className="font-semibold text-gray-300">Zone:</label>
            <select
              value={selectedFloor}
              onChange={e => { setSelectedFloor(e.target.value); setViewMode('single'); }}
              className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
            >
              {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </>
        )}

        <span className="text-gray-500">|</span>

        {/* Camera height quick-adjust */}
        <label className="font-semibold text-gray-300 text-xs">Height:</label>
        <input type="range" min={0.5} max={40} step={0.5} value={camPos.y} onChange={e => setCamPos(v => clampCamPos({ ...v, y: Number(e.target.value) }))} className="w-20" />
        <span className="text-gray-400 text-xs">{camPos.y.toFixed(1)}m</span>

        <span className="text-gray-500">|</span>

        {/* Rack controls – only in single-floor mode */}
        {viewMode === 'single' && selectedRack ? (
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
            {viewMode === 'overview'
              ? 'Free-fly · Drag to look · Right/Alt-drag to pan · Scroll to move forward/back'
              : 'Drag to look · Right/Alt-drag to pan · Scroll to move · Double-click rack to centre'}
          </span>
        )}

        {/* Reset view */}
        <button
          onClick={() => {
            if (viewMode === 'overview') {
              enterOverview();
            } else {
              setCamPos({ x: 4, y: 8, z: 7 }); setCamYaw(30); setCamPitch(-45);
            }
          }}
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

            {/* Orbit camera – position and rotation fully driven by React state */}
            <a-camera
              position={camPosStr}
              rotation={camRotStr}
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

            <a-sky color="#1a1a2e" />

            {viewMode === 'single' ? (
              <>
                {/* Floor */}
                <a-plane
                  position={`0 0 0`}
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
              </>
            ) : (
              /* ── All-floors overview ──────────────────────────────── */
              <>
                {overviewData.map((fd, fi) => {
                  const offsetX = fi * (FLOOR_SIZE + 8);
                  return (
                    <a-entity key={fd.floor.id} position={`${offsetX} 0 0`}>
                      {/* Floor slab */}
                      <a-plane
                        position="0 0 0"
                        rotation="-90 0 0"
                        width={String(FLOOR_SIZE)}
                        height={String(FLOOR_SIZE)}
                        color={FLOOR_COLOUR}
                        roughness="0.9"
                      />
                      {/* Floor grid */}
                      <GridPlane size={FLOOR_SIZE} gridSize={GRID} />
                      {/* Floor name label (horizontal, on the slab) */}
                      <a-text
                        value={fd.floor.name}
                        position={`${-FLOOR_SIZE / 2 + 1} 0.08 ${-FLOOR_SIZE / 2 + 1}`}
                        rotation="-90 0 0"
                        color="#333"
                        scale="0.7 0.7 0.7"
                        align="left"
                      />
                      {/* Floor name label (vertical, floating above) */}
                      <a-text
                        value={`Floor ${fi + 1}: ${fd.floor.name}`}
                        position={`0 4 ${-FLOOR_SIZE / 2 - 1}`}
                        align="center"
                        color="#AADDFF"
                        scale="0.6 0.6 0.6"
                        width="10"
                      />
                      {/* Racks on this floor */}
                      {fd.racks.map(rack => {
                        const pos = fd.rackPos[rack.id] ?? { x: 0, z: 0, rotY: 0 };
                        return (
                          <RackEntity
                            key={rack.id}
                            rack={rack}
                            shelves={[]}
                            shelfBoxes={{}}
                            isSelected={false}
                            posX={pos.x}
                            posZ={pos.z}
                            rotY={pos.rotY}
                          />
                        );
                      })}
                    </a-entity>
                  );
                })}
                {overviewLoading && (
                  <a-text value="Loading all floors…" position="0 2 0" align="center" color="#FFFFFF" scale="0.5 0.5 0.5" />
                )}
              </>
            )}
          </a-scene>
        )}

        {!aframeReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
            Initialising 3D engine…
          </div>
        )}
      </div>

      {/* ── Rack panel – only in single-floor mode ───────────────────── */}
      {viewMode === 'single' && (
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
      )}

      {/* ── Overview floor list ───────────────────────────────────────── */}
      {viewMode === 'overview' && (
      <div className="flex-shrink-0 bg-gray-900 text-white border-t border-gray-700 overflow-x-auto" style={{ maxHeight: '80px' }}>
        <div className="flex gap-2 px-4 py-2 items-center">
          <span className="text-gray-400 text-xs font-semibold mr-2">Floors:</span>
          {overviewLoading && <span className="text-gray-500 text-xs italic">Loading…</span>}
          {overviewData.map((fd, fi) => (
            <button
              key={fd.floor.id}
              onClick={() => {
                // Switch to single-floor view for this floor
                setViewMode('single');
                setSelectedFloor(fd.floor.id);
                setCamPos({ x: 4, y: 8, z: 7 }); setCamYaw(30); setCamPitch(-45);
              }}
              className="flex items-center gap-1 px-3 py-1 rounded text-xs border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 flex-shrink-0"
            >
              <span className="text-blue-400 font-bold">{fi + 1}.</span>
              <span>{fd.floor.name}</span>
              <span className="text-gray-500">({fd.racks.length} rack{fd.racks.length !== 1 ? 's' : ''})</span>
            </button>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
