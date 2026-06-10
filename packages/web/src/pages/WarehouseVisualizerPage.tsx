import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { floorsApi, racksApi, shelvesApi, boxesApi, inventoryApi } from '../api/client';
import type { IFloor, IRack, IShelf, IStorageBox } from '@jingles/shared';
import SearchableSelect from '../components/SearchableSelect';

// ── Grid helper ─────────────────────────────────────────────────────────────
const GRID = 0.5; // scene units per grid cell

/**
 * Scene unit system: 1 scene unit = 1 metre.
 * Floor length/width are stored in metres and map 1:1 to scene units.
 * Rack dimensions (widthCm/heightCm/depthCm) are stored in centimetres.
 * Shelf and box dimensions exist in BOTH units in the database — older rows
 * hold metres (0.3, 1.2, …) while the create form labels the fields cm — so
 * `dimToMetres` treats values above 5 as centimetres.
 */
const CM2M = 0.01;
function dimToMetres(value: number | null | undefined, fallbackM: number): number {
	if (!value || value <= 0) return fallbackM;
	return value > 5 ? value * CM2M : value;
}

const DEFAULT_FLOOR_LENGTH = 30; // metres, used when a zone has no recorded size
const DEFAULT_FLOOR_WIDTH = 20;
const STOREY_HEIGHT = 4;         // metres between stacked floors in the overview
const OVERVIEW_GAP = 8;          // metres between branch columns in the overview

function snap(v: number): number {
	return Math.round(v / GRID) * GRID;
}

function floorSceneDims(floor: IFloor | null | undefined): { w: number; d: number } {
	return {
		w: floor?.length && floor.length > 0 ? floor.length : DEFAULT_FLOOR_LENGTH,
		d: floor?.width && floor.width > 0 ? floor.width : DEFAULT_FLOOR_WIDTH,
	};
}

/** Default grid layout for racks that have no saved position. */
function defaultRackPos(index: number, floorW: number, floorD: number): { x: number; z: number } {
	const cols = Math.max(1, Math.floor((floorW - 4) / 3));
	return {
		x: snap(-floorW / 2 + 2 + (index % cols) * 3),
		z: snap(-floorD / 2 + 2 + Math.floor(index / cols) * 3),
	};
}

// ── Colour helpers ──────────────────────────────────────────────────────────
const BOX_COLOURS = ['#E8A838', '#D4943F', '#F0C060', '#C68A2A', '#DCA030'];
const FLOOR_COLOUR = '#B8D4A8';
const GRID_COLOUR = '#8EBE7E';
const WALL_COLOUR = '#7E997B';
const PRODUCT_COLOUR = '#2AA9A0';
const SELECTED_COLOUR = '#FFD700';

type WarehouseShelf = IShelf & { boxes?: IStorageBox[] };
type WarehouseRack = IRack & { shelves?: WarehouseShelf[] };

interface ProductRecord {
	id: string;
	quantity: number;
	state: string;
	floorId?: string | null;
	shelfId?: string | null;
	boxId?: string | null;
	sku?: { id: string; name: string; skuCode?: string | null } | null;
}

interface FloorSceneData {
	racks: WarehouseRack[];
	rackShelves: Record<string, IShelf[]>;
	shelfBoxes: Record<string, IStorageBox[]>;
	floorBoxes: IStorageBox[];
	products: ProductRecord[];
	warnings: string[];
}

function extractList<T>(payload: any): T[] {
	const value = payload?.data?.items ?? payload?.data ?? payload?.items ?? payload;
	return Array.isArray(value) ? value : [];
}

function appendUnique<T extends { id: string }>(items: T[], item: T): T[] {
	return items.some(existing => existing.id === item.id) ? items : [...items, item];
}

function groupRackShelves(racks: WarehouseRack[]) {
	const rackShelves: Record<string, IShelf[]> = {};
	const shelfBoxes: Record<string, IStorageBox[]> = {};

	racks.forEach((rack) => {
		const shelves = Array.isArray(rack.shelves) ? rack.shelves : [];
		rackShelves[rack.id] = shelves;
		shelves.forEach((shelf) => {
			shelfBoxes[shelf.id] = Array.isArray(shelf.boxes) ? shelf.boxes : [];
		});
	});

	return { rackShelves, shelfBoxes };
}

function mergeShelves(
	baseRackShelves: Record<string, IShelf[]>,
	baseShelfBoxes: Record<string, IStorageBox[]>,
	shelves: WarehouseShelf[],
) {
	const nextRackShelves: Record<string, IShelf[]> = { ...baseRackShelves };
	const nextShelfBoxes: Record<string, IStorageBox[]> = { ...baseShelfBoxes };

	shelves.forEach((shelf) => {
		if (shelf.rackId) {
			nextRackShelves[shelf.rackId] = appendUnique(nextRackShelves[shelf.rackId] ?? [], shelf);
		}
		nextShelfBoxes[shelf.id] = Array.isArray(shelf.boxes) ? shelf.boxes : (nextShelfBoxes[shelf.id] ?? []);
	});

	return { rackShelves: nextRackShelves, shelfBoxes: nextShelfBoxes };
}

function mergeBoxesByLocation(
	baseShelfBoxes: Record<string, IStorageBox[]>,
	boxes: IStorageBox[],
) {
	const shelfBoxes: Record<string, IStorageBox[]> = { ...baseShelfBoxes };
	let floorBoxes: IStorageBox[] = [];

	boxes.forEach((box) => {
		if (box.shelfId) {
			shelfBoxes[box.shelfId] = appendUnique(shelfBoxes[box.shelfId] ?? [], box);
		} else {
			floorBoxes = appendUnique(floorBoxes, box);
		}
	});

	return { shelfBoxes, floorBoxes };
}

const floorSceneRequests = new Map<string, Promise<FloorSceneData>>();

function fetchFloorSceneData(floorId: string): Promise<FloorSceneData> {
	const existing = floorSceneRequests.get(floorId);
	if (existing) return existing;

	const request = (async () => {
		const warnings: string[] = [];
		const [racksResult, boxesResult, inventoryResult] = await Promise.allSettled([
			racksApi.list({ floorId }),
			boxesApi.list({ floorId }),
			inventoryApi.list({ floorId, pageSize: '500' }),
		]);

		if (racksResult.status === 'rejected' && boxesResult.status === 'rejected') {
			throw racksResult.reason;
		}

		if (racksResult.status === 'rejected') warnings.push('Racks could not be loaded for this zone.');
		if (boxesResult.status === 'rejected') warnings.push('Boxes could not be loaded from the zone box index.');
		if (inventoryResult.status === 'rejected') warnings.push('Product placements could not be loaded for this zone.');

		const racks: WarehouseRack[] = racksResult.status === 'fulfilled' ? extractList<WarehouseRack>(racksResult.value.data) : [];
		const floorBoxIndex: IStorageBox[] = boxesResult.status === 'fulfilled' ? extractList<IStorageBox>(boxesResult.value.data) : [];
		const products: ProductRecord[] = inventoryResult.status === 'fulfilled' ? extractList<ProductRecord>(inventoryResult.value.data) : [];
		let { rackShelves, shelfBoxes } = groupRackShelves(racks);

		const racksIncludeShelves = racks.some(rack => Array.isArray(rack.shelves));
		if (!racksIncludeShelves && racks.length > 0) {
			try {
				const shelvesRes = await shelvesApi.list({ floorId });
				const shelves = extractList<WarehouseShelf>(shelvesRes.data);
				({ rackShelves, shelfBoxes } = mergeShelves(rackShelves, shelfBoxes, shelves));
			} catch {
				warnings.push('Shelves could not be loaded for this zone.');
			}
		}

		const groupedBoxes = mergeBoxesByLocation(shelfBoxes, floorBoxIndex);
		return {
			racks,
			rackShelves,
			shelfBoxes: groupedBoxes.shelfBoxes,
			floorBoxes: groupedBoxes.floorBoxes,
			products,
			warnings,
		};
	})();

	floorSceneRequests.set(floorId, request);
	request.then(() => {
		if (floorSceneRequests.get(floorId) === request) floorSceneRequests.delete(floorId);
	}, () => {
		if (floorSceneRequests.get(floorId) === request) floorSceneRequests.delete(floorId);
	});
	return request;
}

// ── A-Frame lazy loader ─────────────────────────────────────────────────────
let aframeLoaded = false;
function ensureAframe(): Promise<void> {
	if (aframeLoaded) return Promise.resolve();
	return import('aframe').then(() => {
		aframeLoaded = true;
	});
}

// ── Sub-components ──────────────────────────────────────────────────────────

const BOARD_T = 0.025; // shelf board thickness (m)

function ShelfBoard({ w, d, y, shelfId }: { w: number; d: number; y: number; shelfId?: string }) {
	return (
		<a-box
			position={`0 ${y} 0`}
			width={String(w)}
			height={String(BOARD_T)}
			depth={String(d)}
			color="#8B7355"
			roughness="0.9"
			data-shelf-id={shelfId || ''}
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

/** Render a Rack with its shelves, boxes and loose products */
const RackEntity = memo(function RackEntity({
	rack,
	shelves,
	shelfBoxes,
	productsByBox,
	productsByShelf,
	isSelected,
	selectedBoxId,
	posX,
	posZ,
	rotY,
}: {
	rack: IRack;
	shelves: IShelf[];
	shelfBoxes: Record<string, IStorageBox[]>;
	productsByBox: Record<string, ProductRecord[]>;
	productsByShelf: Record<string, ProductRecord[]>;
	isSelected: boolean;
	selectedBoxId: string | null;
	posX: number;
	posZ: number;
	rotY: number;
}) {
	// Rack physical dimensions (cm in DB) → metres
	const w = Math.max(dimToMetres(rack.widthCm, 1.0), 0.4);
	const h = Math.max(dimToMetres(rack.heightCm, 2.0), 0.5);
	const d = Math.max(dimToMetres(rack.depthCm, 0.6), 0.3);
	const hw = w / 2 - 0.02;
	const hd = d / 2 - 0.02;

	// One board per shelf record, evenly spaced bottom-to-top inside the frame.
	// Racks with no shelf records get a board roughly every 45 cm.
	const levels = shelves.length > 0 ? shelves.length : Math.max(2, Math.floor(h / 0.45));
	const levelH = h / levels;
	const boardTop = (i: number) => i * levelH + BOARD_T / 2;

	return (
		<a-entity
			position={`${posX} 0 ${posZ}`}
			rotation={`0 ${rotY} 0`}
			data-rack-id={rack.id}
		>
			{/* Corner posts */}
			<Post cx={-hw} cz={-hd} h={h} />
			<Post cx={hw} cz={-hd} h={h} />
			<Post cx={-hw} cz={hd} h={h} />
			<Post cx={hw} cz={hd} h={h} />

			{/* Shelf boards — board i carries shelf i (bottom-up) */}
			{Array.from({ length: levels }, (_, i) => (
				<ShelfBoard key={i} w={w} d={d} y={i * levelH} shelfId={shelves[i]?.id} />
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
			{isSelected && (
				<a-box
					position={`0 ${h / 2} 0`}
					width={String(w + 0.06)}
					height={String(h + 0.06)}
					depth={String(d + 0.06)}
					color={SELECTED_COLOUR}
					opacity="0.25"
					transparent="true"
					side="double"
				/>
			)}

			{/* Freezer indicators */}
			{shelves.map((shelf, si) => shelf.hasFreezer ? (
				<a-text key={`f${si}`} value="❄" position={`${-w / 2 + 0.06} ${si * levelH + 0.15} 0`} color="#00BFFF" scale="0.4 0.4 0.4" align="left" />
			) : null)}

			{/* Name label */}
			<a-text
				value={rack.name}
				position={`0 ${h + 0.3} 0`}
				align="center"
				color="#FFFFFF"
				scale="0.5 0.5 0.5"
				width="3"
			/>

			{/* Boxes on shelves */}
			{shelves.map((shelf, si) => {
				const boxes = shelfBoxes[shelf.id] ?? [];
				return boxes.map((box, bi) => {
					const bw = Math.max(dimToMetres(box.width, 0.35), 0.12);
					const bh = Math.max(dimToMetres(box.height, 0.3), 0.12);
					const bd = Math.max(dimToMetres(box.length, 0.35), 0.12);
					const offsetX = (bi - boxes.length / 2 + 0.5) * (bw + 0.04);
					const baseY = boardTop(si) + bh / 2 + (box.stackOrder ?? 0) * bh;
					const qty = (productsByBox[box.id] ?? []).reduce((sum, r) => sum + r.quantity, 0);
					const colour = selectedBoxId === box.id ? SELECTED_COLOUR : BOX_COLOURS[bi % BOX_COLOURS.length];
					return (
						<a-box
							key={box.id}
							data-box-id={box.id}
							position={`${box.posX ?? offsetX} ${box.posY ?? baseY} ${box.posZ ?? 0}`}
							rotation={`0 ${box.rotationAngle ?? 0} 0`}
							width={String(bw)}
							height={String(bh)}
							depth={String(bd)}
							color={colour}
							roughness="0.7"
						>
							<a-text value={`${box.name.slice(0, 8)}${qty > 0 ? ` x${qty}` : ''}`} position={`0 0 ${bd / 2 + 0.01}`} align="center" color="#333" scale="0.15 0.15 0.15" width="4" />
						</a-box>
					);
				});
			})}

			{/* Products sitting directly on shelves (no box) */}
			{shelves.map((shelf, si) => {
				const prods = productsByShelf[shelf.id] ?? [];
				return prods.map((rec, ri) => (
					<a-box
						key={rec.id}
						position={`${-w / 2 + 0.15 + ri * 0.28} ${boardTop(si) + 0.09} ${d / 4}`}
						width="0.18"
						height="0.18"
						depth="0.18"
						color={PRODUCT_COLOUR}
						roughness="0.6"
					>
						<a-text value={`${(rec.sku?.name ?? 'SKU').slice(0, 12)} x${rec.quantity}`} position="0 0.16 0" align="center" color="#0E5953" scale="0.2 0.2 0.2" width="4" />
					</a-box>
				));
			})}
		</a-entity>
	);
});

/** Floor-level box (sitting directly on floor) */
const FloorBox = memo(function FloorBox({
	box,
	index,
	floorW,
	floorD,
	productsByBox,
	selectedBoxId,
}: {
	box: IStorageBox;
	index: number;
	floorW: number;
	floorD: number;
	productsByBox: Record<string, ProductRecord[]>;
	selectedBoxId: string | null;
}) {
	const bw = Math.max(dimToMetres(box.width, 0.4), 0.15);
	const bh = Math.max(dimToMetres(box.height, 0.4), 0.15);
	const bd = Math.max(dimToMetres(box.length, 0.4), 0.15);
	// Default layout: rows along the front edge of the floor
	const perRow = Math.max(1, Math.floor((floorW - 2) / (bw + 0.15)));
	const col = index % perRow;
	const row = Math.floor(index / perRow);
	const posX = box.posX ?? (-floorW / 2 + 1 + bw / 2 + col * (bw + 0.15));
	const posY = box.posY ?? (bh / 2 + (box.stackOrder ?? 0) * bh);
	const posZ = box.posZ ?? (floorD / 2 - 1 - bd / 2 - row * (bd + 0.2));
	const qty = (productsByBox[box.id] ?? []).reduce((sum, r) => sum + r.quantity, 0);
	return (
		<a-box
			data-box-id={box.id}
			position={`${posX} ${posY} ${posZ}`}
			rotation={`0 ${box.rotationAngle ?? 0} 0`}
			width={String(bw)}
			height={String(bh)}
			depth={String(bd)}
			color={selectedBoxId === box.id ? SELECTED_COLOUR : '#C47A3A'}
			roughness="0.8"
		>
			<a-text value={`${box.name.slice(0, 8)}${qty > 0 ? ` x${qty}` : ''}`} position={`0 0 ${bd / 2 + 0.01}`} align="center" color="#222" scale="0.2 0.2 0.2" width="3" />
		</a-box>
	);
});

/** Grid overlay sized to the actual floor rectangle */
const GridPlane = memo(function GridPlane({ w, d, gridSize }: { w: number; d: number; gridSize: number }) {
	const lines: JSX.Element[] = [];
	const nx = Math.floor(w / gridSize);
	const nz = Math.floor(d / gridSize);
	for (let i = 0; i <= nz; i++) {
		const z = -d / 2 + i * gridSize;
		lines.push(<a-box key={`x${i}`} position={`0 0.002 ${z}`} width={String(w)} height="0.003" depth="0.012" color={GRID_COLOUR} opacity="0.45" transparent="true" />);
	}
	for (let i = 0; i <= nx; i++) {
		const x = -w / 2 + i * gridSize;
		lines.push(<a-box key={`z${i}`} position={`${x} 0.002 0`} width="0.012" height="0.003" depth={String(d)} color={GRID_COLOUR} opacity="0.45" transparent="true" />);
	}
	return <a-entity>{lines}</a-entity>;
});

/** Floor slab with a low perimeter kerb so the zone edges read clearly */
const FloorSlab = memo(function FloorSlab({ w, d }: { w: number; d: number }) {
	return (
		<a-entity>
			<a-box position="0 -0.05 0" width={String(w)} height="0.1" depth={String(d)} color={FLOOR_COLOUR} roughness="0.9" />
			<a-box position={`0 0.15 ${-d / 2}`} width={String(w)} height="0.3" depth="0.06" color={WALL_COLOUR} opacity="0.85" transparent="true" />
			<a-box position={`0 0.15 ${d / 2}`} width={String(w)} height="0.3" depth="0.06" color={WALL_COLOUR} opacity="0.85" transparent="true" />
			<a-box position={`${-w / 2} 0.15 0`} width="0.06" height="0.3" depth={String(d)} color={WALL_COLOUR} opacity="0.85" transparent="true" />
			<a-box position={`${w / 2} 0.15 0`} width="0.06" height="0.3" depth={String(d)} color={WALL_COLOUR} opacity="0.85" transparent="true" />
		</a-entity>
	);
});

interface OverviewFloorData {
	floor: IFloor;
	racks: WarehouseRack[];
	rackShelves: Record<string, IShelf[]>;
	shelfBoxes: Record<string, IStorageBox[]>;
	rackPos: Record<string, { x: number; z: number; rotY: number }>;
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function WarehouseVisualizerPage() {
	const [floors, setFloors] = useState<IFloor[]>([]);
	const [floorRackCounts, setFloorRackCounts] = useState<Record<string, number>>({});
	const [selectedFloor, setSelectedFloor] = useState<string>('');
	const [racks, setRacks] = useState<IRack[]>([]);
	const [rackShelves, setRackShelves] = useState<Record<string, IShelf[]>>({});
	const [shelfBoxes, setShelfBoxes] = useState<Record<string, IStorageBox[]>>({});
	const [floorBoxes, setFloorBoxes] = useState<IStorageBox[]>([]); // boxes directly on floor
	const [products, setProducts] = useState<ProductRecord[]>([]);

	// rackPos mirrors the server's posX/posZ/rotY but is kept locally for instant response
	const [rackPos, setRackPos] = useState<Record<string, { x: number; z: number; rotY: number }>>({});
	const [selectedRack, setSelectedRack] = useState<string | null>(null);
	const [selectedBox, setSelectedBox] = useState<IStorageBox | null>(null);
	const [loading, setLoading] = useState(true);
	const [floorLoading, setFloorLoading] = useState(false);
	const [sceneError, setSceneError] = useState<string | null>(null);

	// Camera state: free-fly position + look direction
	const [camPos, setCamPos] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 12, z: 18 });
	const [camYaw, setCamYaw] = useState(0);      // horizontal rotation, degrees (0 = -Z, 90 = +X)
	const [camPitch, setCamPitch] = useState(-40); // vertical tilt, degrees (negative = look down)

	const [aframeReady, setAframeReady] = useState(false);

	// ── WASD movement state ───────────────────────────────────────────────────
	const keysPressed = useRef<Set<string>>(new Set());
	const moveSpeedRef = useRef(0.03); // start slow
	const lastMoveTime = useRef(Date.now());

	// ── Overview mode ─────────────────────────────────────────────────────────
	const [viewMode, setViewMode] = useState<'single' | 'overview'>('single');
	const [overviewData, setOverviewData] = useState<OverviewFloorData[]>([]);
	const [overviewLoading, setOverviewLoading] = useState(false);

	// ── Product groupings ─────────────────────────────────────────────────────
	const productsByBox = useMemo(() => {
		const map: Record<string, ProductRecord[]> = {};
		products.forEach(r => { if (r.boxId) (map[r.boxId] ??= []).push(r); });
		return map;
	}, [products]);
	const productsByShelf = useMemo(() => {
		const map: Record<string, ProductRecord[]> = {};
		products.forEach(r => { if (!r.boxId && r.shelfId) (map[r.shelfId] ??= []).push(r); });
		return map;
	}, [products]);
	const floorProducts = useMemo(
		() => products.filter(r => !r.boxId && !r.shelfId),
		[products],
	);

	// ── Stable refs so event handlers always see latest state ───────────────
	const rackPosRef = useRef(rackPos);
	useEffect(() => { rackPosRef.current = rackPos; }, [rackPos]);

	const camRef = useRef({ camPos, camYaw, camPitch });
	useEffect(() => { camRef.current = { camPos, camYaw, camPitch }; }, [camPos, camYaw, camPitch]);

	// ── Camera bounding box, recomputed per floor / overview layout ──────────
	const boundsRef = useRef({ minX: -25, maxX: 25, minZ: -25, maxZ: 25, maxY: 30 });
	const clampCamPos = useCallback((pos: { x: number; y: number; z: number }): { x: number; y: number; z: number } => {
		const b = boundsRef.current;
		return {
			x: Math.max(b.minX, Math.min(b.maxX, pos.x)),
			y: Math.max(0.5, Math.min(b.maxY, pos.y)),
			z: Math.max(b.minZ, Math.min(b.maxZ, pos.z)),
		};
	}, []); // reads only from refs – stable forever

	// ── Double-click tracking ─────────────────────────────────────────────────
	const lastClickRef = useRef<{ rackId: string | null; time: number }>({ rackId: null, time: 0 });

	// ── Derived camera position & rotation strings ────────────────────────────
	const camPosStr = `${camPos.x.toFixed(2)} ${camPos.y.toFixed(2)} ${camPos.z.toFixed(2)}`;
	const camRotStr = `${camPitch.toFixed(1)} ${camYaw.toFixed(1)} 0`;

	// ── Load floors + rack counts, default to a populated zone ───────────────
	useEffect(() => {
		setLoading(true);
		Promise.allSettled([floorsApi.list(), racksApi.list()])
			.then(([floorsResult, racksResult]) => {
				if (floorsResult.status === 'rejected') {
					setFloors([]);
					setSceneError('Storage zones could not be loaded.');
					return;
				}
				const list = extractList<IFloor>(floorsResult.value.data);
				setFloors(list);
				const counts: Record<string, number> = {};
				if (racksResult.status === 'fulfilled') {
					extractList<WarehouseRack>(racksResult.value.data).forEach(r => {
						counts[r.floorId] = (counts[r.floorId] ?? 0) + 1;
					});
				}
				setFloorRackCounts(counts);
				if (list.length > 0) {
					const mostPopulated = [...list].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
					setSelectedFloor((counts[mostPopulated.id] ?? 0) > 0 ? mostPopulated.id : list[0].id);
				}
			})
			.finally(() => setLoading(false));
	}, []);

	// ── Current floor dimensions (metres = scene units) ──────────────────────
	const currentFloor = floors.find(f => f.id === selectedFloor);
	const { w: floorW, d: floorD } = floorSceneDims(currentFloor);

	// ── Fit camera to the current floor ───────────────────────────────────────
	const fitCameraToFloor = useCallback((w: number, d: number) => {
		const y = Math.max(8, Math.max(w, d) * 0.5);
		setCamPos({ x: 0, y, z: d / 2 + y * 0.7 });
		setCamYaw(0);
		setCamPitch(-42);
	}, []);

	// Keep camera bounds in sync with the floor being viewed
	useEffect(() => {
		if (viewMode !== 'single') return;
		const padX = floorW * 0.4 + 5;
		const padZ = floorD * 0.4 + 5;
		boundsRef.current = {
			minX: -floorW / 2 - padX,
			maxX: floorW / 2 + padX,
			minZ: -floorD / 2 - padZ,
			maxZ: floorD / 2 + padZ,
			maxY: Math.max(25, Math.max(floorW, floorD) * 1.2),
		};
	}, [viewMode, floorW, floorD]);

	// Refit the camera whenever the visible floor changes
	useEffect(() => {
		if (viewMode === 'single' && selectedFloor) fitCameraToFloor(floorW, floorD);
	}, [viewMode, selectedFloor, floorW, floorD, fitCameraToFloor]);

	// ── Load racks + floor boxes + products when floor changes ────────────────
	useEffect(() => {
		if (!selectedFloor) return;
		let cancelled = false;
		setRacks([]);
		setRackShelves({});
		setShelfBoxes({});
		setFloorBoxes([]);
		setProducts([]);
		setSelectedRack(null);
		setSelectedBox(null);
		setFloorLoading(true);
		setSceneError(null);

		const dims = floorSceneDims(floors.find(f => f.id === selectedFloor));
		fetchFloorSceneData(selectedFloor)
			.then((data) => {
				if (cancelled) return;
				setRacks(data.racks);
				setRackShelves(data.rackShelves);
				setShelfBoxes(data.shelfBoxes);
				setFloorBoxes(data.floorBoxes);
				setProducts(data.products);
				setSceneError(data.warnings[0] ?? null);
				const pos: Record<string, { x: number; z: number; rotY: number }> = {};
				data.racks.forEach((r, i) => {
					const def = defaultRackPos(i, dims.w, dims.d);
					pos[r.id] = {
						x: r.posX ?? def.x,
						z: r.posZ ?? def.z,
						rotY: r.rotY ?? 0,
					};
				});
				setRackPos(pos);
			})
			.catch(() => {
				if (cancelled) return;
				setSceneError('Warehouse 3D data could not be loaded for this zone.');
			})
			.finally(() => {
				if (!cancelled) setFloorLoading(false);
			});

		return () => { cancelled = true; };
	}, [selectedFloor, floors]);

	// ── Keyboard handler ──────────────────────────────────────────────────────
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			// Rack movement
			if (selectedRack && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'Escape'].includes(e.code)) {
				e.preventDefault();
				setRackPos(prev => {
					const p = prev[selectedRack];
					if (!p) return prev;
					let { x, z, rotY } = p;
					if (e.code === 'ArrowUp') z = snap(z - GRID);
					if (e.code === 'ArrowDown') z = snap(z + GRID);
					if (e.code === 'ArrowLeft') x = snap(x - GRID);
					if (e.code === 'ArrowRight') x = snap(x + GRID);
					if (e.code === 'KeyQ') rotY = (rotY - 45 + 360) % 360;
					if (e.code === 'KeyE') rotY = (rotY + 45) % 360;
					if (e.code === 'Escape') { setSelectedRack(null); setSelectedBox(null); return prev; }
					const next = { ...prev, [selectedRack]: { x, z, rotY } };
					racksApi.savePosition(selectedRack, { posX: x, posZ: z, rotY }).catch((err) => { console.error('Failed to save rack position', err); });
					return next;
				});
			}
			if (e.code === 'Escape' && !selectedRack) {
				setSelectedBox(null);
			}
			// Track WASD + QE keys for smooth movement
			if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code) && !selectedRack && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				if (!keysPressed.current.has(e.code)) {
					keysPressed.current.add(e.code);
					lastMoveTime.current = Date.now();
				}
			}
		}

		function onKeyUp(e: KeyboardEvent) {
			if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
				keysPressed.current.delete(e.code);
				// Reset speed when key released
				moveSpeedRef.current = 0.03;
			}
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [selectedRack]);

	// ── Smooth WASD movement loop ─────────────────────────────────────────────
	useEffect(() => {
		let animationId: number;

		function updateMovement() {
			if (keysPressed.current.size > 0 && !selectedRack) {
				const now = Date.now();
				const holdDuration = now - lastMoveTime.current;

				// Accelerate: start at 0.03, after 2 seconds head towards 0.3
				if (holdDuration > 2000) {
					moveSpeedRef.current = Math.min(0.3, moveSpeedRef.current + 0.002);
				} else {
					// Gradual acceleration for first 2 seconds
					moveSpeedRef.current = Math.min(0.12, 0.03 + (holdDuration / 2000) * 0.09);
				}

				const moveStep = moveSpeedRef.current;
				const { camYaw: yaw, camPitch: pitch } = camRef.current;
				const yawRad = (yaw * Math.PI) / 180;
				const pitchRad = (pitch * Math.PI) / 180;

				// Forward/backward direction (includes pitch for true 3D movement)
				const forwardX = -Math.sin(yawRad) * Math.cos(pitchRad);
				const forwardY = Math.sin(pitchRad);
				const forwardZ = -Math.cos(yawRad) * Math.cos(pitchRad);

				// Right direction (perpendicular to forward, on horizontal plane)
				const rightX = Math.cos(yawRad);
				const rightZ = -Math.sin(yawRad);

				setCamPos(v => {
					const newPos = { ...v };
					if (keysPressed.current.has('KeyW')) {
						newPos.x += forwardX * moveStep;
						newPos.y += forwardY * moveStep;
						newPos.z += forwardZ * moveStep;
					}
					if (keysPressed.current.has('KeyS')) {
						newPos.x -= forwardX * moveStep;
						newPos.y -= forwardY * moveStep;
						newPos.z -= forwardZ * moveStep;
					}
					if (keysPressed.current.has('KeyA')) {
						newPos.x -= rightX * moveStep;
						newPos.z -= rightZ * moveStep;
					}
					if (keysPressed.current.has('KeyD')) {
						newPos.x += rightX * moveStep;
						newPos.z += rightZ * moveStep;
					}
					if (keysPressed.current.has('KeyQ')) {
						newPos.y -= moveStep;
					}
					if (keysPressed.current.has('KeyE')) {
						newPos.y += moveStep;
					}
					return clampCamPos(newPos);
				});
			}

			animationId = requestAnimationFrame(updateMovement);
		}

		animationId = requestAnimationFrame(updateMovement);

		return () => cancelAnimationFrame(animationId);
	}, [selectedRack, clampCamPos]);

	// ── Mouse drag: look around (left/middle) or pan (right/Alt) ─────────────
	const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; mode: 'look' | 'pan' }>({ active: false, lastX: 0, lastY: 0, mode: 'look' });
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!aframeReady) return;

		let mounted = true;
		let attempts = 0;
		const maxAttempts = 20;
		let cleanup: (() => void) | null = null;

		const attachListeners = () => {
			const container = containerRef.current;

			if (!container) {
				if (mounted && attempts < maxAttempts) {
					attempts++;
					setTimeout(attachListeners, 100);
				}
				return;
			}

			function onMouseDown(e: MouseEvent) {
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
					// drag right = look right (positive yaw change)
					setCamYaw(v => (v - dx * 0.4 + 360) % 360);
					setCamPitch(v => Math.max(-85, Math.min(85, v - dy * 0.3)));
				} else {
					const { camYaw: yaw } = camRef.current;
					const yr = (yaw * Math.PI) / 180;
					const rx = Math.cos(yr);
					const rz = -Math.sin(yr);
					const speed = 0.04;
					setCamPos(v => clampCamPos({
						x: v.x - dx * rx * speed,
						y: v.y + dy * speed,
						z: v.z - dx * rz * speed,
					}));
				}
			}

			function onMouseUp() {
				dragRef.current.active = false;
			}

			function onWheel(e: WheelEvent) {
				e.preventDefault();
				// Dolly the camera along its look direction
				const { camYaw: yaw, camPitch: pitch } = camRef.current;
				const yawRad = (yaw * Math.PI) / 180;
				const pitchRad = (pitch * Math.PI) / 180;
				const step = -e.deltaY * 0.02;
				setCamPos(v => clampCamPos({
					x: v.x + (-Math.sin(yawRad) * Math.cos(pitchRad)) * step,
					y: v.y + Math.sin(pitchRad) * step,
					z: v.z + (-Math.cos(yawRad) * Math.cos(pitchRad)) * step,
				}));
			}

			function onContextMenu(e: Event) { e.preventDefault(); }
			function onAuxClick(e: Event) { e.preventDefault(); }

			if (!mounted) return;

			container.addEventListener('mousedown', onMouseDown);
			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mouseup', onMouseUp);
			container.addEventListener('wheel', onWheel, { passive: false });
			container.addEventListener('contextmenu', onContextMenu);
			container.addEventListener('auxclick', onAuxClick);

			cleanup = () => {
				container.removeEventListener('mousedown', onMouseDown);
				window.removeEventListener('mousemove', onMouseMove);
				window.removeEventListener('mouseup', onMouseUp);
				container.removeEventListener('wheel', onWheel);
				container.removeEventListener('contextmenu', onContextMenu);
				container.removeEventListener('auxclick', onAuxClick);
			};
		};

		attachListeners();

		return () => {
			mounted = false;
			if (cleanup) cleanup();
		};
	}, [clampCamPos, aframeReady]);

	// ── Click → select box/rack · double-click → centre view on rack ─────────
	const sceneRef = useRef<HTMLElement & EventTarget>(null);
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		function handler(e: Event) {
			const ce = e as CustomEvent;
			const el = ce.detail?.intersection?.object?.el as HTMLElement | undefined;
			let rackId: string | null = null;
			let shelfId: string | null = null;
			let boxId: string | null = null;
			if (el) {
				let node: HTMLElement | null = el;
				while (node) {
					const bid = node.getAttribute('data-box-id');
					if (bid && !boxId) boxId = bid;
					const sid = node.getAttribute('data-shelf-id');
					if (sid && sid !== '') shelfId = sid;
					const rid = node.getAttribute('data-rack-id');
					if (rid) { rackId = rid; break; }
					node = node.parentElement;
				}
			}

			// Box click: show its contents, and select the parent rack when present
			if (boxId) {
				let found: IStorageBox | null = null;
				for (const list of Object.values(shelfBoxes)) {
					const match = list.find(b => b.id === boxId);
					if (match) { found = match; break; }
				}
				if (!found) found = floorBoxes.find(b => b.id === boxId) ?? null;
				setSelectedBox(found);
				if (rackId) setSelectedRack(rackId);
				lastClickRef.current = { rackId: boxId, time: Date.now() };
				return;
			}

			const now = Date.now();
			const isDoubleClick =
				(rackId !== null || shelfId !== null) &&
				now - lastClickRef.current.time < 400 &&
				(lastClickRef.current.rackId === rackId || lastClickRef.current.rackId === shelfId);
			lastClickRef.current = { rackId: shelfId || rackId, time: now };

			if (isDoubleClick && shelfId) {
				// Find the parent rack to select it (no camera movement)
				for (const [rid, rshelves] of Object.entries(rackShelves)) {
					if (rshelves.findIndex(s => s.id === shelfId) !== -1) {
						setSelectedRack(rid);
						break;
					}
				}
				return;
			}

			if (isDoubleClick && rackId) {
				// Centre view on rack: look at it and move closer
				const p = rackPosRef.current[rackId];
				if (p) {
					const cam = camRef.current;
					const rackH = 1.0; // approximate rack centre height
					const dx = p.x - cam.camPos.x;
					const dy = rackH - cam.camPos.y;
					const dz = p.z - cam.camPos.z;
					const hDist = Math.sqrt(dx * dx + dz * dz);
					const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
					// A-Frame yaw 0 faces −Z, so aim with the negated direction vector
					const newYaw = ((Math.atan2(-dx, -dz) * 180) / Math.PI + 360) % 360;
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

			// Just select rack, don't change view
			setSelectedBox(null);
			if (rackId) { setSelectedRack(rackId); } else { setSelectedRack(null); }
		}
		scene.addEventListener('click', handler);
		return () => scene.removeEventListener('click', handler);
	}, [aframeReady, clampCamPos, rackShelves, shelfBoxes, floorBoxes]);

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
		// A-Frame yaw 0 faces −Z, so aim with the negated direction vector
		const newYaw = ((Math.atan2(-dx, -dz) * 180) / Math.PI + 360) % 360;
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
		setSceneError(null);
		try {
			const racksRes = await racksApi.list();
			const allRacks = extractList<WarehouseRack>(racksRes.data);
			const counts: Record<string, number> = {};
			allRacks.forEach(r => { counts[r.floorId] = (counts[r.floorId] ?? 0) + 1; });
			setFloorRackCounts(counts);
			const results = floors.map((floor) => {
				const rackList = allRacks.filter(rack => rack.floorId === floor.id);
				const dims = floorSceneDims(floor);
				const { rackShelves: rs, shelfBoxes: sb } = groupRackShelves(rackList);
				const pos: Record<string, { x: number; z: number; rotY: number }> = {};
				rackList.forEach((r, i) => {
					const def = defaultRackPos(i, dims.w, dims.d);
					pos[r.id] = {
						x: r.posX ?? def.x,
						z: r.posZ ?? def.z,
						rotY: r.rotY ?? 0,
					};
				});
				return { floor, racks: rackList, rackShelves: rs, shelfBoxes: sb, rackPos: pos };
			});
			setOverviewData(results);
		} catch {
			setSceneError('All-floor overview could not be loaded.');
			const fallback = floors.map((floor) => {
				const rackList = floor.id === selectedFloor ? (racks as WarehouseRack[]) : [];
				const dims = floorSceneDims(floor);
				const pos: Record<string, { x: number; z: number; rotY: number }> = {};
				rackList.forEach((r, i) => {
					const def = defaultRackPos(i, dims.w, dims.d);
					pos[r.id] = {
						x: r.posX ?? def.x,
						z: r.posZ ?? def.z,
						rotY: r.rotY ?? 0,
					};
				});
				return { floor, racks: rackList, rackShelves: floor.id === selectedFloor ? rackShelves : {}, shelfBoxes: floor.id === selectedFloor ? shelfBoxes : {}, rackPos: pos };
			});
			setOverviewData(fallback);
		} finally {
			setOverviewLoading(false);
		}
	}, [floors, racks, selectedFloor, rackShelves, shelfBoxes]);

	// ── Overview layout: branches as columns, floors stacked by number ───────
	const overviewLayout = useMemo(() => {
		const byBranch = new Map<string, { name: string; items: OverviewFloorData[] }>();
		overviewData.forEach(fd => {
			const key = fd.floor.branchId ?? 'unknown';
			if (!byBranch.has(key)) byBranch.set(key, { name: fd.floor.branch?.name ?? 'Branch', items: [] });
			byBranch.get(key)!.items.push(fd);
		});

		let cursorX = 0;
		let maxD = DEFAULT_FLOOR_WIDTH;
		let maxY = 0;
		const placed: Array<OverviewFloorData & { x: number; y: number; w: number; d: number }> = [];
		const branchLabels: Array<{ key: string; name: string; x: number; y: number }> = [];

		byBranch.forEach(({ name, items }, key) => {
			const colW = Math.max(...items.map(fd => floorSceneDims(fd.floor).w));
			const cx = cursorX + colW / 2;
			let topY = 0;
			[...items].sort((a, b) => (a.floor.floorNumber ?? 1) - (b.floor.floorNumber ?? 1)).forEach(fd => {
				const dims = floorSceneDims(fd.floor);
				const y = Math.max(0, ((fd.floor.floorNumber ?? 1) - 1)) * STOREY_HEIGHT;
				placed.push({ ...fd, x: cx, y, w: dims.w, d: dims.d });
				topY = Math.max(topY, y);
				maxD = Math.max(maxD, dims.d);
				maxY = Math.max(maxY, y);
			});
			branchLabels.push({ key, name, x: cx, y: topY + STOREY_HEIGHT * 0.9 });
			cursorX += colW + OVERVIEW_GAP;
		});

		return { placed, branchLabels, totalW: Math.max(0, cursorX - OVERVIEW_GAP), maxD, maxY };
	}, [overviewData]);

	// ── Fit camera + bounds to the overview layout ───────────────────────────
	const fitOverviewCamera = useCallback(() => {
		const { totalW, maxD, maxY } = overviewLayout;
		if (totalW <= 0) return;
		const span = Math.max(totalW, maxD);
		const camY = Math.max(12, maxY + span * 0.4);
		boundsRef.current = {
			minX: -span * 0.5,
			maxX: totalW + span * 0.5,
			minZ: -maxD / 2 - span,
			maxZ: maxD / 2 + span,
			maxY: camY + 30,
		};
		setCamPos({ x: totalW / 2, y: camY, z: maxD / 2 + camY * 0.8 });
		setCamYaw(0);
		setCamPitch(-40);
	}, [overviewLayout]);

	useEffect(() => {
		if (viewMode === 'overview' && overviewData.length > 0) fitOverviewCamera();
	}, [viewMode, overviewData.length, fitOverviewCamera]);

	// ── Switch to overview mode ───────────────────────────────────────────────
	const enterOverview = useCallback(() => {
		setViewMode('overview');
		setSelectedRack(null);
		setSelectedBox(null);
		loadOverview();
	}, [loadOverview]);

	// ── Box detail helpers ────────────────────────────────────────────────────
	const describeBoxLocation = useCallback((box: IStorageBox): string => {
		if (box.shelfId) {
			for (const [rid, list] of Object.entries(rackShelves)) {
				const shelf = list.find(s => s.id === box.shelfId);
				if (shelf) {
					const rack = racks.find(r => r.id === rid);
					return `${shelf.name}${rack ? ` · ${rack.name}` : ''}`;
				}
			}
			return box.shelf?.name ?? 'Shelf';
		}
		return 'Floor level';
	}, [rackShelves, racks]);

	// ── A-Frame ready ─────────────────────────────────────────────────────────
	useEffect(() => {
		ensureAframe().then(() => { setTimeout(() => setAframeReady(true), 50); });
	}, []);

	// ── Keep the embedded canvas sized to its container ──────────────────────
	// A-Frame only recalculates the canvas on window resize, so layout-driven
	// changes (bottom rack panel appearing, sidebar collapse, or the container
	// measuring 0px at scene init) leave a stale or blank canvas until the
	// window is resized — the "white screen until fullscreen" symptom.
	useEffect(() => {
		if (!aframeReady) return;
		const container = containerRef.current;
		const scene = sceneRef.current as any;
		if (!container || !scene) return;
		const doResize = () => {
			if (typeof scene.resize === 'function') scene.resize();
			else window.dispatchEvent(new Event('resize'));
		};
		if (scene.hasLoaded) doResize();
		else scene.addEventListener('loaded', doResize, { once: true });
		const observer = new ResizeObserver(doResize);
		observer.observe(container);
		const t1 = setTimeout(doResize, 200);
		const t2 = setTimeout(doResize, 1000);
		return () => { observer.disconnect(); clearTimeout(t1); clearTimeout(t2); };
	}, [aframeReady]);

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

	const floorOptions = floors.map(f => {
		const count = floorRackCounts[f.id] ?? 0;
		const branchName = f.branch?.name ? `${f.branch.name} — ` : '';
		return {
			value: f.id,
			label: `${branchName}${f.name}${count > 0 ? ` (${count} rack${count !== 1 ? 's' : ''})` : ''}`,
		};
	});

	const selectedBoxProducts = selectedBox ? (productsByBox[selectedBox.id] ?? []) : [];

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
						<div style={{ width: '280px' }}>
							<SearchableSelect
								options={floorOptions}
								value={selectedFloor}
								onChange={(val) => { if (val) { setSelectedFloor(val); setViewMode('single'); } }}
								isClearable={false}
								placeholder="Select zone…"
							/>
						</div>
					</>
				)}

				<span className="text-gray-500">|</span>

				{/* Camera height quick-adjust */}
				<label className="font-semibold text-gray-300 text-xs">Height:</label>
				<input type="range" min={0.5} max={60} step={0.5} value={Math.min(camPos.y, 60)} onChange={e => setCamPos(v => clampCamPos({ ...v, y: Number(e.target.value) }))} className="w-20" />
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
							<button onClick={() => moveRack(0, GRID)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">▼</button>
							<button onClick={() => moveRack(-GRID, 0)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">◄</button>
							<button onClick={() => moveRack(GRID, 0)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">►</button>
							<button onClick={() => rotateRack(-45)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↺</button>
							<button onClick={() => rotateRack(45)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">↻</button>
							<button onClick={() => focusOnRack(selectedRack)} className="px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs">🔍 Focus</button>
							<button onClick={() => setSelectedRack(null)} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs">✕</button>
						</div>
					</>
				) : (
					<span className="text-gray-400 text-xs italic">
						{viewMode === 'overview'
							? 'WASD=move · Q/E=down/up · Drag to look · Right/Alt-drag to pan · Scroll zoom'
							: 'WASD=move · Q/E=down/up · Drag to look · Scroll zoom · Click a box for contents · Double-click rack to centre'}
					</span>
				)}

				{/* Reset view */}
				<button
					onClick={() => {
						if (viewMode === 'overview') {
							fitOverviewCamera();
						} else {
							fitCameraToFloor(floorW, floorD);
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
				<span><span style={{ color: PRODUCT_COLOUR }}>■</span> Product (loose)</span>
				<span><span style={{ color: SELECTED_COLOUR }}>■</span> Selected</span>
				<span className="text-gray-500">Grid: {GRID} m · 1 unit = 1 m</span>
				<span className="text-gray-500">Positions saved to DB</span>
			</div>

			{/* ── 3-D scene ─────────────────────────────────────────────────── */}
			<div
				ref={containerRef}
				className="flex-1 relative select-none"
				style={{ minHeight: 0, cursor: 'grab' }}
			>
				{(floorLoading || sceneError) && (
					<div className="absolute left-3 top-3 z-10 rounded bg-gray-950/85 px-3 py-2 text-xs text-gray-100 shadow">
						{floorLoading ? 'Loading zone layout…' : sceneError}
					</div>
				)}

				{/* Box contents panel */}
				{selectedBox && (
					<div className="absolute right-3 top-3 z-10 w-72 rounded bg-gray-950/90 px-3 py-2 text-xs text-gray-100 shadow-lg">
						<div className="flex items-center justify-between mb-1">
							<span className="font-semibold text-amber-300">📦 {selectedBox.name}</span>
							<button onClick={() => setSelectedBox(null)} className="text-gray-400 hover:text-white px-1">✕</button>
						</div>
						<div className="text-gray-400">Code: {selectedBox.code}</div>
						<div className="text-gray-400">
							Size: {Math.round(dimToMetres(selectedBox.width, 0.4) * 100)} × {Math.round(dimToMetres(selectedBox.height, 0.4) * 100)} × {Math.round(dimToMetres(selectedBox.length, 0.4) * 100)} cm
						</div>
						<div className="text-gray-400 mb-1">Location: {describeBoxLocation(selectedBox)}</div>
						<div className="border-t border-gray-700 pt-1 font-semibold text-gray-300">Products</div>
						{selectedBoxProducts.length === 0 ? (
							<div className="text-gray-500 italic">No products recorded in this box.</div>
						) : (
							<ul className="max-h-40 overflow-y-auto">
								{selectedBoxProducts.map(rec => (
									<li key={rec.id} className="flex justify-between gap-2 py-0.5 border-b border-gray-800 last:border-0">
										<span className="truncate">{rec.sku?.name ?? rec.sku?.skuCode ?? 'Unknown SKU'}</span>
										<span className="text-gray-400 whitespace-nowrap">×{rec.quantity} · {rec.state}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				)}

				{aframeReady && (
					<a-scene
						ref={sceneRef as any}
						embedded
						style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
						renderer="antialias: true; colorManagement: true;"
						vr-mode-ui="enabled: false"
						background="color: #1a1a2e"
					>
						<a-light type="ambient" color="#ffffff" intensity="0.5" />
						<a-light type="directional" color="#ffffff" intensity="0.8" position="5 10 5" />
						<a-light type="hemisphere" color="#87CEEB" ground-color="#B8D4A8" intensity="0.3" />

						{/* Camera – position and rotation fully driven by React state */}
						<a-camera
							position={camPosStr}
							rotation={camRotStr}
							look-controls="enabled: false"
							wasd-controls="enabled: false"
						>
							<a-cursor
								color="#FFD700"
								opacity="0.8"
								scale="0.5 0.5 0.5"
								raycaster="objects: [data-rack-id], [data-box-id]"
							/>
						</a-camera>

						<a-sky color="#1a1a2e" />

						{viewMode === 'single' ? (
							<>
								{/* Floor slab + grid (real recorded dimensions, metres) */}
								<FloorSlab w={floorW} d={floorD} />
								<GridPlane w={floorW} d={floorD} gridSize={Math.max(floorW, floorD) > 40 ? 1 : GRID} />

								{/* Floor label */}
								{currentFloor && (
									<a-text
										value={`Zone: ${currentFloor.branch?.name ? `${currentFloor.branch.name} — ` : ''}${currentFloor.name} (${floorW}m × ${floorD}m)`}
										position={`${-floorW / 2 + 0.5} 0.02 ${-floorD / 2 + 1.2}`}
										rotation="-90 0 0"
										color="#333"
										scale="1.2 1.2 1.2"
										align="left"
									/>
								)}

								{/* Empty-floor hint */}
								{!floorLoading && racks.length === 0 && floorBoxes.length === 0 && (
									<a-text
										value="No racks or boxes in this zone yet"
										position="0 1.5 0"
										align="center"
										color="#FFFFFF"
										scale="1.5 1.5 1.5"
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
											productsByBox={productsByBox}
											productsByShelf={productsByShelf}
											isSelected={selectedRack === rack.id}
											selectedBoxId={selectedBox?.id ?? null}
											posX={pos.x}
											posZ={pos.z}
											rotY={pos.rotY}
										/>
									);
								})}

								{/* Floor-level boxes */}
								{floorBoxes.map((box, i) => (
									<FloorBox
										key={box.id}
										box={box}
										index={i}
										floorW={floorW}
										floorD={floorD}
										productsByBox={productsByBox}
										selectedBoxId={selectedBox?.id ?? null}
									/>
								))}

								{/* Products placed on the floor without a box or shelf */}
								{floorProducts.map((rec, i) => (
									<a-box
										key={rec.id}
										position={`${-floorW / 2 + 1 + (i % 20) * 0.6} 0.125 ${floorD / 2 - 2.4 - Math.floor(i / 20) * 0.6}`}
										width="0.25"
										height="0.25"
										depth="0.25"
										color={PRODUCT_COLOUR}
										roughness="0.6"
									>
										<a-text value={`${(rec.sku?.name ?? 'SKU').slice(0, 12)} x${rec.quantity}`} position="0 0.25 0" align="center" color="#0E5953" scale="0.25 0.25 0.25" width="4" />
									</a-box>
								))}
							</>
						) : (
							/* ── All-floors overview: branch columns, stacked storeys ── */
							<>
								{overviewLayout.placed.map((fd) => (
									<a-entity key={fd.floor.id} position={`${fd.x} ${fd.y} 0`}>
										<FloorSlab w={fd.w} d={fd.d} />
										{/* Floor name label (on the slab) */}
										<a-text
											value={`${fd.floor.name}`}
											position={`${-fd.w / 2 + 0.5} 0.02 ${-fd.d / 2 + 1.2}`}
											rotation="-90 0 0"
											color="#333"
											scale="1.2 1.2 1.2"
											align="left"
										/>
										{/* Racks on this floor */}
										{fd.racks.map(rack => {
											const pos = fd.rackPos[rack.id] ?? { x: 0, z: 0, rotY: 0 };
											return (
												<RackEntity
													key={rack.id}
													rack={rack}
													shelves={fd.rackShelves[rack.id] ?? []}
													shelfBoxes={fd.shelfBoxes}
													productsByBox={{}}
													productsByShelf={{}}
													isSelected={false}
													selectedBoxId={null}
													posX={pos.x}
													posZ={pos.z}
													rotY={pos.rotY}
												/>
											);
										})}
									</a-entity>
								))}
								{/* Branch labels above each column */}
								{overviewLayout.branchLabels.map(label => (
									<a-text
										key={label.key}
										value={label.name}
										position={`${label.x} ${label.y + STOREY_HEIGHT} 0`}
										align="center"
										color="#AADDFF"
										scale="2 2 2"
										width="10"
									/>
								))}
								{overviewLoading && (
									<a-text value="Loading all floors…" position="0 2 0" align="center" color="#FFFFFF" scale="1 1 1" />
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
			{
				viewMode === 'single' && (
					<div className="flex-shrink-0 bg-gray-900 text-white border-t border-gray-700 overflow-x-auto" style={{ maxHeight: '120px' }}>
						<div className="flex gap-2 px-4 py-2">
							{racks.length === 0 && (
								<span className="text-gray-500 text-sm italic">No racks on this zone. Add racks in Branches & Storage.</span>
							)}
							{racks.map(rack => {
								const pos = rackPos[rack.id] ?? { x: 0, z: 0, rotY: 0 };
								const shCount = (rackShelves[rack.id] ?? []).length;
								const isSel = selectedRack === rack.id;
								return (
									<button
										key={rack.id}
										onClick={() => { setSelectedRack(isSel ? null : rack.id); if (!isSel) focusOnRack(rack.id); }}
										className={`flex flex-col items-start px-3 py-2 rounded text-xs border transition-colors flex-shrink-0 ${isSel ? 'border-yellow-400 bg-yellow-900/40 text-yellow-300' : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
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
				)
			}

			{/* ── Overview floor list ───────────────────────────────────────── */}
			{
				viewMode === 'overview' && (
					<div className="flex-shrink-0 bg-gray-900 text-white border-t border-gray-700 overflow-x-auto" style={{ maxHeight: '80px' }}>
						<div className="flex gap-2 px-4 py-2 items-center">
							<span className="text-gray-400 text-xs font-semibold mr-2">Floors:</span>
							{overviewLoading && <span className="text-gray-500 text-xs italic">Loading…</span>}
							{overviewData.map((fd) => (
								<button
									key={fd.floor.id}
									onClick={() => {
										// Switch to single-floor view for this floor
										setViewMode('single');
										setSelectedFloor(fd.floor.id);
									}}
									className="flex items-center gap-1 px-3 py-1 rounded text-xs border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 flex-shrink-0"
								>
									<span className="text-blue-400 font-bold">{fd.floor.branch?.name ?? ''}</span>
									<span>{fd.floor.name}</span>
									<span className="text-gray-500">({fd.racks.length} rack{fd.racks.length !== 1 ? 's' : ''})</span>
								</button>
							))}
						</div>
					</div>
				)
			}
		</div >
	);
}
