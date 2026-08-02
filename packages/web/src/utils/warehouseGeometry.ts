import type { IShelf, IStorageBox } from '@jingles/shared';

export const CM_TO_METRES = 0.01;

export function centimetresToMetres(value: number | null | undefined, fallbackM: number): number {
  return value != null && Number.isFinite(value) && value > 0 ? value * CM_TO_METRES : fallbackM;
}

export function orderedShelves(shelves: IShelf[]): IShelf[] {
  return [...shelves].sort((a, b) => {
    const levelA = a.levelIndex ?? Number.MAX_SAFE_INTEGER;
    const levelB = b.levelIndex ?? Number.MAX_SAFE_INTEGER;
    if (levelA !== levelB) return levelA - levelB;
    const elevationA = a.elevationCm ?? Number.MAX_SAFE_INTEGER;
    const elevationB = b.elevationCm ?? Number.MAX_SAFE_INTEGER;
    if (elevationA !== elevationB) return elevationA - elevationB;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

export function shelfBoardElevation(shelf: IShelf, index: number, rackHeightM: number, shelfCount: number): number {
  const fallback = shelfCount > 0 ? (index * rackHeightM) / shelfCount : 0;
  const requested = shelf.elevationCm != null ? shelf.elevationCm * CM_TO_METRES : fallback;
  return Math.max(0, Math.min(rackHeightM, requested));
}

export interface ProductDimensions { length?: number; width?: number; height?: number }

export function aggregateProductDimensions(
  dimensions: ProductDimensions | null | undefined,
  quantity: number,
  maxWidthM: number,
  maxDepthM: number,
) {
  const unitWidth = centimetresToMetres(dimensions?.width, 0.1);
  const unitDepth = centimetresToMetres(dimensions?.length, 0.1);
  const unitHeight = centimetresToMetres(dimensions?.height, 0.1);
  const totalVolume = unitWidth * unitDepth * unitHeight * Math.max(0, quantity);
  const cubeSide = Math.cbrt(Math.max(totalVolume, 0.001));
  const width = Math.min(Math.max(unitWidth, cubeSide), Math.max(unitWidth, maxWidthM));
  const depth = Math.min(Math.max(unitDepth, cubeSide), Math.max(unitDepth, maxDepthM));
  return { width, depth, height: Math.max(unitHeight, totalVolume / (width * depth)), totalVolume };
}

export function layoutFloorBoxes(boxes: IStorageBox[], floorWidthM: number, floorDepthM: number) {
  const placements: Record<string, { x: number; y: number; z: number }> = {};
  let cursorX = -floorWidthM / 2 + 0.5;
  let cursorZ = floorDepthM / 2 - 0.5;
  let rowDepth = 0;
  const gap = 0.15;

  const place = (box: IStorageBox, visiting = new Set<string>()): { x: number; y: number; z: number } => {
    if (placements[box.id]) return placements[box.id];
    const width = centimetresToMetres(box.width, 0.4);
    const height = centimetresToMetres(box.height, 0.4);
    const depth = centimetresToMetres(box.length, 0.4);
    const parent = box.parentBoxId && !visiting.has(box.id) ? boxes.find((candidate) => candidate.id === box.parentBoxId) : null;
    if (parent) {
      visiting.add(box.id);
      const parentPlacement = place(parent, visiting);
      const parentHeight = centimetresToMetres(parent.height, 0.4);
      return (placements[box.id] = {
        x: box.posX ?? parentPlacement.x,
        y: box.posY ?? parentPlacement.y + parentHeight / 2 + height / 2,
        z: box.posZ ?? parentPlacement.z,
      });
    }
    if (box.posX != null || box.posY != null || box.posZ != null) {
      return (placements[box.id] = { x: box.posX ?? 0, y: box.posY ?? height / 2, z: box.posZ ?? 0 });
    }
    if (cursorX + width > floorWidthM / 2 - 0.5) {
      cursorX = -floorWidthM / 2 + 0.5;
      cursorZ -= rowDepth + gap;
      rowDepth = 0;
    }
    const placement = { x: cursorX + width / 2, y: height / 2, z: cursorZ - depth / 2 };
    cursorX += width + gap;
    rowDepth = Math.max(rowDepth, depth);
    placements[box.id] = placement;
    return placement;
  };
  boxes.forEach((box) => place(box));
  return placements;
}
